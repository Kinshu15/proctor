# Advanced Proctoring Architecture & Security Guide

This document provides a comprehensive overview of the proctoring enforcement architecture, operating-system permissions, browser capabilities and limitations, and instructor audit flows implemented in the **Athena Proctoring** application.

---

## 1. Architecture Overview

Athena utilizes a multi-tiered proctoring architecture that coordinates between:
1. **Frontend Examination Client (React + Electron Renderer)**: Manages UI lockdown, permission acquisition, real-time media streams (camera + screen capture), and active violation traps.
2. **Desktop OS Bridge (Electron Main + Preload IPC)**: Interacts directly with native operating system capabilities to query running processes, monitor window blur/focus/minimization, and write secure encrypted snapshots to disk.
3. **Backend Proctoring & Session Engine (Node.js/Express)**: Acts as the single source of truth for student attempt state. Answers are validated and strictly rejected (`403 Forbidden`) if a session is in a `paused` or `locked` state.

```text
┌────────────────────────────────────────────────────────┐
│                   Electron Main (OS)                   │
│   • ps / tasklist process enumeration                  │
│   • leave-full-screen, blur, minimize window listeners │
│   • Disk snapshot persistence                          │
└───────────▲────────────────────────────────▲───────────┘
            │ IPC                            │
┌───────────▼────────────────────────────────▼───────────┐
│              Frontend Client (React / Vite)            │
│   • getDisplayMedia Screen Capture                     │
│   • getUserMedia Camera Feed (5s snap)                 │
│   • Blocking Violation Overlay (Locks UI & Inputs)     │
│   • System Readiness Pre-flight Check                  │
└───────────▲────────────────────────────────▲───────────┘
            │ HTTP POST /exam/violation      │ HTTP POST /exam/answer
┌───────────▼────────────────────────────────▼───────────┐
│               Backend Server (Express)                 │
│   • Server-side State Enforcement (Active/Paused/Lock) │
│   • 3-Violation Policy Threshold                       │
│   • Instructor Audit & Session Unlock Dashboard        │
└────────────────────────────────────────────────────────┘
```

---

## 2. Implemented Features

### 1. Fullscreen Exit Enforcement
* **Detection**: Monitored concurrently via HTML5 `fullscreenchange` / `webkitfullscreenchange` events in the web layer and Electron native `leave-full-screen` window events in the desktop layer.
* **Immediate Client Lockdown**: When fullscreen is exited:
  * An un-dismissible blocking warning overlay (`.blocking-violation-backdrop`, `z-index: 999999`) covers the entire viewport.
  * Question options, radio dots, and navigation buttons are disabled (`pointer-events: none`).
* **Server-Side Enforcement**: The frontend immediately transmits a violation payload to `POST /exam/violation`. The backend sets the session status to `paused` and increments the violation counter. If the client attempts to bypass the UI and post answers via `POST /exam/answer`, the backend blocks the submission with `HTTP 403 Forbidden` (`code: EXAM_PAUSED`).
* **Policy Threshold & Resumption**:
  * **Violations 1 & 2**: The student can click **"Re-enter Fullscreen & Resume"**, which re-requests fullscreen, re-verifies active screen sharing, and calls `POST /exam/resume` to return the session to `in-progress`.
  * **Violation 3 (Max Policy Limit)**: The session status is escalated to `locked`. Resumption is permanently blocked on both frontend and backend until an instructor reviews the violation audit timeline and manually unlocks the attempt.

### 2. Pre-Quiz System Readiness & Background Application Detection
* **Desktop Environment (Electron)**:
  * On setup launch, the client executes `window.athena.checkRunningProcesses()`.
  * Scans running OS processes against prohibited examination utilities:
    * **Communication**: Discord, Slack, Zoom, Microsoft Teams, Skype, Telegram, WhatsApp, Signal.
    * **Remote Access**: AnyDesk, TeamViewer, Remote Desktop Connection, RustDesk.
    * **Screen Recording**: OBS Studio, Camtasia, QuickTime Player, ShareX.
  * If prohibited tools are detected, a prominent warning alert lists each application with tags and disables the **"Start Proctored Exam"** action.
  * A **"Recheck System"** button allows students to close prohibited apps and re-scan without restarting the application.
* **Web Browser Environment**:
  * Standard browsers run inside a security sandbox that prohibits enumerating operating-system processes or inspecting other running applications.
  * Rather than mocking detection, the application transparently displays a **Web Sandbox Notice** informing users of browser boundaries and instructing manual closing of unauthorized software.

### 3. Screen Sharing and Capture
* **Permission & Acquisition**: A dedicated screen capture card in the pre-exam setup requests user permission via `navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'monitor' }, audio: false })`.
* **Live Confirmation**: Displays a live video preview thumbnail during setup and a secondary live monitor preview thumbnail in the exam status bar alongside the webcam feed.
* **Stream Revocation Detection**: Attaches an `onended` event listener to the video track (`track.onended`). If the user stops screen sharing from the browser/OS toolbar, question interaction is immediately locked, a `screen_share_stopped` violation is reported to the backend, and the student must re-grant screen sharing before resumption is permitted.

### 4. Desktop Features & Window Focus Monitoring
* **Window Blur / Minimization**: Native Electron window hooks (`blur`, `minimize`) and window focus events detect when an examination window is hidden or switched away from.
* **Audit Logging**: Each focus change is logged as an event with timestamp, attempt ID, and details.
* **Instructor Management Dashboard**: Accessible under **"Manage Quizzes & Proctoring"**:
  * Displays a live table of student sessions with statuses (`in-progress`, `paused`, `locked`, `completed`).
  * Displays violation counts and attempted/correct scores.
  * Provides an interactive **Violation Audit Timeline Drawer** detailing every infraction with exact timestamps.
  * Allows instructors to **Unlock** locked attempts or **Terminate/Disqualify** sessions.

---

## 3. Platform Capabilities & Operating System Permissions

| Feature | Desktop (Electron) | Web Browser (Chrome / Edge / Safari) | OS Permissions Required |
| :--- | :---: | :---: | :--- |
| **Fullscreen Lockdown** | Native + DOM API | HTML5 Fullscreen API | User interaction / click required |
| **Window Blur / App Switch** | Reliable (`blur`, `minimize`) | Partial (Window blur / tab switch) | None |
| **Background App Detection** | Native OS process scan | ❌ Not supported by browser sandbox | macOS: Standard; Windows: Standard |
| **Webcam 5s Snapshot Logging** | Native disk save | In-memory canvas capture | Camera permission (System + App) |
| **Screen Sharing & Stream** | Supported (`getDisplayMedia`) | Supported (`getDisplayMedia`) | macOS: Screen Recording permission |
| **Server State Enforcement** | Full (`POST /exam/violation`) | Full (`POST /exam/violation`) | Local or remote network connection |

### Important Browser & OS Security Boundaries:
1. **Operating System Process Isolation**: Browsers cannot access host system process tables. For high-stakes institutional examinations, the application should be deployed as the Electron desktop package or run in a locked-down kiosk environment.
2. **macOS Screen Recording Permissions**: On macOS (Catalina and later), users must ensure that Electron (or the target browser) is granted access under **System Settings > Privacy & Security > Screen Recording**.
3. **Browser Fullscreen Gestures**: Browsers permit users to exit fullscreen using the `Escape` key. Our implementation captures this immediately and triggers the violation protocol without delay.

---

## 4. API Reference Summary

### Proctoring Endpoints

* `POST /exam/violation`
  * Body: `{ sessionId, userId, eventType, timestamp, metadata }`
  * Action: Records event, updates `violationCount`, sets status to `paused` (or `locked` if count >= 3).
* `POST /exam/resume`
  * Body: `{ sessionId }`
  * Action: Checks violation threshold; restores status to `in-progress` if policy permits. Returns `403` if permanently locked.
* `POST /exam/answer`
  * Body: `{ sessionId, questionId, selectedAnswer }`
  * Security Check: Rejects with `403 Forbidden` (`code: EXAM_PAUSED` or `code: EXAM_LOCKED`) if the attempt is not in an active `in-progress` state.
* `GET /api/proctoring/sessions`
  * Returns all student sessions, violation records, scores, and status flags for instructor review.
* `POST /api/proctoring/sessions/:sessionId/unlock`
  * Resets `status` to `in-progress`, clears `lockedReason`, and logs an instructor audit entry.
* `POST /api/proctoring/sessions/:sessionId/terminate`
  * Sets `status` to `locked` and disqualifies the session.
