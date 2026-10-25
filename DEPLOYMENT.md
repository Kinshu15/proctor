# Deployment & Packaging Guide: Athena Proctor

This guide explains how to deploy the backend to the cloud so all users (instructors and students) share synchronized quizzes, exam sessions, and scores, and how to build the macOS `.dmg` application for distribution.

---

## 🌐 Part 1: Deploy the Backend to the Cloud (Free on Render)

Deploying the `backend/` folder gives you a live HTTPS URL (e.g. `https://athena-backend.onrender.com`).

### Option A: 1-Click Blueprint with Render (Recommended)
1. Push your code to your GitHub repository (`Kinshu15/proctor`).
2. Log into [Render.com](https://render.com).
3. Click **New +** → **Blueprint**.
4. Select your `proctor` repository. Render will automatically detect [`render.yaml`](./render.yaml).
5. In the environment variables prompt, enter:
   - `GROQ_API_KEY` (or `GROK_API_KEY`) if you use AI quiz generation.
6. Click **Apply**.
7. Once deployed, Render will provide a public URL like:
   `https://athena-proctor-backend.onrender.com`

### Option B: Manual Web Service Setup on Render
1. Go to [Render Dashboard](https://dashboard.render.com) → **New +** → **Web Service**.
2. Connect your GitHub repository.
3. Configure the service:
   - **Name**: `athena-backend`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
4. Under **Environment Variables**, add:
   - `PORT`: `10000`
   - `GROQ_API_KEY`: `your_key_here`
5. Click **Create Web Service**.

> **Note on Free Tier Sleep**: On Render free tier, if no request is received for 15 minutes, the server sleeps and takes ~30 seconds to wake up on the first request. For non-sleeping continuous instances, you can upgrade to Render Starter ($7/mo) or use Railway / a VPS.

---

## 💻 Part 2: Connect Desktop App to Live Backend

Once your backend URL is live (e.g., `https://athena-proctor-backend.onrender.com`):

1. Inside `proctoring-tool/`, create or edit `.env.production`:
   ```ini
   VITE_API_BASE_URL=https://athena-proctor-backend.onrender.com
   ```
   *(For local testing without cloud, leave it unset or set to `http://localhost:3000`)*

2. Test the production build:
   ```bash
   cd proctoring-tool
   npm run build
   ```

---

## 📦 Part 3: Build the macOS `.dmg` Installer

With `electron-builder` installed, you can build the native macOS installer in one command:

```bash
cd proctoring-tool
npm run package:mac
```

### What this does:
1. Compiles React with Vite (`vite build`) using relative asset paths (`./assets/...`).
2. Packages the Electron runtime and web UI.
3. Generates the `.dmg` installer inside `proctoring-tool/release/`:
   ```
   proctoring-tool/release/Athena Proctor-1.0.0.dmg
   ```

### Sharing with Users:
- You can distribute `Athena Proctor-1.0.0.dmg` via Google Drive, GitHub Releases, or a direct download link.
- When users open the `.dmg`, they simply drag **Athena Proctor** to their **Applications** folder.
- When they launch the app, it will connect directly to your cloud backend, allowing them to take the exact quizzes you published and sync their attempts and scores back to your instructor gradebook!
