const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("ResuTransformer backend running 🚀");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});
