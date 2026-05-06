from classifier import classify_issue, detect_urgency

def test_classification():
    test_cases = [
        ("I was scammed online and lost my money", "cybercrime"),
        ("My landlord is not returning my deposit", "rental"),
        ("I got a traffic challan for not wearing a helmet", "traffic"),
        ("There is an unauthorized transaction in my bank account", "banking"),
        ("I want to register my property plot", "property"),
        ("My boss fired me without paying salary", "labour"),
        ("I bought a defective product from amazon", "consumer"),
        ("My husband is beating me", "domestic_violence"),
        ("Hello, how are you?", "general"),
    ]
    
    for text, expected in test_cases:
        result = classify_issue(text)
        assert result == expected, f"Expected {expected} for '{text}', got {result}"
    print("Classification tests passed!")

def test_urgency():
    test_cases = [
        ("I am being beaten by someone", "high"),
        ("I have been arrested", "high"),
        ("How to file a consumer complaint?", "normal"),
        ("I have an emergency, help me", "high"),
    ]
    
    for text, expected in test_cases:
        result = detect_urgency(text)
        assert result == expected, f"Expected {expected} for '{text}', got {result}"
    print("Urgency tests passed!")

if __name__ == "__main__":
    test_classification()
    test_urgency()
