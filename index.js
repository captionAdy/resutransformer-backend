/* ================= ANALYZE ================= */
app.post("/analyze", async (req, res) => {
  console.log("Analyze route hit");

  try {
    const { resumeText, role, pack } = req.body;

    // ✅ Basic validation
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
        message: "GROQ_API_KEY not set in environment variables",
      });
    }

    const trimmedResume = resumeText.trim();

    if (trimmedResume.length < 50) {
      return res.status(400).json({
        message: "Resume text too short",
      });
    }

    // 🔥 Pack logic (for future expansion)
    const questionCount = pack === "basic" ? 15 : 25;

    // ================= SYSTEM PROMPT =================
    const systemPrompt = `
You are ResuTransformer AI.

Return ONLY valid JSON.
No markdown.
No explanation.
No backticks.

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
- All scores must be integers between 0–100.
- overallScore must equal (atsScore * 0.4 + recruiterScore * 0.6) rounded.
- Generate ${questionCount} interview questions.
- If pack is basic, answers must be empty string.
- If pack is dominator, provide professional structured answers.
`;

    const userPrompt = `
Role: ${role}
Pack: ${pack}

Resume:
${trimmedResume}
`;

    // ================= GROQ CALL =================
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

    // Remove markdown if AI adds it
    aiRaw = aiRaw.replace(/```json/g, "").replace(/```/g, "").trim();

    // Extract JSON safely
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
      pack: pack,
      analysis: parsed,
    });

  } catch (error) {
    console.log("Analyze error:", error.response?.data || error.message);
    return res.status(500).json({
      message: error.response?.data || error.message,
    });
  }
});
