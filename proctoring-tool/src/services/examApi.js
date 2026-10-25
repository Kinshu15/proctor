const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

async function apiFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (err.name === 'TypeError' || err.message === 'Failed to fetch') {
      throw new Error(`Cannot connect to backend server at ${API_BASE_URL}. Please check your connection or ensure the backend server is running.`, { cause: err });
    }
    throw err;
  }
}

/**
 * Fetch all available published quizzes from backend
 * @returns {Promise<Array<{ id: string, title: string, description: string, durationMinutes: number, questionCount: number, category: string, difficulty: string }>>}
 */
export async function getQuizzes() {
  const response = await apiFetch(`${API_BASE_URL}/exam/quizzes`);
  if (!response.ok) {
    throw new Error(`Failed to fetch quizzes: ${response.status}`);
  }
  return await response.json();
}

/**
 * Start a new exam session on the backend
 * @param {string} userId
 * @param {string} name
 * @param {string} [quizId]
 * @returns {Promise<{ message: string, sessionId: string, quizId: string, quizTitle: string, durationMinutes: number, totalQuestions: number }>}
 */
export async function startExam(userId, name, quizId) {
  const response = await apiFetch(`${API_BASE_URL}/exam/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, name, quizId }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to start exam: ${response.status}`);
  }
  return await response.json();
}

/**
 * Fetch all MCQ questions (without correct answers) for a specific quiz
 * @param {string} [quizId]
 * @returns {Promise<Array<{ id: number, question: string, options: string[] }>>}
 */
export async function getAllQuestions(quizId) {
  const url = quizId 
    ? `${API_BASE_URL}/exam/mcq?quizId=${encodeURIComponent(quizId)}`
    : `${API_BASE_URL}/exam/mcq`;
  const response = await apiFetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch questions: ${response.status}`);
  }
  return await response.json();
}

/**
 * Fetch a single question by ID
 * @param {number|string} id
 * @param {string} [quizId]
 * @returns {Promise<{ id: number, question: string, options: string[] }>>}
 */
export async function getQuestion(id, quizId) {
  const url = quizId 
    ? `${API_BASE_URL}/exam/mcq/${id}?quizId=${encodeURIComponent(quizId)}`
    : `${API_BASE_URL}/exam/mcq/${id}`;
  const response = await apiFetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch question #${id}: ${response.status}`);
  }
  return await response.json();
}

/**
 * Submit one question answer to backend
 * Note: The backend returns { isCorrect, attempted, correct, wrong }, but
 * the frontend will not reveal correctness until final submission.
 * @param {string} sessionId
 * @param {number} questionId
 * @param {number} selectedAnswer (index 0, 1, 2, 3)
 */
export async function submitAnswer(sessionId, questionId, selectedAnswer) {
  const response = await apiFetch(`${API_BASE_URL}/exam/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, questionId, selectedAnswer }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to save answer: ${response.status}`);
  }
  return await response.json();
}

/**
 * Fetch session status and current progress
 * @param {string} sessionId
 */
export async function getSession(sessionId) {
  const response = await apiFetch(`${API_BASE_URL}/exam/session/${sessionId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch session ${sessionId}: ${response.status}`);
  }
  return await response.json();
}

/**
 * Submit the whole exam and retrieve final score results
 * @param {string} sessionId
 * @returns {Promise<{ message: string, quizId: string, quizTitle: string, result: { attempted: number, correct: number, wrong: number, totalQuestions: number } }>}
 */
export async function submitExam(sessionId, meta = {}) {
  const response = await apiFetch(`${API_BASE_URL}/exam/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, ...meta }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to submit exam: ${response.status}`);
  }
  return await response.json();
}

// ==========================================
// AI Quiz Creator & Management API
// ==========================================

/**
 * Generate a complete custom quiz using AI backend
 * @param {{ title: string, topic: string, numQuestions: number, difficulty: string, questionType: string, timeLimit: number }} config
 */
export async function generateAiQuiz(config) {
  const response = await apiFetch(`${API_BASE_URL}/api/quizzes/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to generate quiz: ${response.status}`);
  }
  return await response.json();
}

/**
 * Regenerate an individual question using AI
 * @param {{ topic: string, difficulty: string, questionType: string, existingQuestion: string, index: number }} config
 */
export async function regenerateAiQuestion(config) {
  const response = await apiFetch(`${API_BASE_URL}/api/quizzes/regenerate-question`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to regenerate question: ${response.status}`);
  }
  return await response.json();
}

/**
 * Save quiz to backend (draft or published)
 * @param {object} quizData
 */
export async function saveQuiz(quizData) {
  const response = await apiFetch(`${API_BASE_URL}/api/quizzes/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(quizData),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to save quiz: ${response.status}`);
  }
  return await response.json();
}

/**
 * Get all managed quizzes (including drafts)
 */
export async function getManagedQuizzes() {
  const response = await apiFetch(`${API_BASE_URL}/api/quizzes/manage`);
  if (!response.ok) {
    throw new Error(`Failed to fetch managed quizzes: ${response.status}`);
  }
  return await response.json();
}

/**
 * Get full quiz data with answer keys for preview & editing
 * @param {string} quizId
 */
export async function getManagedQuiz(quizId) {
  const response = await apiFetch(`${API_BASE_URL}/api/quizzes/manage/${quizId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch quiz ${quizId}: ${response.status}`);
  }
  return await response.json();
}

/**
 * Delete a quiz
 * @param {string} quizId
 */
export async function deleteQuiz(quizId) {
  const response = await apiFetch(`${API_BASE_URL}/api/quizzes/${quizId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to delete quiz: ${response.status}`);
  }
  return await response.json();
}

/**
 * Publish a draft quiz
 * @param {string} quizId
 */
export async function publishQuiz(quizId) {
  const response = await apiFetch(`${API_BASE_URL}/api/quizzes/${quizId}/publish`, {
    method: 'PUT',
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to publish quiz: ${response.status}`);
  }
  return await response.json();
}

// ==========================================
// Advanced Proctoring & Violations APIs
// ==========================================

/**
 * Report a proctoring violation event to backend
 * @param {string} sessionId
 * @param {string} userId
 * @param {string} eventType ('fullscreen-exit' | 'window-blur' | 'screen-share-stopped' | 'window-minimize')
 * @param {object} [metadata]
 */
export async function reportViolation(sessionId, userId, eventType, metadata = {}) {
  const response = await apiFetch(`${API_BASE_URL}/exam/violation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, userId, eventType, timestamp: new Date().toISOString(), metadata }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to report violation: ${response.status}`);
  }
  return await response.json();
}

/**
 * Request resumption of an exam attempt after a violation
 * @param {string} sessionId
 */
export async function resumeExam(sessionId) {
  const response = await apiFetch(`${API_BASE_URL}/exam/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const err = new Error(errorData.message || `Failed to resume exam: ${response.status}`);
    err.data = errorData;
    throw err;
  }
  return await response.json();
}

/**
 * Fetch all sessions and proctoring audit logs for instructors
 */
export async function getAllProctoringSessions() {
  const response = await apiFetch(`${API_BASE_URL}/api/proctoring/sessions`);
  if (!response.ok) {
    throw new Error(`Failed to fetch proctoring sessions: ${response.status}`);
  }
  return await response.json();
}

/**
 * Instructor action: Unlock a locked student session
 * @param {string} sessionId
 */
export async function unlockProctoringSession(sessionId) {
  const response = await apiFetch(`${API_BASE_URL}/api/proctoring/sessions/${sessionId}/unlock`, {
    method: 'POST',
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to unlock session: ${response.status}`);
  }
  return await response.json();
}

/**
 * Instructor action: Terminate/Disqualify a student session
 * @param {string} sessionId
 */
export async function terminateProctoringSession(sessionId) {
  const response = await apiFetch(`${API_BASE_URL}/api/proctoring/sessions/${sessionId}/terminate`, {
    method: 'POST',
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to terminate session: ${response.status}`);
  }
  return await response.json();
}

/**
 * Instructor authentication with admin password (admin 101)
 * @param {string} password
 */
export async function loginInstructor(password) {
  const response = await apiFetch(`${API_BASE_URL}/api/instructor/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Instructor authentication failed.');
  }
  return await response.json();
}

/**
 * Instructor: Add extra allotted time to a quiz definition
 * @param {string} quizId
 * @param {number} extraMinutes
 */
export async function addExtraTimeToQuiz(quizId, extraMinutes) {
  const response = await apiFetch(`${API_BASE_URL}/api/quizzes/${quizId}/add-time`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extraMinutes }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to add extra time to quiz.');
  }
  return await response.json();
}

/**
 * Instructor: Add extra time to an active student examination session
 * @param {string} sessionId
 * @param {number} extraMinutes
 */
export async function addExtraTimeToSession(sessionId, extraMinutes) {
  const response = await apiFetch(`${API_BASE_URL}/api/proctoring/sessions/${sessionId}/add-time`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extraMinutes }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to add extra time to session.');
  }
  return await response.json();
}

/**
 * Instructor: Fetch all student scores and gradebook data
 * @param {string} [quizId]
 */
export async function getInstructorScores(quizId) {
  const url = quizId && quizId !== 'all'
    ? `${API_BASE_URL}/api/instructor/scores?quizId=${encodeURIComponent(quizId)}`
    : `${API_BASE_URL}/api/instructor/scores`;
  const response = await apiFetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch instructor scores: ${response.status}`);
  }
  return await response.json();
}


