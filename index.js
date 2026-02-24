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
const os = require("os");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

/* ================= TEMP DIR ================= */

const TEMP_DIR = path.join(os.tmpdir(), "resutransformer");
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

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

    const type = req.file.mimetype;
    let extractedText = "";

    if (type === "application/pdf") {
      const data = await pdfParse(req.file.buffer);
      extractedText = data.text;
    } else if (type.includes("image")) {
      const result = await Tesseract.recognize(req.file.buffer, "eng");
      extractedText = result.data.text;
    } else if (type.includes("wordprocessingml")) {
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
  } catch (err) {
    console.log("Upload error:", err);
    res.status(500).json({ message: "Error processing file" });
  }
});

/* ================= ANALYZE ================= */

app.post("/analyze", async (req, res) => {
  try {
    const { resumeText, role, pack } = req.body;

    if (!resumeText || !role || !pack) {
      return res.status(400).json({
        message: "resumeText, role and pack are required",
      });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ message: "GROQ_API_KEY not set" });
    }

    const questionCount = pack === "basic" ? 15 : 25;

    const systemPrompt = `
Return ONLY valid JSON.

{
  "scores": {
    "atsScore": 0,
    "recruiterScore": 0,
    "overallScore": 0
  },
  "analysis": {
    "summary": "",
    "strengths": [],
    "weaknesses": [],
    "improvements": []
  }
}

Rules:
- Scores 0-100 integer
- overallScore = rounded (ats*0.4 + recruiter*0.6)
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
        model: "llama-3.1-8b-instant",   // 🔥 STABLE MODEL
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    let aiRaw = response.data.choices[0].message.content;

    let parsed;

    try {
      const match = aiRaw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON found");
      parsed = JSON.parse(match[0]);
    } catch (e) {
      console.log("RAW AI:", aiRaw);

      // 🔥 FALLBACK SAFE RESPONSE
      parsed = {
        scores: {
          atsScore: 60,
          recruiterScore: 65,
          overallScore: 63,
        },
        analysis: {
          summary: "AI response formatting error. Please retry.",
          strengths: [],
          weaknesses: [],
          improvements: [],
        },
      };
    }

    /* ================= PDF ================= */

    const fileName = `report_${Date.now()}.pdf`;
    const filePath = path.join(TEMP_DIR, fileName);

    await new Promise((resolve, reject) => {
      const doc = new PDFDocument();
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      doc.fontSize(20).text("ResuTransformer AI Report", { align: "center" });
      doc.moveDown();

      doc.text(`Role: ${role}`);
      doc.moveDown();

      doc.text(`ATS Score: ${parsed.scores.atsScore}`);
      doc.text(`Recruiter Score: ${parsed.scores.recruiterScore}`);
      doc.text(`Overall Score: ${parsed.scores.overallScore}`);
      doc.moveDown();

      doc.text("Summary:");
      doc.text(parsed.analysis.summary);

      doc.end();

      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    res.json({
      message: "Analysis complete",
      analysis: parsed,
      pdfUrl: `/download/${fileName}`,
    });

  } catch (err) {
    console.log("Analyze crash:", err);
    res.status(500).json({ message: "Server error during analysis" });
  }
});

/* ================= DOWNLOAD ================= */

app.get("/download/:filename", (req, res) => {
  const filePath = path.join(TEMP_DIR, req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "File not found" });
  }

  res.download(filePath, () => {
    fs.unlink(filePath, () => {});
  });
});

/* ================= SERVER ================= */

app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});
