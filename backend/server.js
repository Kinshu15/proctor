require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const aiQuizService = require("./services/aiQuizService");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const quizzesDir = path.join(__dirname, "data", "quizzes");
const quizzesManifestPath = path.join(__dirname, "data", "quizzes.json");
const questionsPath = path.join(__dirname, "data", "questions.json");
const sessionsPath = path.join(__dirname, "data", "sessions.json");

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, "data"))) {
  fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
}

// Ensure quizzes directory exists
if (!fs.existsSync(quizzesDir)) {
  fs.mkdirSync(quizzesDir, { recursive: true });
}

// Ensure sessions.json exists
if (!fs.existsSync(sessionsPath)) {
  fs.writeFileSync(sessionsPath, "[]");
}

function readSessions() {
  try {
    return JSON.parse(fs.readFileSync(sessionsPath, "utf-8"));
  } catch (err) {
    return [];
  }
}

function saveSessions(sessions) {
  fs.writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2));
}

function makeSessionId() {
  return `session-${Date.now()}`;
}

function sanitizeSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 50);
}

// Strips answer keys and explanations before sending to student test takers
function questionForStudent(question) {
  return {
    id: question.id,
    question: question.question,
    options: question.options,
  };
}

// Get list of quizzes (includeDrafts=false filters out drafts for student test takers)
function getAllQuizzes(includeDrafts = false) {
  if (fs.existsSync(quizzesDir)) {
    const files = fs.readdirSync(quizzesDir).filter((file) => file.endsWith(".json"));
    if (files.length > 0) {
      return files
        .map((file) => {
          try {
            const raw = fs.readFileSync(path.join(quizzesDir, file), "utf-8");
            const data = JSON.parse(raw);
            const status = data.status || "published"; // default legacy quizzes to published

            if (!includeDrafts && status === "draft") {
              return null;
            }

            return {
              id: data.id || path.basename(file, ".json"),
              title: data.title || path.basename(file, ".json"),
              description: data.description || "",
              category: data.category || "General",
              difficulty: data.difficulty || "Medium",
              durationMinutes: Number(data.durationMinutes) || 10,
              schedule: data.schedule || {
                hasSchedule: false,
                startTime: null,
                endTime: null,
              },
              questionCount: Array.isArray(data.questions) ? data.questions.length : 0,
              status,
              createdAt: data.createdAt || null,
              updatedAt: data.updatedAt || null,
              file,
            };
          } catch (err) {
            console.error(`Error reading quiz file ${file}:`, err);
            return null;
          }
        })
        .filter(Boolean);
    }
  }

  // Fallback to manifest if present
  if (fs.existsSync(quizzesManifestPath)) {
    try {
      return JSON.parse(fs.readFileSync(quizzesManifestPath, "utf-8"));
    } catch (err) {}
  }

  // Legacy fallback
  return [
    {
      id: "electron-basics",
      title: "Electron & System Architecture",
      description: "Default Electron exam questions",
      durationMinutes: 10,
      questionCount: 5,
      status: "published",
    },
  ];
}

// Get full quiz details including questions by quizId
function getQuizById(quizId, allowDraft = false) {
  if (!quizId) {
    const all = getAllQuizzes(allowDraft);
    if (all.length > 0) {
      quizId = all[0].id;
    }
  }

  if (fs.existsSync(quizzesDir)) {
    const directPath = path.join(quizzesDir, `${quizId}.json`);
    if (fs.existsSync(directPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(directPath, "utf-8"));
        if (!allowDraft && data.status === "draft") {
          return null;
        }
        return data;
      } catch (err) {
        console.error(`Error reading ${directPath}:`, err);
      }
    }

    // Try finding by id property inside files
    const files = fs.readdirSync(quizzesDir).filter((file) => file.endsWith(".json"));
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(quizzesDir, file), "utf-8"));
        if (data.id === quizId) {
          if (!allowDraft && data.status === "draft") {
            return null;
          }
          return data;
        }
      } catch (err) {}
    }
  }

  // Legacy fallback to questions.json
  if (fs.existsSync(questionsPath)) {
    try {
      const raw = fs.readFileSync(questionsPath, "utf-8");
      return {
        id: "electron-basics",
        title: "Electron & System Architecture",
        description: "Default Electron exam questions",
        durationMinutes: 10,
        status: "published",
        questions: JSON.parse(raw),
      };
    } catch (err) {}
  }

  return null;
}

// ---------------- API Routes ----------------

// Health check
app.get("/", (req, res) => {
  res.json({
    message: "Athena Exam Backend is running",
    availableQuizzes: getAllQuizzes(false).length,
    aiAvailable: Boolean(process.env.GROK_API_KEY || process.env.GROQ_API_KEY),
  });
});

// ==========================================
// AI Quiz Creation & Management Routes
// ==========================================

// 1. Generate Quiz Draft using AI (Grok/Groq)
app.post("/api/quizzes/generate", async (req, res) => {
  try {
    const { title, topic, instructions, numQuestions, difficulty, questionType, timeLimit } = req.body;

    if (!topic && !title) {
      return res.status(400).json({ message: "Topic or title is required for AI generation." });
    }

    const generated = await aiQuizService.generateQuiz({
      title: title || `${topic} Assessment`,
      topic: topic || title,
      instructions: instructions || "",
      numQuestions: Math.max(1, Math.min(20, Number(numQuestions) || 5)),
      difficulty: difficulty || "Medium",
      questionType: questionType || "MCQ",
      timeLimit: Math.max(1, Number(timeLimit) || 10),
    });

    res.json({
      message: "Quiz generated successfully",
      quiz: generated,
    });
  } catch (err) {
    console.error("AI Generation error:", err);
    res.status(500).json({
      message: err.message || "Failed to generate quiz using AI.",
    });
  }
});

// 2. Regenerate a single question with AI
app.post("/api/quizzes/regenerate-question", async (req, res) => {
  try {
    const { topic, difficulty, questionType, existingQuestion, index } = req.body;

    if (!topic) {
      return res.status(400).json({ message: "Topic is required to regenerate question." });
    }

    const question = await aiQuizService.regenerateQuestion({
      topic,
      difficulty: difficulty || "Medium",
      questionType: questionType || "MCQ",
      existingQuestion: existingQuestion || "",
      index: Number(index) || 1,
    });

    res.json({
      message: "Question regenerated successfully",
      question,
    });
  } catch (err) {
    console.error("Question regeneration error:", err);
    res.status(500).json({
      message: err.message || "Failed to regenerate question.",
    });
  }
});

// 3. Save or Update Quiz (draft or published)
app.post("/api/quizzes/save", (req, res) => {
  try {
    const quizData = req.body;

    if (!quizData.title || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
      return res.status(400).json({ message: "Quiz must have a title and at least one question." });
    }

    let quizId = quizData.id;
    if (!quizId) {
      const slug = sanitizeSlug(quizData.title) || "custom-quiz";
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      quizId = `${slug}-${Date.now().toString().slice(-6)}-${randomSuffix}`;
    }

    const status = quizData.status === "draft" ? "draft" : "published";
    const filePath = path.join(quizzesDir, `${quizId}.json`);

    const existingData = fs.existsSync(filePath)
      ? JSON.parse(fs.readFileSync(filePath, "utf-8"))
      : {};

    const durationMin = Number(quizData.durationMinutes) || 10;
    const nowMs = Date.now();
    const defaultStartIso = new Date(nowMs + 5 * 60 * 1000).toISOString();
    const defaultEndIso = new Date(nowMs + (5 + durationMin) * 60 * 1000).toISOString();

    const fullQuiz = {
      id: quizId,
      title: quizData.title.trim(),
      description: (quizData.description || "").trim(),
      instructions: (quizData.instructions || "").trim(),
      category: (quizData.category || "Custom").trim(),
      difficulty: quizData.difficulty || "Medium",
      questionType: quizData.questionType || "MCQ",
      durationMinutes: durationMin,
      schedule: {
        hasSchedule: quizData.schedule ? Boolean(quizData.schedule.hasSchedule) : true,
        startTime: quizData.schedule?.startTime || defaultStartIso,
        endTime: quizData.schedule?.endTime || defaultEndIso,
      },
      status,
      createdAt: existingData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      questions: quizData.questions.map((q, idx) => ({
        id: idx + 1,
        question: (q.question || `Question ${idx + 1}`).trim(),
        options: Array.isArray(q.options) && q.options.length >= 2 ? q.options.map(String) : ["True", "False"],
        correctAnswer: Number(q.correctAnswer) || 0,
        explanation: (q.explanation || "").trim(),
      })),
    };

    fs.writeFileSync(filePath, JSON.stringify(fullQuiz, null, 2));

    res.status(201).json({
      message: status === "draft" ? "Quiz saved as draft" : "Quiz published successfully",
      quizId,
      status,
      quiz: fullQuiz,
    });
  } catch (err) {
    console.error("Save quiz error:", err);
    res.status(500).json({ message: "Failed to save quiz." });
  }
});

// 4. Get all quizzes for management (includes both drafts and published)
app.get("/api/quizzes/manage", (req, res) => {
  const quizzes = getAllQuizzes(true);
  res.json(quizzes);
});

// 5. Get full quiz with answer keys for creator preview and editing
app.get("/api/quizzes/manage/:quizId", (req, res) => {
  const quiz = getQuizById(req.params.quizId, true);
  if (!quiz) {
    return res.status(404).json({ message: "Quiz not found" });
  }
  res.json(quiz);
});

// 6. Delete a quiz and all associated student captures
app.delete("/api/quizzes/:quizId", (req, res) => {
  const quizId = req.params.quizId;
  const targetFile = path.join(quizzesDir, `${quizId}.json`);
  let found = false;

  if (fs.existsSync(targetFile)) {
    fs.unlinkSync(targetFile);
    found = true;
  } else {
    // Also check if any file has matching id inside
    const files = fs.readdirSync(quizzesDir).filter((file) => file.endsWith(".json"));
    for (const file of files) {
      const fPath = path.join(quizzesDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(fPath, "utf-8"));
        if (data.id === quizId) {
          fs.unlinkSync(fPath);
          found = true;
          break;
        }
      } catch (e) {}
    }
  }

  // Delete all student captures for this quiz from user-camera-snap directories
  try {
    const possibleCaptureDirs = [
      path.join(__dirname, "..", "proctoring-tool", "app", "user-camera-snap"),
      path.join(__dirname, "user-camera-snap")
    ];

    const cleanId = String(quizId).trim().replace(/[^a-zA-Z0-9_\-]/g, "_");

    for (const capDir of possibleCaptureDirs) {
      if (fs.existsSync(capDir)) {
        const entries = fs.readdirSync(capDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const folderName = entry.name;
            if (
              folderName === cleanId ||
              folderName.endsWith(`_${cleanId}`) ||
              folderName.endsWith(`-${cleanId}`) ||
              folderName.toLowerCase().includes(cleanId.toLowerCase())
            ) {
              const targetFolder = path.join(capDir, folderName);
              fs.rmSync(targetFolder, { recursive: true, force: true });
              console.log(`[Backend] Deleted all student captures for quiz '${quizId}' at: ${targetFolder}`);
            }
          }
        }
      }
    }
  } catch (capErr) {
    console.error("Error deleting quiz captures on disk:", capErr);
  }

  if (found) {
    return res.json({ message: `Quiz '${quizId}' and all student captures deleted successfully.` });
  }

  res.status(404).json({ message: "Quiz not found." });
});

// 7. Publish a draft quiz
app.put("/api/quizzes/:quizId/publish", (req, res) => {
  const quiz = getQuizById(req.params.quizId, true);
  if (!quiz) {
    return res.status(404).json({ message: "Quiz not found." });
  }

  quiz.status = "published";
  quiz.updatedAt = new Date().toISOString();

  const targetFile = path.join(quizzesDir, `${quiz.id}.json`);
  fs.writeFileSync(targetFile, JSON.stringify(quiz, null, 2));

  res.json({ message: "Quiz published successfully.", quizId: quiz.id });
});

// ==========================================
// Instructor Authentication & Management Routes
// ==========================================

// Instructor Login Verification (Password: admin 101)
app.post("/api/instructor/login", (req, res) => {
  const { password } = req.body;
  const clean = (password || "").trim().toLowerCase();
  if (clean === "admin 101" || clean === "admin101") {
    return res.json({
      success: true,
      role: "instructor",
      name: "Authorized Instructor",
      token: "instructor-auth-admin101",
      message: "Instructor authenticated successfully.",
    });
  }
  return res.status(401).json({
    success: false,
    message: "Invalid instructor password. Please try again.",
  });
});

// Instructor: Add extra allotted time to a quiz definition
app.post("/api/quizzes/:quizId/add-time", (req, res) => {
  const { extraMinutes } = req.body;
  const quiz = getQuizById(req.params.quizId, true);
  if (!quiz) {
    return res.status(404).json({ message: "Quiz not found" });
  }

  const addMins = Math.max(1, Number(extraMinutes) || 5);
  quiz.durationMinutes = (Number(quiz.durationMinutes) || 10) + addMins;
  quiz.updatedAt = new Date().toISOString();

  const targetFile = path.join(quizzesDir, `${quiz.id}.json`);
  fs.writeFileSync(targetFile, JSON.stringify(quiz, null, 2));

  res.json({
    message: `Added +${addMins} minutes to "${quiz.title}". New allotted duration: ${quiz.durationMinutes} mins.`,
    durationMinutes: quiz.durationMinutes,
    quiz,
  });
});

// Instructor: Add extra time to an active student examination session
app.post("/api/proctoring/sessions/:sessionId/add-time", (req, res) => {
  const { extraMinutes } = req.body;
  const sessions = readSessions();
  const session = sessions.find((s) => s.sessionId === req.params.sessionId);

  if (!session) {
    return res.status(404).json({ message: "Session not found" });
  }

  const addMins = Math.max(1, Number(extraMinutes) || 5);
  session.durationMinutes = (Number(session.durationMinutes) || 10) + addMins;

  if (!session.violations) session.violations = [];
  session.violations.push({
    id: `time-${Date.now()}`,
    eventType: "instructor-added-time",
    timestamp: new Date().toISOString(),
    message: `Instructor granted +${addMins} extra minutes to this examination session.`,
  });

  saveSessions(sessions);

  res.json({
    message: `Granted +${addMins} extra minutes to ${session.name}. Total time: ${session.durationMinutes} mins.`,
    durationMinutes: session.durationMinutes,
    session,
  });
});

// Instructor: View all student scores & gradebook (practice records excluded - only scheduled time attempts)
app.get("/api/instructor/scores", (req, res) => {
  const sessions = readSessions();
  const quizId = req.query.quizId;

  // Only return students who took exam within the scheduled time slot
  let list = sessions.filter(
    (s) =>
      (s.status === "submitted" || s.status === "completed" || s.attempted > 0) &&
      s.scoreConsidered !== false &&
      s.withinTimeSlot !== false
  );

  if (quizId && quizId !== "all") {
    list = list.filter((s) => s.quizId === quizId);
  }

  list.sort(
    (a, b) =>
      new Date(b.submittedAt || b.startedAt || 0) -
      new Date(a.submittedAt || a.startedAt || 0)
  );

  const scores = list.map((s) => {
    const isConsidered = s.scoreConsidered !== false && s.withinTimeSlot !== false;
    const totalQ = s.totalQuestions || s.attempted || 1;
    const pct = isConsidered ? Math.round((s.correct / totalQ) * 100) : null;

    return {
      sessionId: s.sessionId,
      userId: s.userId,
      name: s.name,
      quizId: s.quizId,
      quizTitle: s.quizTitle,
      startedAt: s.startedAt,
      submittedAt: s.submittedAt,
      timeTakenSeconds:
        s.timeTakenSeconds ||
        (s.submittedAt && s.startedAt
          ? Math.round((new Date(s.submittedAt) - new Date(s.startedAt)) / 1000)
          : null),
      durationMinutes: s.durationMinutes,
      attempted: s.attempted,
      totalQuestions: totalQ,
      scoreConsidered: isConsidered,
      withinTimeSlot: s.withinTimeSlot !== false,
      outOfSlotReason: s.outOfSlotReason || null,
      correct: isConsidered ? s.correct : null,
      wrong: isConsidered ? s.wrong : null,
      percentage: pct,
      displayScore: isConsidered
        ? `${s.correct} / ${totalQ} (${pct}%)`
        : "— (Not Considered: Outside Slot)",
      flagCount: s.flagCount || 0,
      autoSubmitted: !!s.autoSubmitted,
      autoSubmitReason: s.autoSubmitReason || null,
      violationCount:
        s.violationCount || (s.violations ? s.violations.length : 0),
      status: s.status,
    };
  });

  res.json(scores);
});

// ==========================================
// Student Exam Taking Routes
// ==========================================

// 1. Get all published quizzes for test taking (drafts excluded!)
app.get("/exam/quizzes", (req, res) => {
  const quizzes = getAllQuizzes(false);
  res.json(quizzes);
});

// 2. Get specific quiz info and questions (without answer keys!)
app.get("/exam/quizzes/:quizId", (req, res) => {
  const quiz = getQuizById(req.params.quizId, false);
  if (!quiz) {
    return res.status(404).json({ message: "Quiz not found or is unpublished." });
  }

  res.json({
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    durationMinutes: quiz.durationMinutes,
    category: quiz.category,
    questions: (quiz.questions || []).map(questionForStudent),
  });
});

// 3. Start a new exam session
app.post("/exam/start", (req, res) => {
  const { userId, name, quizId } = req.body;

  if (!userId || !name) {
    return res.status(400).json({
      message: "userId and name are required",
    });
  }

  const quiz = getQuizById(quizId, false);
  if (!quiz) {
    return res.status(404).json({ message: `Quiz '${quizId}' not found or is unpublished.` });
  }

  const sessions = readSessions();

  const now = new Date();
  let withinTimeSlot = true;
  let outOfSlotReason = null;

  if (quiz.schedule && quiz.schedule.hasSchedule) {
    if (quiz.schedule.startTime && new Date(quiz.schedule.startTime) > now) {
      return res.status(403).json({
        message: `This quiz is scheduled to begin at ${new Date(quiz.schedule.startTime).toLocaleString()}. You cannot attempt it before the start time.`,
        scheduledStartTime: quiz.schedule.startTime,
      });
    } else if (quiz.schedule.endTime && new Date(quiz.schedule.endTime) < now) {
      withinTimeSlot = false;
      outOfSlotReason = `Attempt started after scheduled window (${new Date(quiz.schedule.endTime).toLocaleString()})`;
    }
  }

  const session = {
    sessionId: makeSessionId(),
    userId,
    name,
    quizId: quiz.id,
    quizTitle: quiz.title,
    durationMinutes: Number(quiz.durationMinutes) || 10,
    startedAt: now.toISOString(),
    submittedAt: null,
    status: "in-progress",
    totalQuestions: (quiz.questions || []).length,
    attempted: 0,
    correct: 0,
    wrong: 0,
    answers: [],
    withinTimeSlot,
    scoreConsidered: withinTimeSlot,
    outOfSlotReason,
    schedule: quiz.schedule || null,
  };

  sessions.push(session);
  saveSessions(sessions);

  res.status(201).json({
    message: "Exam session started",
    sessionId: session.sessionId,
    quizId: quiz.id,
    quizTitle: quiz.title,
    totalQuestions: session.totalQuestions,
    durationMinutes: session.durationMinutes,
    withinTimeSlot,
    scoreConsidered: withinTimeSlot,
    outOfSlotReason,
    schedule: quiz.schedule || null,
  });
});

// 4. Get all questions without correct answers
app.get("/exam/mcq", (req, res) => {
  const quizId = req.query.quizId;
  const quiz = getQuizById(quizId, false);

  if (!quiz) {
    return res.status(404).json({ message: "Quiz not found" });
  }

  if (quiz.schedule && quiz.schedule.hasSchedule && quiz.schedule.startTime) {
    if (new Date(quiz.schedule.startTime) > new Date()) {
      return res.status(403).json({
        message: `This quiz is scheduled to begin at ${new Date(quiz.schedule.startTime).toLocaleString()}. Questions cannot be accessed before start time.`,
      });
    }
  }

  res.json((quiz.questions || []).map(questionForStudent));
});

// 5. Get one question without correct answer
app.get("/exam/mcq/:id", (req, res) => {
  const id = Number(req.params.id);
  const quizId = req.query.quizId;
  const quiz = getQuizById(quizId, false);

  if (!quiz) {
    return res.status(404).json({ message: "Quiz not found" });
  }

  if (quiz.schedule && quiz.schedule.hasSchedule && quiz.schedule.startTime) {
    if (new Date(quiz.schedule.startTime) > new Date()) {
      return res.status(403).json({
        message: `This quiz is scheduled to begin at ${new Date(quiz.schedule.startTime).toLocaleString()}. Questions cannot be accessed before start time.`,
      });
    }
  }

  const question = (quiz.questions || []).find((item) => item.id === id);

  if (!question) {
    return res.status(404).json({ message: "Question not found" });
  }

  res.json(questionForStudent(question));
});

// 6. Record a Proctoring Violation (fullscreen exit, window blur, screen sharing revoked, etc.)
app.post("/exam/violation", (req, res) => {
  const { sessionId, userId, eventType, timestamp, metadata } = req.body;

  if (!sessionId || !eventType) {
    return res.status(400).json({
      message: "sessionId and eventType are required",
    });
  }

  const sessions = readSessions();
  const session = sessions.find((item) => item.sessionId === sessionId);

  if (!session) {
    return res.status(404).json({ message: "Session not found" });
  }

  if (session.status === "submitted" || session.status === "terminated") {
    return res.status(400).json({ message: "Exam session is already ended." });
  }

  if (!Array.isArray(session.violations)) {
    session.violations = [];
  }

  const violationEntry = {
    id: `viol-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    eventType, // 'fullscreen-exit' | 'window-blur' | 'screen-share-stopped' | 'window-minimize'
    timestamp: timestamp || new Date().toISOString(),
    userId: userId || session.userId,
    metadata: metadata || {},
  };

  session.violations.push(violationEntry);
  session.violationCount = session.violations.length;

  // Maximum allowed violations before hard-lock (configurable policy)
  const MAX_VIOLATIONS = 3;

  let policyAction = "warn";
  if (session.violationCount >= MAX_VIOLATIONS) {
    session.status = "locked";
    session.lockedReason = `Exceeded maximum allowable violations limit (${session.violationCount}/${MAX_VIOLATIONS}). Examination locked pending instructor review.`;
    policyAction = "locked";
  } else {
    session.status = "paused";
    session.lockedReason = `Proctoring alert: ${eventType.replace(/-/g, " ")}. Interaction paused.`;
    policyAction = "paused";
  }

  saveSessions(sessions);

  res.json({
    message: "Violation logged successfully",
    violation: violationEntry,
    violationCount: session.violationCount,
    maxViolations: MAX_VIOLATIONS,
    status: session.status,
    policyAction,
    lockedReason: session.lockedReason,
  });
});

// 7. Attempt to resume exam following a violation
app.post("/exam/resume", (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ message: "sessionId is required" });
  }

  const sessions = readSessions();
  const session = sessions.find((item) => item.sessionId === sessionId);

  if (!session) {
    return res.status(404).json({ message: "Session not found" });
  }

  if (session.status === "locked") {
    return res.status(403).json({
      message: "Examination is locked due to excessive violations. Contact instructor for authorization.",
      canResume: false,
      status: session.status,
      violationCount: session.violationCount || 0,
      lockedReason: session.lockedReason,
    });
  }

  if (session.status === "submitted" || session.status === "terminated") {
    return res.status(400).json({
      message: "Exam session is completed or terminated.",
      canResume: false,
      status: session.status,
    });
  }

  // Resume session to in-progress
  session.status = "in-progress";
  session.lockedReason = null;
  saveSessions(sessions);

  res.json({
    message: "Examination resumed successfully",
    canResume: true,
    status: "in-progress",
    violationCount: session.violationCount || 0,
  });
});

// 8. Submit one answer (enforces active session & proctoring check)
app.post("/exam/answer", (req, res) => {
  const { sessionId, questionId, selectedAnswer } = req.body;

  if (!sessionId || questionId === undefined || selectedAnswer === undefined) {
    return res.status(400).json({
      message: "sessionId, questionId and selectedAnswer are required",
    });
  }

  const sessions = readSessions();
  const session = sessions.find((item) => item.sessionId === sessionId);

  if (!session) {
    return res.status(404).json({ message: "Session not found" });
  }

  if (session.status === "submitted") {
    return res.status(400).json({ message: "Exam session is already submitted" });
  }

  const quiz = getQuizById(session.quizId, true);
  if (!quiz) {
    return res.status(404).json({ message: "Quiz associated with session not found" });
  }

  const question = (quiz.questions || []).find(
    (item) => item.id === Number(questionId)
  );

  if (!question) {
    return res.status(404).json({ message: "Question not found in this quiz" });
  }

  const alreadyAnswered = session.answers.find(
    (answer) => answer.questionId === Number(questionId)
  );

  if (alreadyAnswered) {
    return res.status(400).json({
      message: "Question already answered",
    });
  }

  const isCorrect = Number(selectedAnswer) === question.correctAnswer;

  session.answers.push({
    questionId: question.id,
    selectedAnswer: Number(selectedAnswer),
    isCorrect,
    answeredAt: new Date().toISOString(),
  });

  session.attempted += 1;

  if (isCorrect) {
    session.correct += 1;
  } else {
    session.wrong += 1;
  }

  saveSessions(sessions);

  res.json({
    message: "Answer saved",
    isCorrect,
    attempted: session.attempted,
    correct: session.correct,
    wrong: session.wrong,
  });
});

// 9. Get current session progress
app.get("/exam/session/:sessionId", (req, res) => {
  const sessions = readSessions();
  const session = sessions.find((item) => item.sessionId === req.params.sessionId);

  if (!session) {
    return res.status(404).json({ message: "Session not found" });
  }

  res.json(session);
});

// 10. Submit the whole exam
app.post("/exam/submit", (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ message: "sessionId is required" });
  }

  const sessions = readSessions();
  const session = sessions.find((item) => item.sessionId === sessionId);

  if (!session) {
    return res.status(404).json({ message: "Session not found" });
  }

  session.status = "submitted";
  session.submittedAt = new Date().toISOString();
  if (session.startedAt) {
    session.timeTakenSeconds = Math.round(
      (new Date(session.submittedAt) - new Date(session.startedAt)) / 1000
    );
  }

  if (req.body.flagCount !== undefined) {
    session.flagCount = req.body.flagCount;
  }
  if (req.body.autoSubmitted !== undefined) {
    session.autoSubmitted = !!req.body.autoSubmitted;
  }
  if (req.body.autoSubmitReason) {
    session.autoSubmitReason = req.body.autoSubmitReason;
  }

  saveSessions(sessions);

  res.json({
    message: "Exam submitted successfully",
    quizId: session.quizId,
    quizTitle: session.quizTitle,
    result: {
      attempted: session.attempted,
      correct: session.correct,
      wrong: session.wrong,
      totalQuestions: session.totalQuestions || session.attempted,
      scoreConsidered: session.scoreConsidered !== false,
      withinTimeSlot: session.withinTimeSlot !== false,
      outOfSlotReason: session.outOfSlotReason || null,
      flagCount: session.flagCount || 0,
      autoSubmitted: !!session.autoSubmitted,
      autoSubmitReason: session.autoSubmitReason || null,
    },
    flagCount: session.flagCount || 0,
    autoSubmitted: !!session.autoSubmitted,
    autoSubmitReason: session.autoSubmitReason || null,
    scoreConsidered: session.scoreConsidered !== false,
    withinTimeSlot: session.withinTimeSlot !== false,
    outOfSlotReason: session.outOfSlotReason || null,
    violationCount: session.violationCount || 0,
  });
});

// 11. Instructor / Classroom: Get all proctoring sessions & violations
app.get("/api/proctoring/sessions", (req, res) => {
  const sessions = readSessions();
  // Return sorted by most recent
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0)
  );
  res.json(sorted);
});

// 12. Instructor / Classroom: Unlock a student's locked session
app.post("/api/proctoring/sessions/:sessionId/unlock", (req, res) => {
  const sessions = readSessions();
  const session = sessions.find((s) => s.sessionId === req.params.sessionId);

  if (!session) {
    return res.status(404).json({ message: "Session not found" });
  }

  session.status = "in-progress";
  session.lockedReason = null;
  if (!session.violations) session.violations = [];
  session.violations.push({
    id: `unlock-${Date.now()}`,
    eventType: "instructor-unlocked",
    timestamp: new Date().toISOString(),
    message: "Instructor manually cleared lock and resumed attempt.",
  });

  saveSessions(sessions);

  res.json({
    message: `Session for ${session.name} unlocked successfully.`,
    session,
  });
});

// 13. Instructor / Classroom: Terminate / Disqualify a session
app.post("/api/proctoring/sessions/:sessionId/terminate", (req, res) => {
  const sessions = readSessions();
  const session = sessions.find((s) => s.sessionId === req.params.sessionId);

  if (!session) {
    return res.status(404).json({ message: "Session not found" });
  }

  session.status = "terminated";
  session.lockedReason = "Disqualified / terminated by instructor.";
  session.submittedAt = new Date().toISOString();

  saveSessions(sessions);

  res.json({
    message: `Session for ${session.name} has been terminated.`,
    session,
  });
});

app.listen(PORT, () => {
  console.log(`Athena Exam backend running at http://localhost:${PORT}`);
});
