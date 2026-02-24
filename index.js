const express = require("express");
const multer = require("multer");
const cors = require("cors");
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const mammoth = require("mammoth");
const axios = require("axios");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

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
  try {
    const { resumeText, role, pack, email } = req.body;

    if (!resumeText || !role || !pack || !email) {
      return res.status(400).json({
        message: "resumeText, role, pack and email are required",
      });
    }

    if (pack !== "basic" && pack !== "dominator") {
      return res.status(400).json({
        message: "Pack must be 'basic' or 'dominator'",
      });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({
        message: "GROQ_API_KEY not set",
      });
    }

    const questionCount = pack === "basic" ? 15 : 25;

    const systemPrompt = `
You are ResuTransformer AI.
Return ONLY valid JSON.

Structure:
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
      { "question": "", "answer": "" }
    ]
  }
}

Rules:
- Scores 0-100 integer
- overallScore = rounded (ats*0.4 + recruiter*0.6)
- Generate ${questionCount} interview questions
- If basic, answers empty
- If dominator, structured answers
`;

    const userPrompt = `
Role: ${role}
Pack: ${pack}

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

    let aiRaw = response.data.choices[0].message.content.trim();
    const firstBrace = aiRaw.indexOf("{");
    const lastBrace = aiRaw.lastIndexOf("}");
    const cleanedJson = aiRaw.substring(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(cleanedJson);

    /* ================= PDF GENERATION ================= */

    const fileName = `report_${Date.now()}.pdf`;
    const filePath = path.join(__dirname, fileName);

    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(filePath));

    doc.fontSize(20).text("ResuTransformer AI Resume Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(14).text(`Role: ${role}`);
    doc.text(`Pack: ${pack}`);
    doc.moveDown();

    doc.text(`ATS Score: ${parsed.scores.atsScore}`);
    doc.text(`Recruiter Score: ${parsed.scores.recruiterScore}`);
    doc.text(`Overall Score: ${parsed.scores.overallScore}`);
    doc.moveDown();

    doc.text("Summary:");
    doc.moveDown(0.5);
    doc.fontSize(12).text(parsed.analysis.summary);
    doc.moveDown();

    doc.text("Strengths:");
    parsed.analysis.strengths.forEach((s) => doc.text("- " + s));
    doc.moveDown();

    doc.text("Weaknesses:");
    parsed.analysis.weaknesses.forEach((w) => doc.text("- " + w));

    doc.end();

    /* ================= BREVO EMAIL VIA API ================= */

    const fileBuffer = fs.readFileSync(filePath);
    const base64File = fileBuffer.toString("base64");

    await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: {
          name: "ResuTransformer AI",
          email: process.env.BREVO_SENDER_EMAIL
        },
        to: [{ email: email }],
        subject: "Your Premium Resume Analysis Report",
        htmlContent: `
          <h2>Your Resume Report is Ready</h2>
          <p>Thank you for investing in yourself and becoming a Dominator.</p>
          <p>Your detailed PDF report is attached.</p>
        `,
        attachment: [
          {
            name: fileName,
            content: base64File
          }
        ]
      },
      {
        headers: {
          "api-key": process.env.BREVO_API_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    res.json({
      message: "AI analysis complete and PDF emailed successfully",
      analysis: parsed
    });

  } catch (error) {
    console.log("Analyze error:", error.response?.data || error.message);
    res.status(500).json({
      message: error.response?.data || error.message
    });
  }
});

/* ================= SERVER START ================= */

app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});
