from typing import List, Dict, Any

SEED_TRAITS: List[Dict[str, Any]] = [
    {
        "id": "communication_directness",
        "domain": "Communication",
        "name": "Communication Directness",
        "scale_min": 1.0,
        "scale_max": 7.0,
        "low_anchor": "Diplomatic and polite, softens opinions, hints indirectly",
        "high_anchor": "Direct and candid, straightforward, says exactly what they think"
    },
    {
        "id": "curiosity_breadth",
        "domain": "Intellect & Learning",
        "name": "Curiosity Breadth",
        "scale_min": 1.0,
        "scale_max": 7.0,
        "low_anchor": "Specialist, prefers focusing deeply on a few familiar topics",
        "high_anchor": "Generalist, omnivorous curiosity, excited about varied and random subjects"
    },
    {
        "id": "decision_speed",
        "domain": "Decision Making",
        "name": "Decision Speed",
        "scale_min": 1.0,
        "scale_max": 7.0,
        "low_anchor": "Deliberate and analytical, gathers lots of data before choosing",
        "high_anchor": "Fast and instinctive, acts quickly and adjusts on the fly"
    },
    {
        "id": "structure_preference",
        "domain": "Work & Lifestyle",
        "name": "Structure vs Spontaneity",
        "scale_min": 1.0,
        "scale_max": 7.0,
        "low_anchor": "Spontaneous, wings it, loves fluid and unstructured days",
        "high_anchor": "Highly structured, organized, loves routines, plans, and checklists"
    },
    {
        "id": "social_energy",
        "domain": "Social & Energy",
        "name": "Social Energy",
        "scale_min": 1.0,
        "scale_max": 7.0,
        "low_anchor": "Introverted, recharged by solitude, quiet environments, and independent work",
        "high_anchor": "Extroverted, energized by active discussions, banter, and people"
    },
    {
        "id": "humor_style",
        "domain": "Social & Energy",
        "name": "Humor Style",
        "scale_min": 1.0,
        "scale_max": 7.0,
        "low_anchor": "Dry, sarcastic, deadpan, and cynical",
        "high_anchor": "Light, warm, goofy, and playful"
    },
    {
        "id": "risk_tolerance",
        "domain": "Disposition",
        "name": "Risk Tolerance",
        "scale_min": 1.0,
        "scale_max": 7.0,
        "low_anchor": "Risk-averse, prioritizes safety, predictability, and downside protection",
        "high_anchor": "High risk tolerance, excited by bold bets, novelty, and uncertainty"
    },
    {
        "id": "stress_composure",
        "domain": "Disposition",
        "name": "Stress Composure",
        "scale_min": 1.0,
        "scale_max": 7.0,
        "low_anchor": "Expressive when stressed, vents openly, emotions first",
        "high_anchor": "Steady and calm under pressure, compartmentalized, solutions first"
    }
]
