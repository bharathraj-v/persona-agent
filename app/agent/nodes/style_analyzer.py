import re
from typing import Dict, Any
from langchain_core.messages import HumanMessage
from app.agent.state import AgentState, DetectedStyle

SLANG_WORDS = {
    "lol", "lmao", "idk", "tbh", "ngl", "rn", "fr", "bro", "dude", "u", "ur",
    "gonna", "wanna", "imo", "smh", "bet", "nah", "yeah", "yep", "sus", "goat"
}

EMOJI_PATTERN = re.compile(
    r"[\U0001F600-\U0001F64F"  # emoticons
    r"\U0001F300-\U0001F5FF"  # symbols & pictographs
    r"\U0001F680-\U0001F6FF"  # transport & map
    r"\U0001F1E0-\U0001F1FF"  # flags
    r"\U00002702-\U000027B0"
    r"\U000024C2-\U0001F251"
    r"]+", flags=re.UNICODE
)


def analyze_user_style(state: AgentState) -> Dict[str, Any]:
    """Analyzes the user's latest messages to detect texting style and communication pacing."""
    messages = state.get("messages", [])
    human_messages = [m for m in messages if isinstance(m, HumanMessage)]

    if not human_messages:
        return {
            "user_style": {
                "length_preference": "concise",
                "capitalization": "standard",
                "slang_level": "casual",
                "emoji_usage": "occasional",
                "energy": "chill"
            }
        }

    latest = human_messages[-1]
    content = str(latest.content).strip()
    words = content.split()
    word_count = len(words)

    # 1. Length preference
    if word_count <= 8:
        length_pref = "micro"
    elif word_count <= 25:
        length_pref = "concise"
    else:
        length_pref = "detailed"

    # 2. Capitalization
    has_letters = bool(re.search(r"[a-zA-Z]", content))
    if has_letters and content.islower():
        cap_style = "lowercase"
    elif has_letters and content.isupper() and word_count > 1:
        cap_style = "all_caps"
    else:
        cap_style = "standard"

    # 3. Slang density
    lower_words = [w.lower().strip(".,!?") for w in words]
    slang_matches = sum(1 for w in lower_words if w in SLANG_WORDS)
    if slang_matches >= 2 or (slang_matches >= 1 and word_count <= 5):
        slang_lvl = "heavy"
    elif slang_matches == 1:
        slang_lvl = "casual"
    else:
        slang_lvl = "none"

    # 4. Emoji usage
    emojis_found = EMOJI_PATTERN.findall(content)
    if len(emojis_found) >= 2:
        emoji_usage = "frequent"
    elif len(emojis_found) == 1:
        emoji_usage = "occasional"
    else:
        emoji_usage = "none"

    # 5. Energy detection
    if "!" in content or cap_style == "all_caps":
        energy = "upbeat"
    elif word_count <= 4 and cap_style == "lowercase" and not any(p in content for p in "!?:)"):
        energy = "blunt"
    elif any(s in lower_words for s in ["lol", "lmao", "haha", "😂", "💀"]):
        energy = "playful"
    else:
        energy = "chill"

    style: DetectedStyle = {
        "length_preference": length_pref,
        "capitalization": cap_style,
        "slang_level": slang_lvl,
        "emoji_usage": emoji_usage,
        "energy": energy
    }

    return {"user_style": style}
