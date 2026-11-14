// Public API of the FloodGuard risk engine. This is the integration boundary with the
// backend: the backend owns storage, endpoints, scheduling, admin actions and notifications,
// and calls these functions. Nothing here touches a database or sends anything.

// Core assessment (pure, deterministic)
export { assessCommunity } from "./engine/assess.ts";
export { METHOD_VERSION, DISCLAIMER, ASSESSMENT_VALIDITY_H } from "./engine/config.ts";
export type * from "./engine/types.ts";

// Fetch + assess for one community (Open-Meteo forecast + GloFAS river discharge)
export { runAssessment, type PipelineResult } from "./pipeline/runAssessment.ts";

// Resident weather payload, built from the same forecast the engine used
export { buildWeatherResponse, classifyIntensity, type WeatherResponse } from "./weather/summary.ts";

// Provider adapters (if the backend wants to fetch/cache separately)
export { fetchForecast, fetchRiverDischarge, toEngineInputs, type OpenMeteoConfig } from "./providers/openMeteo.ts";

// Climatology generation (offline; output goes into each community's record)
export { assembleClimatology } from "./climatology/build.ts";
export { PILOT_COMMUNITIES } from "./communities/pilot.ts";

// Optional LLM explanation guardrails
export { buildExplanationPrompt, acceptExplanation } from "./explain/prompt.ts";

// Conversion to the resident frontend's RiskAssessmentCard shape
export { toFrontendRiskAssessment, type FrontendRiskAssessment } from "./adapters/frontend.ts";

// Vultr Serverless Inference explanation client
export { explainAssessment, DEFAULT_VULTR_MODEL, type ExplanationResult } from "./explain/vultr.ts";
