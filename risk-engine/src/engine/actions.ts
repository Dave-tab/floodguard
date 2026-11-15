// Precautionary guidance per severity. Deliberately avoids evacuation orders: those come
// only from NEMA / SEMAs and are surfaced through linked official warnings (PRD-FR-09).
import type { FloodMechanism, Severity } from "./types.ts";

export function recommendedActions(severity: Severity | null, mechanism: FloodMechanism): string[] {
  const river = mechanism !== "pluvial";
  if (severity == null) {
    return [
      "Risk information is currently unavailable; do not assume conditions are safe.",
      "Check official NEMA, NIHSA and State Emergency Management Agency channels.",
    ];
  }
  const common = ["Follow official NEMA and State Emergency Management Agency updates."];
  switch (severity) {
    case "low":
      return ["Keep drains around your home clear of refuse.", "Know your nearest high ground and route to it.", ...common];
    case "high":
      return [
        "Clear gutters and drains near your property; report blocked drains.",
        "Move valuables, documents and electrical items above floor level.",
        river ? "Watch river levels and avoid riverbanks and flood plains." : "Avoid low-lying roads and underpasses during heavy rain.",
        ...common,
      ];
    case "severe":
      return [
        "Prepare an emergency bag: documents, medicines, drinking water, phone charger.",
        "Do not walk or drive through flood water — 15 cm of moving water can knock a person down.",
        "Agree a meeting point with your household and check on vulnerable neighbours.",
        river ? "Be ready to move to higher ground if authorities advise it." : "Stay away from drainage channels and canals during rainfall.",
        ...common,
      ];
    case "critical":
      return [
        "Be ready to move to higher ground immediately if authorities advise it.",
        "Switch off electricity at the mains if water is entering buildings.",
        "Do not enter flood water; keep children away from drainage channels.",
        "Call emergency services (112) if you are in immediate danger.",
        ...common,
      ];
  }
}
