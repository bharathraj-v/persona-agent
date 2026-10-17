import os
from functools import lru_cache

PROMPTS_DIR = os.path.dirname(os.path.abspath(__file__))


@lru_cache(maxsize=32)
def load_prompt(filename: str) -> str:
    """Loads a markdown prompt template from the prompts directory with caching."""
    path = os.path.join(PROMPTS_DIR, filename)
    if not os.path.exists(path):
        raise FileNotFoundError(f"Prompt file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return f.read().strip()
