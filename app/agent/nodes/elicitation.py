import logging
from typing import Dict, Any, List, Optional
from sqlalchemy import select
from app.agent.state import AgentState, TargetedTrait
from app.agent.traits.catalog import SEED_TRAITS
from app.agent.prompts.loader import load_prompt
from app.db.session import AsyncSessionLocal
from app.db.models import UserTraitScore

logger = logging.getLogger(__name__)


async def select_elicitation_target(state: AgentState) -> Dict[str, Any]:
    """Manages Stage 2 of the personality loop: selects and targets a low-confidence trait to explore."""
    user_id = state.get("user_id", "default_user")
    current_target = state.get("current_target_trait")
    turns_count = state.get("trait_turns_count", 0)
    was_just_extracted = bool(state.get("latest_extracted_trait"))

    # Fetch latest scores for this user from DB
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
                "high_anchor": trait["high_anchor"],
                "scale_min": trait.get("scale_min", 1.0),
                "scale_max": trait.get("scale_max", 7.0)
            })

    # Sort lowest confidence first
    candidates.sort(key=lambda x: x.get("current_confidence", 0.0))

    # If all traits have reached 75%+ confidence, profiling is complete!
    if not candidates:
        logger.info(f"[Elicitation] All traits completed for user={user_id}")
        return {
            "current_target_trait": None,
            "targeted_traits": [],
            "trait_turns_count": 0,
            "all_traits_filled": True,
            "latest_extracted_trait": None,
            "elicitation_directive": (
                "All core personality traits have reached strong confidence (75%+)! "
                "The user's personality profile is fully mapped. Keep the conversation organic, entertaining, and attentive."
            )
        }

    # Decide whether to keep probing current trait or rotate to the next one
    target: Optional[TargetedTrait] = None
    if current_target and not was_just_extracted and turns_count < 2:
        # Check if current target still needs confidence
        curr_conf = scored_map.get(current_target["trait_id"], 0.0)
        if curr_conf < 0.75:
            target = current_target
            turns_count += 1
        else:
            target = candidates[0]
            turns_count = 1
    else:
        # Pick the lowest confidence candidate (or different trait if just extracted)
        target = candidates[0]
        turns_count = 1

    try:
        guidelines = load_prompt("elicitation.md")
    except Exception:
        guidelines = "Frame your probe around concrete everyday scenarios without disclosing trait names."

    directive = (
        f"--- ACTIVE TRAIT ELICITATION GOAL ---\n"
        f"Target Trait: '{target['name']}' ({target['domain']})\n"
        f"Spectrum: '{target['low_anchor']}' vs '{target['high_anchor']}'\n\n"
        f"Instructions:\n"
        f"- Subtly explore their tendencies on this spectrum through a natural conversational question or situational dilemma.\n"
        f"- CRITICAL: Never mention the words '{target['name']}', trait, metric, or psychological terms.\n"
        f"- Express empathy or brief relatable commentary first, then weave in the situational probe.\n\n"
        f"{guidelines}"
    )

    logger.info(f"[Elicitation] Targeting trait '{target['trait_id']}' for user={user_id} (turn={turns_count}, conf={target['current_confidence']:.2f})")

    return {
        "current_target_trait": target,
        "targeted_traits": [target],
        "trait_turns_count": turns_count,
        "all_traits_filled": False,
        "latest_extracted_trait": None,  # Reset for current turn
        "elicitation_directive": directive
    }
