KEYWORD_MAP = {
    "cybercrime": [
        "scam", "fraud", "hacked", "phishing", "otp", "online cheating",
        "fake website", "upi fraud", "cybercrime", "ransomware", "identity theft"
    ],
    "consumer": [
        "product", "refund", "defective", "ecommerce", "amazon", "flipkart",
        "service", "overcharged", "billing", "warranty", "replacement"
    ],
    "labour": [
        "salary", "fired", "layoff", "employer", "job", "workplace",
        "harassment", "pf", "provident fund", "overtime", "termination"
    ],
    "rental": [
        "landlord", "rent", "deposit", "eviction", "lease", "tenant",
        "flat", "house", "agreement", "security deposit"
    ],
    "domestic_violence": [
        "husband", "wife", "domestic", "abuse", "violence", "dowry",
        "marriage", "divorce", "family", "beaten"
    ],
    "property": [
        "property", "land", "ownership", "encroachment", "registration",
        "mutation", "plot", "boundary", "dispute"
    ]
}

def classify_issue(user_input: str) -> str:
    text = user_input.lower()
    scores = {category: 0 for category in KEYWORD_MAP}
    
    for category, keywords in KEYWORD_MAP.items():
        for kw in keywords:
            if kw in text:
                scores[category] += 1
    
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "general"


def detect_urgency(user_input: str) -> str:
    """Detect if the legal issue requires immediate emergency response."""
    HIGH_URGENCY_KEYWORDS = [
        "beaten", "threatened", "arrested", "kidnapped", "bleeding",
        "unconscious", "suicide", "dying", "attack", "rape",
        "fire", "accident", "emergency", "help", "danger", "injured"
    ]
    
    text = user_input.lower()
    for keyword in HIGH_URGENCY_KEYWORDS:
        if keyword in text:
            return "high"
    return "normal"