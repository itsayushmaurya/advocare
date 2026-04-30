from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import uvicorn

from llm_service import call_llm
from prompt_engine import build_prompt, build_followup_prompt
from classifier import classify_issue

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


# --- Routes ---
@app.get("/")
def root():
    return {"status": "running", "message": "Be Your Own Lawyer API is live"}

@app.get("/health")
def health():
    return {"status": "healthy"}


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
