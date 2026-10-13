from fastapi import APIRouter, HTTPException
from typing import List
from app.agent.personas.registry import list_personas, get_persona, Persona

router = APIRouter(prefix="/api/personas", tags=["personas"])


@router.get("", response_model=List[Persona])
async def get_all_personas():
    """Retrieve all available conversational personas."""
    return list_personas()


@router.get("/{persona_id}", response_model=Persona)
async def get_persona_detail(persona_id: str):
    """Retrieve details and baseline style for a specific persona."""
    persona = get_persona(persona_id)
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    return persona
