# Advocare – AI Legal Assistant for Indian Citizens
## Project Overview

I am building **Advocare**, a web application that provides free AI-powered legal guidance specifically for Indian citizens. The goal is to help common people understand their legal rights, know what steps to take, and find the right government portals or helplines — without needing to hire a lawyer.

---

## Tech Stack

### Backend
- **Language:** Python 3.10+
- **Framework:** FastAPI (async)
- **LLM Provider:** Groq API (via `httpx`, OpenAI-compatible endpoint)
- **Model in use:** `openai/gpt-oss-120b` on Groq (fast, free tier)
- **Entry point:** `main.py` → runs on `http://localhost:8000`
- **Key files:**
  - `main.py` — FastAPI app, routes: `POST /analyze`, `GET /health`, `GET /categories`
  - `llm_service.py` — async `call_llm()` that hits Groq API, handles errors with fallback responses
  - `prompt_engine.py` — `build_prompt()` builds structured system + user prompt; `build_followup_prompt()` for multi-turn
  - `classifier.py` — keyword-based rule classifier returning one of: `cybercrime`, `consumer`, `labour`, `rental`, `domestic_violence`, `property`, `general`
  - `legal_links.py` — dict of official Indian gov portals/helplines per category
  - `Req.txt` — pip dependencies: `fastapi`, `uvicorn`, `python-dotenv`, `httpx`, `pydantic`

### Frontend
- **Pure HTML/CSS/JS** (no framework, no build tool)
- **Files:** `index.html`, `style.css`, `app.js`
- **Design:** 3-column layout — left sidebar (chat history), center (chat UI), right (case strength panel)
- **Key features already built:**
  - Multi-session chat stored in `localStorage`
  - Sidebar with session list, delete, load
  - Typing indicator, character counter, example chips
  - Response formatting with emoji section headers
  - Case Strength panel — parses hidden `---CASE_ANALYSIS_START---` block from LLM response to show a 0-100 score bar + positive/negative points toggle
  - Category badge per response

---

## How the App Works (Data Flow)

1. User types a legal problem in the textarea
2. `app.js` → `submitQuery()` POSTs to `POST /analyze` with `{ problem, conversation_history }`
3. `main.py` → classifies with `classify_issue()` → builds prompt via `build_prompt()` → calls `call_llm()`
4. LLM returns structured text with these exact sections:
   - `🔍 ISSUE TYPE`, `📋 STEPS TO TAKE`, `🏛️ WHERE TO FILE COMPLAINT`, `⚖️ YOUR RIGHTS`, `💡 IMPORTANT TIP`
   - Hidden block: `---CASE_ANALYSIS_START--- ... ---CASE_ANALYSIS_END---` containing `STRENGTH_SCORE`, `POSITIVE_POINTS`, `NEGATIVE_POINTS`
5. Frontend parses and strips the hidden block, displays clean response in chat, updates Case Strength panel

---

## Current State

The app is functional end-to-end. The following things work:
- Backend classification and LLM calls
- Structured prompt generation with Indian law context
- Frontend chat UI with sessions
- Case strength parsing and display

---

## Coding Conventions & Rules

- Backend: always use `async def` for route handlers; use Pydantic models for request/response
- Frontend: vanilla JS only — no React, no jQuery, no build tools
- Do NOT use `localStorage` in any new artifact (it's already used for sessions — don't add more)
- Error handling: always return user-friendly messages, never raw exceptions
- All legal content must be India-specific: IPC sections, Indian gov portals, Indian helpline numbers
- Keep prompts in `prompt_engine.py` — do not hardcode prompts in `main.py` or `llm_service.py`
- New legal categories go in both `classifier.py` (KEYWORD_MAP) and `legal_links.py` (LEGAL_LINKS)

---

## What I May Ask You To Build Next

- Hindi language support (bilingual toggle)
- PDF export of legal advice
- Voice input support
- More legal categories (e.g. `motor_accident`, `banking_fraud`, `cheque_bounce`)
- Rate limiting on the FastAPI backend
- A `/feedback` endpoint to collect user ratings
- Deploying backend to Railway/Render, frontend to Netlify/Vercel
- Replacing Groq with Anthropic Claude API
- Adding a proper database (SQLite/PostgreSQL) for session persistence instead of localStorage

---

## Important Context

- This is an Indian civic-tech project. Accuracy of legal information matters. Always prefer Indian government sources.
- The app is designed for low-literacy users — keep language simple
- Free and open access is a core principle — no paywalls, no auth required
- The hidden `---CASE_ANALYSIS_START---` block in LLM responses is intentional — it feeds the right panel without showing raw data to users