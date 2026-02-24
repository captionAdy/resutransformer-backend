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
app.use(express.json({ limit: "10mb" }));

const storage = multer.memoryStorage();
const upload = multer({ storage });

/* ================= ROOT ================= */
app.get("/", (req, res) => {
  res.send("ResuTransformer backend running 🚀");
});

/* ================= FILE UPLOAD ================= */
app.post("/upload", upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const fileType = req.file.mimetype;
    let extractedText = "";

    if (fileType === "application/pdf") {
      const data = await pdfParse(req.file.buffer);
      extractedText = data.text;
    } else if (
      fileType === "image/jpeg" ||
      fileType === "image/png" ||
      fileType === "image/jpg"
    ) {
      const result = await Tesseract.recognize(req.file.buffer, "eng");
      extractedText = result.data.text;
    } else if (
      fileType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({
        buffer: req.file.buffer,
      });
      extractedText = result.value;
    } else {
      return res.status(400).json({ message: "Unsupported file type" });
    }

    res.json({
      message: "Text extracted successfully",
      preview: extractedText.substring(0, 2000),
      fullText: extractedText,
    });
  } catch (error) {
    console.log("Upload error:", error);
    res.status(500).json({ message: "Error processing file" });
  }
});

/* ================= ANALYZE ================= */
app.post("/analyze", async (req, res) => {
  console.log("Analyze route hit");

  try {
    const { resumeText, role } = req.body;

    if (!resumeText || !role) {
      return res.status(400).json({
        message: "Resume text and role are required",
      });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({
        message: "GROQ_API_KEY not set in environment variables",
      });
    }

    const systemPrompt = `
You are ResuTransformer AI — a strict Resume Intelligence & ATS Evaluation Engine.

Return ONLY valid JSON. No markdown. No explanation. No backticks.

Structure must be EXACTLY:

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
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    let aiRaw = response.data.choices[0].message.content;

    // 🔥 Remove markdown formatting
    aiRaw = aiRaw
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    // 🔥 Extract JSON safely
    const firstBrace = aiRaw.indexOf("{");
    const lastBrace = aiRaw.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1) {
      console.log("AI malformed response:", aiRaw);
      return res.status(500).json({
        message: "AI response malformed",
        raw: aiRaw,
      });
    }

    const cleanedJson = aiRaw.substring(firstBrace, lastBrace + 1);

    let parsed;

    try {
      parsed = JSON.parse(cleanedJson);
    } catch (err) {
      console.log("Invalid JSON from AI:", cleanedJson);
      return res.status(500).json({
        message: "AI returned invalid JSON",
        raw: cleanedJson,
      });
    }

    res.json({
      message: "AI analysis complete",
      analysis: parsed,
    });

  } catch (error) {
    console.log("Analyze error:", error.response?.data || error.message);
    res.status(500).json({
      message: error.response?.data || error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});
