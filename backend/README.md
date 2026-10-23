# Exam Backend & AI Quiz Generation Engine

A lightweight Express backend for the Electron exam & proctoring application, featuring **AI-Powered Custom Quiz Generation** via Grok / Groq APIs.

---

## Folder Structure

```text
backend/
├── .env                                  # Environment variables (API keys, ports)
├── .env.example                          # Template for environment configuration
├── .gitignore                            # Ignores .env and node_modules
├── data/
│   ├── quizzes/                          # Individual quiz JSON files
│   │   ├── electron-basics.json          # Electron Architecture & IPC Quiz
│   │   ├── javascript-core.json          # JS Closures, Event Loop & Async Quiz
│   │   └── react-fundamentals.json       # React 19 Hooks & Component State Quiz
│   ├── quizzes.json                      # Optional quiz catalog manifest
│   ├── questions.json                    # Backward-compatible default questions
│   └── sessions.json                     # Session database with quizId
├── services/
│   └── aiQuizService.js                  # Grok/Groq LLM generation, validation & single question regeneration
├── package.json
├── server.js                             # Express API server (exam + creator endpoints)
└── README.md
```

---

## Environment Variables

Configure the AI API key inside [`backend/.env`](file:///Users/kushagrabhardwaj/Desktop/NST_AD/backend/.env):

```env
# Accepts Groq API keys (starts with gsk_) or xAI Grok API keys (starts with xai-)
GROK_API_KEY=gsk_...
GROQ_API_KEY=gsk_...
PORT=3000
```

> **Security Note:** The API key is used strictly on the backend and is **never** exposed to the Electron renderer or web clients.

---

## Setup & Running

```bash
cd backend
npm install
npm start
```

Server runs on `http://localhost:3000`.

---

## AI Quiz Creation & Management APIs

### 1. Generate Quiz Draft with AI
```http
POST /api/quizzes/generate
Content-Type: application/json

{
  "title": "Docker Essentials",
  "topic": "Docker containers, layers, and networking",
  "numQuestions": 5,
  "difficulty": "Medium",
  "questionType": "MCQ",
  "timeLimit": 10
}
```
**Response:**
```json
{
  "message": "Quiz generated successfully",
  "quiz": {
    "title": "Docker Essentials",
    "description": "...",
    "category": "DevOps",
    "difficulty": "Medium",
    "durationMinutes": 10,
    "questionCount": 5,
    "questions": [
      {
        "id": 1,
        "question": "Which command lists all running containers?",
        "options": ["docker ps", "docker images", "docker run", "docker logs"],
        "correctAnswer": 0,
        "explanation": "docker ps shows active containers."
      }
    ]
  }
}
```

### 2. Regenerate a Single Question with AI
```http
POST /api/quizzes/regenerate-question
Content-Type: application/json

{
  "topic": "Docker containers",
  "difficulty": "Medium",
  "questionType": "MCQ",
  "existingQuestion": "Which command lists all running containers?",
  "index": 1
}
```

### 3. Save Quiz (Draft or Published)
```http
POST /api/quizzes/save
Content-Type: application/json

{
  "id": "docker-essentials",
  "title": "Docker Essentials",
  "category": "DevOps",
  "status": "published",
  "durationMinutes": 10,
  "questions": [ ... ]
}
```

### 4. Quiz Management Dashboard
- `GET /api/quizzes/manage`: Returns all quizzes including drafts.
- `GET /api/quizzes/manage/:quizId`: Returns full quiz with answer keys for the creator/editor.
- `PUT /api/quizzes/:quizId/publish`: Publishes a draft quiz.
- `DELETE /api/quizzes/:quizId`: Permanently deletes a quiz.

---

## Student Exam Taking APIs (Drafts Excluded)

- `GET /exam/quizzes`: Returns all published quizzes (drafts are hidden from test takers).
- `GET /exam/quizzes/:quizId`: Returns sanitized questions (without exposing `correctAnswer` or `explanation`).
- `POST /exam/start`: Starts a session for a specific quiz `{ userId, name, quizId }`.
- `POST /exam/answer`: Evaluates answers against the session's assigned quiz.
- `POST /exam/submit`: Submits the exam and returns results tagged with quiz metadata.
