from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class ChatMessageRequest(BaseModel):
    message: str = Field(..., description="User's input message")
    user_id: str = Field("user_1", description="Unique user identifier")
    thread_id: str = Field("thread_1", description="Conversation thread identifier")
    persona_id: Optional[str] = Field(None, description="Optional forced persona ID. If omitted, LLM decides over the first turns.")


class ChatMessageResponse(BaseModel):
    reply: str
    persona_id: str
    detected_style: Dict[str, Any]
    targeted_traits: List[Dict[str, Any]]
    thread_id: str


class TraitScoreOut(BaseModel):
    trait_id: str
    name: str
    domain: str
    score: float
    confidence: float
    observation_count: int
    low_anchor: str
    high_anchor: str
    scale_min: float
    scale_max: float


class UserProfileOut(BaseModel):
    user_id: str
    total_traits_tracked: int
    traits: List[TraitScoreOut]
