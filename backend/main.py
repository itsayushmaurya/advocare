from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import uvicorn
from sqlalchemy.orm import Session

from auth import create_access_token, hash_password, verify_password
from db import get_db
from llm_service import call_llm
from prompt_engine import build_prompt, build_followup_prompt
from classifier import classify_issue
from models import User

app = FastAPI(
    title="Be Your Own Lawyer API",
    description="AI-powered legal assistant for Indian citizens",
    version="1.0.0"
)

# Allow frontend to call backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Models ---
class LegalQuery(BaseModel):
    problem: str
    conversation_history: Optional[List[dict]] = []
    reply_mode: Optional[str] = 'detail'

class LegalResponse(BaseModel):
    response: str
    detected_category: str
    session_id: Optional[str] = None


class AuthRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# --- Routes ---
@app.get("/")
def root():
    return {"status": "running", "message": "Be Your Own Lawyer API is live"}

@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/register", response_model=TokenResponse)
async def register_user(payload: AuthRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    password = payload.password.strip()

    if not email:
        raise HTTPException(status_code=400, detail="Email is required.")
    if len(password) < 6:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 6 characters long.",
        )

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email is already registered.")

    user = User(email=email, password_hash=hash_password(password))
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
async def analyze_legal_problem(query: LegalQuery):
    # Input validation
    if not query.problem or len(query.problem.strip()) < 10:
        raise HTTPException(
            status_code=400,
            detail="Please describe your problem in at least a few words."
        )
    
    if len(query.problem) > 2000:
        raise HTTPException(
            status_code=400,
            detail="Please keep your description under 2000 characters."
        )
    
    # Normalize response mode
    mode = (query.reply_mode or "detail").strip().lower()
    if mode not in {"quick", "detail"}:
        mode = "detail"

    # Step 1: Rule-based classification
    category = classify_issue(query.problem)
    
    # Step 2: Build intelligent prompt
    if query.conversation_history:
        system_prompt, user_message = build_followup_prompt(
            query.conversation_history, query.problem, mode
        )
    else:
        system_prompt, user_message = build_prompt(query.problem, category, mode)
    
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

    return LegalResponse(
        response=llm_response,
        detected_category=category
    )

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
