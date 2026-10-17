import datetime
from sqlalchemy import Column, String, Float, Integer, Boolean, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class TraitCatalog(Base):
    __tablename__ = "trait_catalog"

    id = Column(String(100), primary_key=True)  # e.g. "financial_generosity"
    domain = Column(String(100), nullable=False)  # e.g. "Money and Fairness"
    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    scale_min = Column(Float, default=1.0)
    scale_max = Column(Float, default=7.0)
    low_anchor = Column(Text, nullable=False)  # Anchor definition for 1
    high_anchor = Column(Text, nullable=False)  # Anchor definition for 7 / 5
    is_active = Column(Boolean, default=True)

    scores = relationship("UserTraitScore", back_populates="trait", cascade="all, delete-orphan")
    observations = relationship("TraitObservation", back_populates="trait", cascade="all, delete-orphan")


class UserTraitScore(Base):
    __tablename__ = "user_trait_scores"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(100), nullable=False, index=True)
    trait_id = Column(String(100), ForeignKey("trait_catalog.id"), nullable=False)
    score = Column(Float, nullable=False)  # Current estimated value
    confidence = Column(Float, default=0.0)  # 0.0 to 1.0 (e.g. 0.75 target)
    observation_count = Column(Integer, default=0)
    last_updated = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    trait = relationship("TraitCatalog", back_populates="scores")

    __table_args__ = (
        Index("idx_user_trait", "user_id", "trait_id", unique=True),
    )


class TraitObservation(Base):
    __tablename__ = "trait_observations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(100), nullable=False, index=True)
    trait_id = Column(String(100), ForeignKey("trait_catalog.id"), nullable=False)
    thread_id = Column(String(100), nullable=True)
    observed_score = Column(Float, nullable=False)
    quote = Column(Text, nullable=False)  # Direct quote / excerpt from user
    reasoning = Column(Text, nullable=False)  # LLM deduction rationale
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    trait = relationship("TraitCatalog", back_populates="observations")


class UnstructuredMemory(Base):
    __tablename__ = "unstructured_memory"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(100), nullable=False, unique=True, index=True)
    content = Column(Text, nullable=False, default="")  # Dynamic capped summary string
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class ChatMessageRecord(Base):
    __tablename__ = "chat_messages"

    id = Column(String(100), primary_key=True)  # e.g. "msg_<uuid>"
    user_id = Column(String(100), nullable=False, index=True)
    thread_id = Column(String(100), nullable=False, index=True)
    role = Column(String(20), nullable=False)  # "user" | "assistant" | "system"
    content = Column(Text, nullable=False)
    persona_id = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    __table_args__ = (
        Index("idx_user_thread_messages", "user_id", "thread_id", "created_at"),
    )

