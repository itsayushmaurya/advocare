# Advocare – AI Legal Assistant for Indian Citizens

## Project Overview
**Advocare** is a web application providing free AI-powered legal guidance specifically for Indian citizens. It helps users understand their rights, navigate legal steps, and find relevant government portals or helplines.

---

## Tech Stack

### Backend
- **Language:** Python 3.10+
- **Framework:** FastAPI (async)
- **Database:** SQLite (local) / Supabase (production) via SQLAlchemy
- **Migrations:** Alembic
- **LLM Provider:** Groq API (OpenAI-compatible)
- **Auth:** JWT-based authentication (`auth.py`)
- **Rate Limiting:** `slowapi`

### Frontend
- **Languages:** Pure HTML5, CSS3, Vanilla JavaScript
- **Frameworks:** None (no React, no jQuery, no build tools)
- **Design:** 3-column layout (Sidebar history, Chat UI, Case Strength panel)

---

## Core Architecture & Patterns

### Backend Structure
- `main.py`: Entry point and FastAPI route definitions.
- `llm_service.py`: Handles communication with the Groq API.
- `prompt_engine.py`: Centralized logic for building LLM prompts. **Do not hardcode prompts elsewhere.**
- `classifier.py`: Keyword-based classification for legal categories and urgency detection.
- `models.py`: SQLAlchemy ORM models (`User`, `Session`, `Message`).
- `db.py`: Database connection and session management.
- `legal_links.py`: Mapping of legal categories to official Indian government portals.

### Data Flow
1. **Input:** User submits a legal query.
2. **Classification:** `classifier.py` identifies the category and urgency.
3. **Prompting:** `prompt_engine.py` constructs a structured prompt.
4. **LLM Execution:** `llm_service.py` calls the Groq API.
5. **Structured Response:** LLM returns text with specific emoji headers and a hidden `---CASE_ANALYSIS_START---` block.
6. **Frontend Parsing:** `app.js` renders the chat and extracts the hidden block to update the Case Strength panel.

---

## Coding Conventions & Rules

### General
- **India-Specific:** All legal content, IPC sections, and portals must be specific to India.
- **User-Centric:** Use simple language suitable for low-literacy users.
- **Safety:** Never return raw exceptions; always provide user-friendly error messages.

### Backend
- **Async First:** Always use `async def` for route handlers.
- **Type Safety:** Use Pydantic models for all request and response bodies.
- **Modularity:** Keep logic separated (prompts in `prompt_engine.py`, classification in `classifier.py`).
- **New Categories:** When adding a legal category, update both `classifier.py` (KEYWORD_MAP) and `legal_links.py` (LEGAL_LINKS).

### Frontend
- **Vanilla Only:** strictly no frontend frameworks or build tools.
- **State Management:** Use the backend database for session persistence (avoid adding new `localStorage` dependencies).
- **Parsing:** Ensure the hidden `---CASE_ANALYSIS_START---` block is always stripped from the UI but used for the strength panel.

---

## Development Workflow
- **Migrations:** Use Alembic for database schema changes (`alembic revision --autogenerate -m "..."`).
- **Environment:** Keep secrets in `backend/.env` (`DATABASE_URL`, `SECRET_KEY`, `GROQ_API_KEY`).
- **Validation:** Always verify changes against the India-specific legal context.
