const express = require("express");
const multer = require("multer");
const cors = require("cors");
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const mammoth = require("mammoth");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage });

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("ResuTransformer backend running 🚀");
});

// ================= FILE UPLOAD =================
app.post("/upload", upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const fileType = req.file.mimetype;
    let extractedText = "";

    // PDF
    if (fileType === "application/pdf") {
      const data = await pdfParse(req.file.buffer);
      extractedText = data.text;
    }

    // IMAGE
    else if (
      fileType === "image/jpeg" ||
      fileType === "image/png" ||
      fileType === "image/jpg"
    ) {
      const result = await Tesseract.recognize(req.file.buffer, "eng");
      extractedText = result.data.text;
    }

    // DOCX
    else if (
      fileType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({
        buffer: req.file.buffer,
      });
      extractedText = result.value;
    }

    else {
      return res.status(400).json({ message: "Unsupported file type" });
    }

    res.json({
      message: "Text extracted successfully 🚀",
      preview: extractedText.substring(0, 2000),
      fullText: extractedText,
    });

  } catch (error) {
    res.status(500).json({ message: "Error processing file" });
  }
});

// ================= ANALYZE (GROQ) =================
app.post("/analyze", async (req, res) => {
  try {
    const { resumeText, role } = req.body;

    if (!resumeText || !role) {
      return res.status(400).json({
        message: "Resume text and role are required",
      });
    }

    const systemPrompt = `
You are ResuTransformer AI — a strict Resume Intelligence & ATS Evaluation Engine.

Return ONLY valid JSON in this exact structure:

{
  "category_scores": {
    "ats_keyword_optimization": { "score": 0, "reason": "" },
    "skill_relevance": { "score": 0, "reason": "" },
    "impact_quantification": { "score": 0, "reason": "" },
    "formatting_ats_safety": { "score": 0, "reason": "" },
    "logical_structure_flow": { "score": 0, "reason": "" },
    "grammar_language_quality": { "score": 0, "reason": "" },
    "cognitive_readability_simplicity": { "score": 0, "reason": "" },
    "job_alignment_score": { "score": 0, "reason": "" }
  },
  "strengths": [],
  "weaknesses": [],
  "missing_keywords": [],
  "critical_improvements": []
}
`;

    const userPrompt = `
Analyze this resume for the role: ${role}

Resume:
${resumeText}
`;

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama3-70b-8192",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        top_p: 0.8
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const aiRaw = response.data.choices[0].message.content;

    let parsed;
    try {
      parsed = JSON.parse(aiRaw);
    } catch (err) {
      return res.status(500).json({
        message: "AI returned invalid JSON",
        raw: aiRaw
      });
    }

    res.json({
      message: "AI analysis complete",
      analysis: parsed
    });

  } catch (error) {
    res.status(500).json({
      message: error.response?.data || error.message
    });
  }
});

app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});
