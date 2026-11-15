// Static public content. SAFETY_GUIDELINES is copied verbatim from the team's frontend
// (src/data/mockResidentData.ts on main) so both show the same guidance. No emergency
// numbers are served until the team has a verified, sourced list.
import type { HazardCategory } from "./mapping.ts";

export interface SafetyGuidelineItem { id: string; title: string; description: string; category: "before" | "during" | "after" | "general" }

export const SAFETY_GUIDELINES: SafetyGuidelineItem[] = [
  {
    id: "before-flood",
    title: "Prepare before flooding",
    description: "Keep important documents, essential medicines and emergency supplies in a safe, accessible place.",
    category: "before",
  },
  {
    id: "avoid-floodwater",
    title: "Stay away from floodwater",
    description: "Do not walk, swim or drive through floodwater. Its depth, speed and hidden hazards may be difficult to judge.",
    category: "during",
  },
  {
    id: "move-to-safety",
    title: "Move to safer ground",
    description: "If water is rising around you, move away from low-lying areas and follow instructions from local emergency authorities.",
    category: "during",
  },
  {
    id: "return-safely",
    title: "Take care after flooding",
    description: "Do not return to affected buildings until authorities say it is safe. Avoid contact with contaminated water.",
    category: "after",
  },
];

/** Display labels from docs/IMPLEMENTATION_CONTRACTS.md (DEC-004). */
export const CATEGORY_LABELS: Record<HazardCategory, string> = {
  flooded_road: "Flooded road",
  rising_water_level: "Rising water level",
  blocked_drainage: "Blocked drainage",
  overflowing_waterway: "Overflowing waterway",
  damaged_drainage: "Damaged drainage",
  other: "Other",
};
