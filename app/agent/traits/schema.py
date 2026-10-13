from typing import List, Optional
from pydantic import BaseModel, Field


class TraitObservationItem(BaseModel):
    trait_id: str = Field(..., description="ID matching trait_catalog, e.g. 'spending_style'")
    observed_score: float = Field(..., description="Estimated score on the trait's scale (e.g. 1-7 or 1-5)")
    confidence_delta: float = Field(0.15, description="Confidence gained from this turn (typically 0.1 to 0.3)")
    quote: str = Field(..., description="Exact user words demonstrating this trait")
    reasoning: str = Field(..., description="Concise deduction linking the quote to the scoring rubric")


class TurnExtractionResult(BaseModel):
    observations: List[TraitObservationItem] = Field(default_factory=list, description="Extracted trait signals")
    unstructured_notes: Optional[str] = Field(None, description="Any notable facts volunteered by the user to retain")


class TraitCatalogItem(BaseModel):
    id: str
    domain: str
    name: str
    scale_min: float
    scale_max: float
    low_anchor: str
    high_anchor: str
    is_active: bool


class UserTraitScoreResponse(BaseModel):
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
