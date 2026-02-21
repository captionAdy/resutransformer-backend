const express = require("express");
const multer = require("multer");
const cors = require("cors");
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const mammoth = require("mammoth");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage });

// ======================
// GEMINI SETUP (v1 SAFE)
// ======================
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// ======================
// ROOT ROUTE
// ======================
app.get("/", (req, res) => {
  res.send("ResuTransformer backend running 🚀");
});

// ======================
// TEST AI ROUTE
// ======================
app.get("/test-ai", async (req, res) => {
  try {
    const result = await model.generateContent("Say hello");
    const response = await result.response;
    const text = response.text();

    res.json({ success: true, reply: text });
  } catch (error) {
    console.error("AI TEST ERROR:", error);
    res.status(500).json({ error: error.message });
  }
});

// ======================
// FILE UPLOAD + EXTRACTION
// ======================
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
    }

    else if (
      fileType === "image/jpeg" ||
      fileType === "image/png" ||
      fileType === "image/jpg"
    ) {
      const result = await Tesseract.recognize(req.file.buffer, "eng");
      extractedText = result.data.text;
    }

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
    console.error("UPLOAD ERROR:", error);
    res.status(500).json({ message: "Error processing file" });
  }
});

// ======================
// AI ANALYSIS ROUTE
// ======================
app.post("/analyze", async (req, res) => {
  try {
    const { resumeText, role } = req.body;

    if (!resumeText || !role) {
      return res.status(400).json({
        message: "Resume text and role are required",
      });
    }

    const prompt = `
You are a professional resume evaluator.

Analyze the resume below for the role: ${role}

Return ONLY valid JSON in this format:

{
  "analysis": {
    "summary": "",
    "strengths": [],
    "weaknesses": [],
    "ats_score": 0
  },
  "improvements": {
    "better_summary": "",
    "improved_experience_points": [],
    "keywords_to_add": []
  },
  "interview_questions": {
    "technical": [],
    "behavioral": [],
    "resume_specific": []
  }
}

Resume:
${resumeText}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    res.json({
      message: "AI analysis complete 🚀",
      data: text,
    });

  } catch (error) {
    console.error("ANALYSIS ERROR:", error);
    res.status(500).json({ message: "AI analysis failed" });
  }
});

app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});
