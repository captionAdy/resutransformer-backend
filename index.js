const express = require("express");
const multer = require("multer");
const cors = require("cors");
const pdfParse = require("pdf-parse");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.get("/", (req, res) => {
  res.send("ResuTransformer backend running 🚀");
});

app.get("/test-upload", (req, res) => {
  res.json({ message: "Upload route working ✅" });
});

app.post("/upload", upload.single("resume"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  try {
    const data = await pdfParse(req.file.buffer);

    res.json({
      message: "PDF text extracted successfully 🚀",
      preview: data.text.substring(0, 500)
    });

  } catch (error) {
    res.status(500).json({ message: "Error reading PDF" });
  }
});

app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});
