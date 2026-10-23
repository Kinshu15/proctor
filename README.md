# Athena - AI Proctoring & Examination System

An intelligent, multi-modal proctoring and assessment platform built with **Electron**, **React**, and **Node.js / Express**. Athena ensures strict examination integrity through live hardware proctoring, behavioral flag tracking, and AI-powered quiz generation.

---

## 🚀 Key Features

### 🛡️ Examination Proctoring & Integrity
- **Multi-Modal Permissions**: Mandatory student verification with Camera, Screen Sharing, and Native Fullscreen lock.
- **Behavioral Flagging System**:
  - Automatically records flags if the examinee attempts to exit fullscreen, blur the window, or switch applications.
  - Live flag indicator (`🚩 X / 5`) with grace periods to avoid false positives.
  - **Auto-Submission**: Automatically finalizes and submits the assessment upon reaching 5 flags.
  - **Foolproof Teardown**: Automatically disarms all proctoring listeners upon quiz submission or exit.
- **Automated Integrity Snapshots**: Background webcam and screen captures saved in organized student session folders.

### 📋 Student Examination Portal
- Step-by-step onboarding wizard:
  1. **Student Verification**: Roll number & Name entry.
  2. **Assessment Selection**: Browse ongoing assessments or past tests for practice.
  3. **Device Permissions**: Live webcam preview, screen share setup, and fullscreen lock.
- Clean MCQ interface with progress tracking, single-question review, and instant scorecard breakdown.
- Detailed scorecard displaying score, correct/wrong stats, and incurred proctoring flags.

### 👨‍🏫 Instructor Dashboard & AI Quiz Creator
- **Secure Instructor Portal**: Password-protected administrative access for exam managers.
- **AI-Powered Quiz Generation**:
  - Generates comprehensive topic-tailored assessments using Grok / Groq inference.
  - Configurable questions count, difficulty, and allotted time duration.
- **Gradebook & Scorecard**:
  - Real-time overview of students who completed exams within official time slots.
  - Inspect individual scores, attempts, and flagged proctoring events.
  - One-click copy for raw plain-text scorecards.
- **Assessment Management**:
  - Add extra time (+5, +10, +15, +30 mins) on the fly to active or upcoming assessments.
  - Publish draft quizzes or manage active exam schedules.

---

## 📁 Repository Structure

```
.
├── backend/                  # Node.js & Express API Server
│   ├── data/                 # JSON file datastore (quizzes, questions, sessions)
│   ├── services/             # AI Quiz Generator service (Grok / Groq integration)
│   ├── server.js             # API routes & exam submission engine
│   └── package.json
│
├── proctoring-tool/          # Desktop Electron & React Frontend
│   ├── app/                  # Electron main process & IPC handlers
│   │   ├── app.js            # Native window management & snapshot timers
│   │   └── preload.js        # Secure IPC bridge
│   ├── src/                  # React UI (Vite)
│   │   ├── components/       # QuizCreator & QuizManager
│   │   ├── services/         # Exam API client
│   │   ├── App.jsx           # Main application controller
│   │   └── App.css           # Custom UI design system
│   └── package.json
│
├── PROCTORING.md             # Proctoring system documentation
└── README.md                 # Project documentation
```

---

## 🛠️ Quick Start

### 1. Prerequisites
- **Node.js** (v18+ recommended)
- **npm**

### 2. Configure & Start Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env and supply your GROQ_API_KEY or GROK_API_KEY
npm run dev
```
Backend runs at `http://localhost:3000`.

### 3. Start Frontend & Electron Proctor
```bash
cd proctoring-tool
npm install
npm run dev
```
In a second terminal:
```bash
cd proctoring-tool
npm run electron
```

---

## 📜 License
MIT License. Developed for advanced online proctoring and automated academic integrity.
