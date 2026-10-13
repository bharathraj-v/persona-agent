export interface DetectedStyle {
  length_preference?: "micro" | "concise" | "detailed";
  capitalization?: "lowercase" | "standard" | "all_caps";
  slang_level?: "none" | "casual" | "heavy";
  emoji_usage?: "none" | "occasional" | "frequent";
  energy?: "chill" | "upbeat" | "serious" | "blunt" | "playful";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  style?: DetectedStyle;
  personaId?: string;
  isStreaming?: boolean;
}

export interface PersonaInfo {
  id: string;
  name: string;
  avatar: string;
  tagline: string;
  system_prompt?: string;
}

export interface TraitScore {
  trait_id: string;
  name: string;
  domain: string;
  score: number;
  confidence: number;
  observation_count: number;
  low_anchor: string;
  high_anchor: string;
  scale_min: number;
  scale_max: number;
}
