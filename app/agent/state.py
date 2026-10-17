from typing import List, Dict, Any, Optional, Annotated
from typing_extensions import TypedDict
from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages


class DetectedStyle(TypedDict, total=False):
    length_preference: str  # "micro" (<10 words), "concise" (10-30), "detailed" (>30)
    capitalization: str     # "lowercase", "standard", "all_caps"
    slang_level: str        # "none", "casual", "heavy"
    emoji_usage: str        # "none", "occasional", "frequent"
    energy: str             # "chill", "upbeat", "serious", "blunt"


class TargetedTrait(TypedDict, total=False):
    trait_id: str
    name: str
    domain: str
    current_confidence: float
    current_score: Optional[float]
    low_anchor: str
    high_anchor: str
    scale_min: float
    scale_max: float


class AgentState(TypedDict):
    messages: Annotated[List[AnyMessage], add_messages]
    user_id: str
    persona_id: Optional[str]                   # 'discovery', 'curious_banter', etc.
    persona_locked: Optional[bool]              # Once chosen, locked to prevent jarring shifts
    thread_id: Optional[str]
    user_style: Optional[DetectedStyle]
    targeted_traits: Optional[List[TargetedTrait]]  # Kept for backward compatibility
    current_target_trait: Optional[TargetedTrait]   # The specific trait being elicited right now
    trait_turns_count: Optional[int]            # Number of turns spent probing this trait
    latest_extracted_trait: Optional[Dict[str, Any]]  # Trait insight emitted this turn
    all_traits_filled: Optional[bool]           # True if all 8 traits reach >= 0.75 confidence
    elicitation_directive: Optional[str]
    unstructured_context: Optional[str]
