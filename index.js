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

/* ================= ROOT ================= */
app.get("/", (req, res) => {
  res.send("ResuTransformer backend running 🚀");
});

/* ================= FILE UPLOAD ================= */
const storage = multer.memoryStorage();
const upload = multer({ storage });

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
    const { resumeText, role, pack } = req.body;

    if (!resumeText || !role || !pack) {
      return res.status(400).json({
        message: "Resume text, role and pack are required",
      });
    }

    if (pack !== "basic" && pack !== "dominator") {
      return res.status(400).json({
        message: "Invalid pack type. Must be 'basic' or 'dominator'",
      });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({
        message: "GROQ_API_KEY not set",
      });
    }

    const trimmedResume = resumeText.trim();
    const questionCount = pack === "basic" ? 15 : 25;

    const systemPrompt = `
You are ResuTransformer AI.
Return ONLY valid JSON. No markdown. No backticks.

Structure must be EXACTLY:

{
  "scores": {
    "atsScore": 0,
    "recruiterScore": 0,
    "overallScore": 0,
    "selectionReadiness": "",
    "resumeCategory": ""
  },
  "analysis": {
    "summary": "",
    "strengths": [],
    "weaknesses": [],
    "improvements": []
  },
  "interview": {
    "questions": [
      {
        "question": "",
        "answer": ""
      }
    ]
  }
}

Rules:
- All scores must be integers between 0-100.
- overallScore = (atsScore * 0.4 + recruiterScore * 0.6) rounded.
- Generate ${questionCount} interview questions.
- If pack is basic, answers must be empty string.
- If pack is dominator, provide structured professional answers.
`;

    const userPrompt = `
Role: ${role}
Pack: ${pack}

Resume:
${trimmedResume}
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

    aiRaw = aiRaw.replace(/```json/g, "").replace(/```/g, "").trim();

    const firstBrace = aiRaw.indexOf("{");
    const lastBrace = aiRaw.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1) {
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
      return res.status(500).json({
        message: "AI returned invalid JSON",
        raw: cleanedJson,
      });
    }

    return res.json({
      message: "AI analysis complete",
      pack,
      analysis: parsed,
    });

  } catch (error) {
    console.log("Analyze error:", error.response?.data || error.message);
    return res.status(500).json({
      message: error.response?.data || error.message,
    });
  }
});

/* ================= SERVER START ================= */
app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});
