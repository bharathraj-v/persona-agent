from fastapi import APIRouter, Depends
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.db.session import get_db
from app.db.models import UserTraitScore, TraitObservation, TraitCatalog, UnstructuredMemory, ChatMessageRecord
from app.api.schemas import UserProfileOut, TraitScoreOut

router = APIRouter(prefix="/api/profile", tags=["profile"])



@router.get("/{user_id}/traits", response_model=UserProfileOut)
async def get_user_traits(user_id: str, db: AsyncSession = Depends(get_db)):
    """Fetch all scored traits, current confidence levels, and observation counts for a user."""
    stmt = (
        select(UserTraitScore, TraitCatalog)
        .join(TraitCatalog, UserTraitScore.trait_id == TraitCatalog.id)
        .where(UserTraitScore.user_id == user_id)
        .order_by(UserTraitScore.confidence.desc())
    )
    results = (await db.execute(stmt)).all()

    traits_out: List[TraitScoreOut] = []
    for score_row, catalog_row in results:
        traits_out.append(
            TraitScoreOut(
                trait_id=score_row.trait_id,
                name=catalog_row.name,
                domain=catalog_row.domain,
                score=score_row.score,
                confidence=score_row.confidence,
                observation_count=score_row.observation_count,
                low_anchor=catalog_row.low_anchor,
                high_anchor=catalog_row.high_anchor,
                scale_min=catalog_row.scale_min,
                scale_max=catalog_row.scale_max
            )
        )

    return UserProfileOut(
        user_id=user_id,
        total_traits_tracked=len(traits_out),
        traits=traits_out
    )


@router.get("/{user_id}/observations")
async def get_user_observations(user_id: str, limit: int = 50, db: AsyncSession = Depends(get_db)):
    """Retrieve raw behavioral observations and evidence quotes recorded for a user."""
    stmt = (
        select(TraitObservation, TraitCatalog.name, TraitCatalog.domain)
        .join(TraitCatalog, TraitObservation.trait_id == TraitCatalog.id)
        .where(TraitObservation.user_id == user_id)
        .order_by(TraitObservation.created_at.desc())
        .limit(limit)
    )
    results = (await db.execute(stmt)).all()

    return [
        {
            "id": obs.id,
            "trait_id": obs.trait_id,
            "trait_name": name,
            "domain": domain,
            "observed_score": obs.observed_score,
            "quote": obs.quote,
            "reasoning": obs.reasoning,
            "created_at": obs.created_at.isoformat() if obs.created_at else None
        }
        for obs, name, domain in results
    ]


@router.post("/{user_id}/reset")
async def reset_user_profile(
    user_id: str,
    clear_messages: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """Resets all collected personality profile data for a user (trait scores, observations, unstructured memory).
    If clear_messages is True, also clears message-level chat history.
    """
    scores_res = await db.execute(delete(UserTraitScore).where(UserTraitScore.user_id == user_id))
    obs_res = await db.execute(delete(TraitObservation).where(TraitObservation.user_id == user_id))
    mem_res = await db.execute(delete(UnstructuredMemory).where(UnstructuredMemory.user_id == user_id))

    deleted_messages = 0
    if clear_messages:
        msg_res = await db.execute(delete(ChatMessageRecord).where(ChatMessageRecord.user_id == user_id))
        deleted_messages = msg_res.rowcount or 0

    await db.commit()

    return {
        "status": "success",
        "message": f"Successfully reset profile for user '{user_id}'.",
        "deleted": {
            "traits": scores_res.rowcount or 0,
            "observations": obs_res.rowcount or 0,
            "memories": mem_res.rowcount or 0,
            "messages": deleted_messages
        }
    }

