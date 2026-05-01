from datetime import datetime
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import uvicorn
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from auth import create_access_token, get_current_user, hash_password, verify_password
from db import get_db, engine, Base
from llm_service import call_llm
from prompt_engine import build_prompt, build_followup_prompt
from classifier import classify_issue, detect_urgency
from models import Message, Session as ChatSession, User

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(
    title="Be Your Own Lawyer API",
    description="AI-powered legal assistant for Indian citizens",
    version="1.0.0"
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, lambda req, exc: HTTPException(
    status_code=429,
    detail="Too many requests. Please wait a moment before trying again."
))

# Allow frontend to call backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    Base.metadata.create_all(bind=engine)

# --- Models ---
class LegalQuery(BaseModel):
    problem: str
    conversation_history: Optional[List[dict]] = []
    reply_mode: Optional[str] = 'detail'
    language: Optional[str] = 'en'
    session_id: Optional[int] = None

class LegalResponse(BaseModel):
    response: str
    detected_category: str
    urgency: str
    session_id: Optional[int] = None


class AuthRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    name: str
    email: str
    age: Optional[int] = None
    user_type: str = "citizen"
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SessionListItem(BaseModel):
    id: int
    title: str
    created_at: datetime


class MessageItem(BaseModel):
    id: int
    session_id: int
    role: str
    content: str
    category: str
    created_at: datetime


# --- Routes ---
@app.get("/")
def root():
    return {"status": "running", "message": "Be Your Own Lawyer API is live"}

@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/register", response_model=TokenResponse)
async def register_user(payload: RegisterRequest, db: Session = Depends(get_db)):
    name = payload.name.strip()
    email = payload.email.strip().lower()
    password = payload.password.strip()
    age = payload.age
    user_type = payload.user_type.strip().lower()

    if not name:
        raise HTTPException(status_code=400, detail="Name is required.")
    if not email:
        raise HTTPException(status_code=400, detail="Email is required.")
    if len(password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 6 characters long.",
        )
    
    if user_type not in {"citizen", "lawyer"}:
        user_type = "citizen"

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email is already registered.")

    user = User(
        name=name,
        email=email,
        age=age,
        user_type=user_type,
        password_hash=hash_password(password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token)


@app.post("/login", response_model=TokenResponse)
async def login_user(payload: AuthRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    password = payload.password

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required.")

    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token)


@app.post("/analyze", response_model=LegalResponse)
@limiter.limit("10/minute")
async def analyze_legal_problem(
    request: Request,
    query: LegalQuery,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = current_user.id

    # Input validation
    user_problem = query.problem.strip()
    if not user_problem or len(user_problem) < 10:
        raise HTTPException(
            status_code=400,
            detail="Please describe your problem in at least a few words."
        )
    
    if len(user_problem) > 2000:
        raise HTTPException(
            status_code=400,
            detail="Please keep your description under 2000 characters."
        )
    
    # Normalize response mode
    mode = (query.reply_mode or "detail").strip().lower()
    if mode not in {"quick", "detail"}:
        mode = "detail"

    # Normalize language
    lang = (query.language or "en").strip().lower()
    if lang not in {"en", "hi"}:
        lang = "en"

    # Step 1: Rule-based classification
    category = classify_issue(user_problem)
    urgency = detect_urgency(user_problem)

    if query.session_id is not None:
        active_session = (
            db.query(ChatSession)
            .filter(ChatSession.id == query.session_id, ChatSession.user_id == user_id)
            .first()
        )
        if not active_session:
            raise HTTPException(status_code=404, detail="Session not found.")
    else:
        active_session = ChatSession(user_id=user_id, title=user_problem[:50])
        db.add(active_session)
        db.commit()
        db.refresh(active_session)
    
    # Step 2: Build intelligent prompt
    if query.conversation_history:
        system_prompt, user_message = build_followup_prompt(
            query.conversation_history, user_problem, mode, lang
        )
    else:
        system_prompt, user_message = build_prompt(user_problem, category, mode, lang)
    
    # Step 3: Call LLM
    llm_response = await call_llm(
        system_prompt=system_prompt,
        user_message=user_message,
        history=query.conversation_history
    )

    # ADD THIS LINE TEMPORARILY
    print("=== LLM RESPONSE ===")
    print(llm_response)
    print("=== END ===")

    db.add(
        Message(
            session_id=active_session.id,
            role="user",
            content=user_problem,
            category=category,
        )
    )
    db.add(
        Message(
            session_id=active_session.id,
            role="assistant",
            content=llm_response,
            category=category,
        )
    )
    db.commit()

    return LegalResponse(
        response=llm_response,
        detected_category=category,
        urgency=urgency,
        session_id=active_session.id,
    )


@app.get("/sessions", response_model=List[SessionListItem])
async def get_user_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.created_at.desc())
        .all()
    )
    return sessions


@app.get("/sessions/{session_id}/messages", response_model=List[MessageItem])
async def get_session_messages(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_session = (
        db.query(ChatSession)
        .filter(ChatSession.id == session_id, ChatSession.user_id == current_user.id)
        .first()
    )
    if not target_session:
        raise HTTPException(status_code=404, detail="Session not found.")

    messages = (
        db.query(Message)
        .filter(Message.session_id == session_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    return messages

@app.get("/categories")
def get_categories():
    """Returns all supported legal issue categories"""
    return {
        "categories": [
            "cybercrime", "consumer", "labour", 
            "rental", "domestic_violence", "property", "general"
        ]
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
