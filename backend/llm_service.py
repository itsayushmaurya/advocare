import httpx
import os
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "llama-3.3-70b-versatile"  # High-performance model on Groq

async def call_llm(system_prompt: str, user_message: str, history: list = []) -> str:
    messages = [{"role": "system", "content": system_prompt}]
    
    # Add conversation history if exists
    for msg in history:
        messages.append(msg)
    
    messages.append({"role": "user", "content": user_message})
    
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": MODEL,
        "messages": messages,
        "temperature": 0.4,      # Lower = more consistent, structured output
        "max_tokens": 4096,
        "top_p": 0.9
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(GROQ_URL, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
    
    except httpx.TimeoutException:
        print("ERROR: Timeout")
        return get_fallback_response("timeout")
    except httpx.HTTPStatusError as e:
        print("ERROR HTTP:", e.response.status_code, e.response.text)
        return get_fallback_response("api_error")
    except Exception as e:
        print("ERROR UNKNOWN:", str(e))
        return get_fallback_response("unknown")


def get_fallback_response(error_type: str) -> str:
    messages = {
    "timeout": """🔍 ISSUE TYPE
Unable to process at this time.

📋 STEPS TO TAKE
1. Please try again in a moment
2. If urgent, call the National Legal Aid Helpline: 15100
3. For emergencies, call Police: 100

🏛️ WHERE TO FILE COMPLAINT
- National Legal Services Authority: nalsa.gov.in
- Consumer Helpline: consumerhelpline.gov.in

⚖️ YOUR RIGHTS
- You have the right to free legal aid if you cannot afford a lawyer (Article 39A)

💡 IMPORTANT TIP
NALSA provides completely free legal assistance to anyone who needs it.

---CASE_ANALYSIS_START---
STRENGTH_SCORE: 0
POSITIVE_POINTS:
- The user can still take immediate emergency steps
NEGATIVE_POINTS:
- The request could not be processed by the backend
---CASE_ANALYSIS_END---""",
    "api_error": """We're experiencing a technical issue. Please try again shortly.
For immediate help: Call 15100 (Free Legal Aid) or 100 (Police Emergency).

---CASE_ANALYSIS_START---
STRENGTH_SCORE: 0
POSITIVE_POINTS:
- The user can still contact official helplines
NEGATIVE_POINTS:
- The request could not be processed by the backend
---CASE_ANALYSIS_END---""",
    "unknown": """Something went wrong. Please refresh and try again.
For urgent matters: nalsa.gov.in | Helpline: 15100

---CASE_ANALYSIS_START---
STRENGTH_SCORE: 0
POSITIVE_POINTS:
- The user can still contact official helplines
NEGATIVE_POINTS:
- The request could not be processed by the backend
---CASE_ANALYSIS_END---""",
    }
    return messages.get(error_type, messages["unknown"])