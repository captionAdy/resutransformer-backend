const express = require("express");
const multer = require("multer");
const cors = require("cors");
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");
const mammoth = require("mammoth");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.get("/", (req, res) => {
  res.send("ResuTransformer backend running 🚀");
});

app.post("/upload", upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const fileType = req.file.mimetype;

    // ===== PDF =====
    if (fileType === "application/pdf") {
      const data = await pdfParse(req.file.buffer);

      return res.json({
        message: "PDF text extracted successfully 🚀",
        preview: data.text.substring(0, 2000)
      });
    }

    // ===== IMAGE =====
    if (
      fileType === "image/jpeg" ||
      fileType === "image/png" ||
      fileType === "image/jpg"
    ) {
      const result = await Tesseract.recognize(
        req.file.buffer,
        "eng"
      );

      return res.json({
        message: "Image text extracted successfully 🚀",
        preview: result.data.text.substring(0, 2000)
      });
    }

    // ===== DOCX =====
    if (
      fileType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({
        buffer: req.file.buffer
      });

      return res.json({
        message: "Word text extracted successfully 🚀",
        preview: result.value.substring(0, 2000)
      });
    }

    return res.status(400).json({
      message: "Unsupported file type"
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Error processing file"
    });
  }
});

app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});
