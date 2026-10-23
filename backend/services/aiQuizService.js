// backend/services/aiQuizService.js
const fs = require("fs");
const path = require("path");

const quizzesDir = path.join(__dirname, "..", "data", "quizzes");

// Ensure quizzes folder exists
if (!fs.existsSync(quizzesDir)) {
  fs.mkdirSync(quizzesDir, { recursive: true });
}

/**
 * Resolve API Key, Base URL, and Model
 */
function getApiConfig() {
  const apiKey = (process.env.GROK_API_KEY || process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("AI API Key is missing. Please set GROK_API_KEY or GROQ_API_KEY in backend/.env.");
  }

  // Detect Groq vs xAI Grok
  if (apiKey.startsWith("gsk_")) {
    return {
      apiKey,
      url: "https://api.groq.com/openai/v1/chat/completions",
      // Using high-capability, fast reasoning model available on Groq
      model: process.env.AI_MODEL || "openai/gpt-oss-120b",
      fallbackModel: "qwen/qwen3.8-27b",
      provider: "Groq",
    };
  }

  // xAI Grok API
  return {
    apiKey,
    url: "https://api.x.ai/v1/chat/completions",
    model: process.env.AI_MODEL || "grok-beta",
    fallbackModel: "grok-2",
    provider: "xAI Grok",
  };
}

/**
 * Call the AI chat completions endpoint with automatic fallback
 */
async function callChatCompletion(messages, temperature = 0.5) {
  const config = getApiConfig();

  const tryCall = async (modelName) => {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        temperature,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  };

  try {
    return await tryCall(config.model);
  } catch (err) {
    console.warn(`Primary model ${config.model} failed, attempting fallback ${config.fallbackModel}:`, err.message);
    if (config.fallbackModel && config.fallbackModel !== config.model) {
      return await tryCall(config.fallbackModel);
    }
    throw err;
  }
}

/**
 * Clean & parse JSON output from AI response
 */
function extractJson(rawText) {
  if (!rawText || typeof rawText !== "string") {
    throw new Error("Empty response received from AI model.");
  }

  let cleaned = rawText.trim();
  // Strip Markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // Attempt to locate first { and last }
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const sub = cleaned.substring(firstBrace, lastBrace + 1);
      return JSON.parse(sub);
    }
    throw new Error(`Failed to parse AI output into JSON: ${err.message}. Response was:\n${rawText.slice(0, 300)}`);
  }
}

/**
 * Validate and sanitize generated quiz schema
 */
function sanitizeQuizData(data, defaults = {}) {
  const title = (data.title || defaults.title || "Custom AI Quiz").trim();
  const description = (data.description || defaults.topic || "AI-generated assessment").trim();
  const category = (data.category || defaults.topic || "Custom").trim();
  const durationMinutes = Number(data.durationMinutes || defaults.timeLimit || 10);
  const difficulty = data.difficulty || defaults.difficulty || "Medium";

  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    throw new Error("AI did not generate any questions array.");
  }

  const sanitizedQuestions = data.questions.map((q, idx) => {
    const questionText = (q.question || `Question ${idx + 1}`).trim();
    let options = Array.isArray(q.options) ? q.options.map((opt) => String(opt).trim()) : [];

    if (options.length < 2) {
      options = ["True", "False"];
    }

    let correctAnswer = Number(q.correctAnswer);
    if (isNaN(correctAnswer) || correctAnswer < 0 || correctAnswer >= options.length) {
      correctAnswer = 0;
    }

    const explanation = (q.explanation || "No explanation provided.").trim();

    return {
      id: idx + 1,
      question: questionText,
      options,
      correctAnswer,
      explanation,
    };
  });

  return {
    title,
    description,
    category,
    difficulty,
    durationMinutes,
    questionCount: sanitizedQuestions.length,
    questions: sanitizedQuestions,
  };
}

/**
 * Generate a complete custom quiz using AI
 */
async function generateQuiz({
  title,
  topic,
  numQuestions = 5,
  difficulty = "Medium",
  questionType = "MCQ", // 'MCQ' | 'True/False' | 'Mixed'
  timeLimit = 10,
}) {
  const prompt = `You are an expert educational assessment creator.
Create a structured examination quiz in JSON based on the following specifications:
- Topic / Subject: "${topic || title}"
- Preferred Quiz Title: "${title || topic}"
- Number of Questions: ${numQuestions}
- Difficulty Level: ${difficulty} (Easy, Medium, or Hard)
- Question Format: ${questionType} (Options: MCQ with 4 choices, True/False with 2 choices ["True", "False"], or Mixed)
- Time Limit: ${timeLimit} minutes

STRICT REQUIREMENTS:
1. Return valid JSON only with keys: "title", "description", "category", "difficulty", "durationMinutes", "questions".
2. "questions" must be an array of exactly ${numQuestions} items.
3. Each question item must have:
   - "id": number (1 to ${numQuestions})
   - "question": clear, concise question string
   - "options": array of strings (4 for MCQ, 2 for True/False ["True", "False"])
   - "correctAnswer": 0-indexed number representing the correct option index
   - "explanation": a concise 1-2 sentence explanation of why the correct option is right.
4. Ensure factual accuracy and distinct, plausible distractors for incorrect options.
5. Do NOT include markdown code fences or conversational text outside the JSON.`;

  const messages = [
    {
      role: "system",
      content: "You are a professional quiz generator that strictly responds in valid JSON matching the exact schema requested.",
    },
    {
      role: "user",
      content: prompt,
    },
  ];

  const raw = await callChatCompletion(messages, 0.4);
  const parsed = extractJson(raw);
  return sanitizeQuizData(parsed, { title, topic, difficulty, timeLimit });
}

/**
 * Regenerate a single individual question using AI
 */
async function regenerateQuestion({
  topic,
  difficulty = "Medium",
  questionType = "MCQ",
  existingQuestion = "",
  index = 1,
}) {
  const prompt = `You are an expert assessment writer.
Create a single fresh, alternative question about "${topic}" (Difficulty: ${difficulty}, Type: ${questionType}).
${existingQuestion ? `It must be DIFFERENT from this previous question: "${existingQuestion}".` : ""}

STRICT REQUIREMENTS:
Return valid JSON only for a single question object:
{
  "id": ${index},
  "question": "...",
  "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
  "correctAnswer": 0,
  "explanation": "..."
}`;

  const messages = [
    {
      role: "system",
      content: "You generate a single exam question strictly in valid JSON.",
    },
    {
      role: "user",
      content: prompt,
    },
  ];

  const raw = await callChatCompletion(messages, 0.7);
  const parsed = extractJson(raw);

  const questionText = (parsed.question || "Alternative question").trim();
  let options = Array.isArray(parsed.options) ? parsed.options.map((opt) => String(opt).trim()) : ["True", "False"];
  if (options.length < 2) options = ["True", "False"];
  let correctAnswer = Number(parsed.correctAnswer);
  if (isNaN(correctAnswer) || correctAnswer < 0 || correctAnswer >= options.length) {
    correctAnswer = 0;
  }
  const explanation = (parsed.explanation || "Verified answer.").trim();

  return {
    id: index,
    question: questionText,
    options,
    correctAnswer,
    explanation,
  };
}

module.exports = {
  generateQuiz,
  regenerateQuestion,
};
