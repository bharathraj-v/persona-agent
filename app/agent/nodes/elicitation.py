from typing import Dict, Any, List
from sqlalchemy import select
from app.agent.state import AgentState, TargetedTrait
from app.agent.traits.catalog import SEED_TRAITS
from app.db.session import AsyncSessionLocal
from app.db.models import UserTraitScore, TraitCatalog


async def select_elicitation_target(state: AgentState) -> Dict[str, Any]:
    """Identifies lowest-confidence traits for the user and crafts subtle conversational elicitation guidance."""
    user_id = state.get("user_id", "default_user")

    # Fetch existing scores for this user from DB
    scored_map: Dict[str, float] = {}
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(UserTraitScore.trait_id, UserTraitScore.confidence).where(UserTraitScore.user_id == user_id)
        )
        for row in result.all():
            scored_map[row.trait_id] = row.confidence

    # Find traits with confidence < 0.75
    candidates: List[TargetedTrait] = []
    for trait in SEED_TRAITS:
        t_id = trait["id"]
        conf = scored_map.get(t_id, 0.0)
        if conf < 0.75:
            candidates.append({
                "trait_id": t_id,
                "name": trait["name"],
                "domain": trait["domain"],
                "current_confidence": conf,
                "low_anchor": trait["low_anchor"],
                "high_anchor": trait["high_anchor"]
            })

    # Sort by lowest confidence first
    candidates.sort(key=lambda x: x.get("current_confidence", 0.0))

    if not candidates:
        return {
            "targeted_traits": [],
            "elicitation_directive": "All core traits have strong confidence. Keep the conversation natural, playful, and responsive."
        }

    target = candidates[0]
    directive = (
        f"Gently and subtly steer or inquire to learn about their '{target['name']}' "
        f"(spectrum: '{target['low_anchor']}' vs '{target['high_anchor']}'). "
        "CRITICAL: Never mention psychological terms or trait names. "
        "Ask a concrete, everyday situation or relatable choice that naturally reveals this tendency while staying 100% in your persona."
    )

    return {
        "targeted_traits": [target],
        "elicitation_directive": directive
    }
