from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models import TraitCatalog
from app.agent.traits.schema import TraitCatalogItem
from app.agent.traits.catalog import SEED_TRAITS

router = APIRouter(prefix="/api/traits", tags=["traits"])


@router.get("", response_model=List[TraitCatalogItem])
async def list_traits(db: AsyncSession = Depends(get_db)):
    """List all traits currently in the catalog."""
    result = await db.execute(select(TraitCatalog).where(TraitCatalog.is_active == True))
    traits = result.scalars().all()
    if not traits:
        # Return in-memory seeds if DB not yet migrated
        return [
            TraitCatalogItem(
                id=t["id"],
                domain=t["domain"],
                name=t["name"],
                scale_min=t["scale_min"],
                scale_max=t["scale_max"],
                low_anchor=t["low_anchor"],
                high_anchor=t["high_anchor"],
                is_active=True
            ) for t in SEED_TRAITS
        ]
    return [
        TraitCatalogItem(
            id=t.id,
            domain=t.domain,
            name=t.name,
            scale_min=t.scale_min,
            scale_max=t.scale_max,
            low_anchor=t.low_anchor,
            high_anchor=t.high_anchor,
            is_active=t.is_active
        ) for t in traits
    ]


@router.get("/{trait_id}", response_model=TraitCatalogItem)
async def get_trait(trait_id: str, db: AsyncSession = Depends(get_db)):
    """Retrieve details and scoring anchors for a specific trait."""
    result = await db.execute(select(TraitCatalog).where(TraitCatalog.id == trait_id))
    trait = result.scalars().first()
    if not trait:
        for t in SEED_TRAITS:
            if t["id"] == trait_id:
                return TraitCatalogItem(
                    id=t["id"],
                    domain=t["domain"],
                    name=t["name"],
                    scale_min=t["scale_min"],
                    scale_max=t["scale_max"],
                    low_anchor=t["low_anchor"],
                    high_anchor=t["high_anchor"],
                    is_active=True
                )
        raise HTTPException(status_code=404, detail="Trait not found")
    return TraitCatalogItem(
        id=trait.id,
        domain=trait.domain,
        name=trait.name,
        scale_min=trait.scale_min,
        scale_max=trait.scale_max,
        low_anchor=trait.low_anchor,
        high_anchor=trait.high_anchor,
        is_active=trait.is_active
    )
