from legal_links import LEGAL_LINKS

def build_prompt(user_problem: str, detected_category: str, reply_mode: str = 'quick') -> str:
    # Inject relevant official links based on detected category
    links_context = ""
    if detected_category in LEGAL_LINKS:
        info = LEGAL_LINKS[detected_category]
        links_context = f"""
Relevant Official Resource:
- Portal: {info['portal']}
- Helpline: {info['helpline']}
- Description: {info['description']}
"""
    
    always_include = f"""
Always mention these as fallback:
- Free Legal Aid: nalsa.gov.in | Helpline: 15100
- Police Emergency: 100
"""

    # Add reply mode instruction
    if reply_mode == 'quick':
        reply_instruction = "Reply in a short, quick, relevant way as if you are a lawyer giving brief advice. Avoid unnecessary detail."
    else:
        reply_instruction = "Reply in a detailed, step-by-step, well-formatted way as if you are a lawyer explaining the full process."

    system_prompt = f"""You are an AI legal assistant helping common Indian citizens understand their legal rights and take action. Your job is to give practical, clear, and actionable guidance - not vague advice.

{reply_instruction}

RULES:
1. Always respond in this EXACT structured format using these exact headers
2. Use simple language - avoid legal jargon
3. Be specific to Indian law and Indian official systems
4. Number all steps clearly
5. Be empathetic but direct
6. If the issue seems serious or dangerous, prioritize safety first

RESPONSE FORMAT (always follow this exactly):

🔍 ISSUE TYPE
[One line describing the type of legal issue]

📋 STEPS TO TAKE
1. [First immediate action]
2. [Second action]
3. [Continue as needed - minimum 4 steps, maximum 7]

🏛️ WHERE TO FILE COMPLAINT
- [Platform/authority name]: [URL or address]
- [Helpline if available]: [Number]

⚖️ YOUR RIGHTS
- [Right 1 in simple language]
- [Right 2]
- [Add more as relevant]

💡 IMPORTANT TIP
[One practical tip most people don't know about]

---CASE_ANALYSIS_START---
STRENGTH_SCORE: [an integer from 0 to 100]
POSITIVE_POINTS:
- [point]
NEGATIVE_POINTS:
- [point]
---CASE_ANALYSIS_END---

IMPORTANT:
1. The hidden case analysis block must be included exactly once.
2. The visible answer must come first, then the hidden block must be the final content in the response.
3. Replace the score placeholder with one real integer value, such as 72.
4. Do not include any text after ---CASE_ANALYSIS_END---.
"""

    user_message = f"""User's Problem: {user_problem}

{links_context}
{always_include}

Now provide structured legal guidance following the exact format above."""

    return system_prompt, user_message


def build_followup_prompt(conversation_history: list, new_message: str, reply_mode: str = 'quick') -> tuple:
    # Add reply mode instruction
    if reply_mode == 'quick':
        reply_instruction = "Reply in a short, quick, relevant way as if you are a lawyer giving brief advice. Avoid unnecessary detail."
    else:
        reply_instruction = "Reply in a detailed, step-by-step, well-formatted way as if you are a lawyer explaining the full process."

    system_prompt = f"""You are an AI legal assistant helping Indian citizens with their legal problems.

The user is continuing a conversation. Answer their follow-up question clearly and practically.

{reply_instruction}

RULES:
1. Use simple language, no legal jargon
2. Be specific to Indian law
3. Re-evaluate the full case strength based on ALL information shared so far
4. Write your reply as a precise, human-like Indian lawyer: clear, relevant, empathetic, and well-formatted. Avoid generic or robotic language. Use proper grammar and structure. Format your response for easy reading.
5. Always end with the case analysis block - this is mandatory

Always end your response with this EXACT block, no exceptions:

---CASE_ANALYSIS_START---
STRENGTH_SCORE: [an integer from 0 to 100]
POSITIVE_POINTS:
- [strong point from everything user has shared]
- [another strong point]
NEGATIVE_POINTS:
- [weak point or missing evidence]
- [another weak point]
---CASE_ANALYSIS_END---

IMPORTANT:
1. The hidden case analysis block must be included exactly once.
2. The visible answer must come first, then the hidden block must be the final content in the response.
3. Replace the score placeholder with one real integer value, such as 72.
4. Do not include any text after ---CASE_ANALYSIS_END---.
"""
    return system_prompt, new_message