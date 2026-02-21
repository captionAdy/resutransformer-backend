const express = require("express");
const multer = require("multer");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.get("/", (req, res) => {
  res.send("ResuTransformer backend running 🚀");
});

app.get("/test", (req, res) => {
  res.json({ status: "Server working perfectly" });
});

app.post("/upload", upload.single("resume"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  res.json({
    message: "File received successfully",
    fileName: req.file.originalname,
    fileSize: req.file.size
  });
});

app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});
