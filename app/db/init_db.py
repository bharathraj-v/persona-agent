from sqlalchemy import select
from app.db.session import engine, AsyncSessionLocal
from app.db.models import Base, TraitCatalog
from app.agent.traits.catalog import SEED_TRAITS


async def init_database():
    """Initializes tables and seeds the default trait catalog into PostgreSQL."""
    # 1. Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 2. Seed Trait Catalog
    async with AsyncSessionLocal() as session:
        for t in SEED_TRAITS:
            stmt = select(TraitCatalog).where(TraitCatalog.id == t["id"])
            existing = (await session.execute(stmt)).scalars().first()
            if not existing:
                catalog_item = TraitCatalog(
                    id=t["id"],
                    domain=t["domain"],
                    name=t["name"],
                    scale_min=t["scale_min"],
                    scale_max=t["scale_max"],
                    low_anchor=t["low_anchor"],
                    high_anchor=t["high_anchor"],
                    is_active=True
                )
                session.add(catalog_item)
        await session.commit()
    print("Database initialization and trait catalog seeding complete.")


if __name__ == "__main__":
    import asyncio
    asyncio.run(init_database())
