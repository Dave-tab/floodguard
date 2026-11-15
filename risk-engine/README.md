# FloodGuard AI — Risk engine & AI explanations

Self-contained package for the `feat/weather-risk-engine` workstream: the preliminary
community flood-risk engine, weather inputs, local climatology and the optional AI
explanation layer. It has its own `package.json` and does not touch the frontend app in
the repository root (the root `tsconfig.app.json` only builds `src/`, and this folder passes
the root ESLint config).

> Every output is a **preliminary risk assessment**, not an official warning or a validated
> prediction. Severity is owned by the deterministic engine; AI text only rephrases it and
> is checked before use (falls back to the engine's own summary).

## What it does

- **Hybrid assessment:** NWP rainfall forecasts (Open-Meteo) and GloFAS river forecasts,
  each judged against the location's own 20-year history (ERA5 percentiles, GloFAS
  return periods) rather than fixed national thresholds, plus admin-verified evidence.
- **Four severities** (low / high / severe / critical) with gates: Severe and Critical need
  corroboration (e.g. river above its 20-year level, a verified active flood, or an official
  warning). Caps are recorded in `severityCappedBy`.
- **Evidence confidence** reported separately from risk (coverage, freshness, source quality,
  agreement). Missing or stale data gives `insufficient_data`, never Low.
- **Unverified resident reports never change the score.** Verified evidence is weighted by
  reliability, distance and age; duplicates are merged.
- **AI explanation** via Vultr Serverless Inference (OpenAI-compatible), reasoning disabled,
  with rule-based output checks (wrong severity, official-warning or evacuation claims,
  leaked jargon, length).

## Integration

Everything is exported from [`src/index.ts`](src/index.ts). The engine has no database or
HTTP server of its own; the backend calls it.

```ts
import { runAssessment, explainAssessment, toFrontendRiskAssessment } from "./risk-engine/src/index.ts";

const { assessment, weather } = await runAssessment(community, { observations });
const explanation = await explainAssessment(assessment, { apiKey: process.env.VULTR_INFERENCE_API_KEY! });
const forCard = toFrontendRiskAssessment(assessment, explanation); // shape of RiskAssessmentCard
```

- Call it every 3 h per area, and when an incident is verified or an official warning is published.
- Pass **only** admin-verified incidents and active official warnings as `observations`.
  Pending reports go in `unverifiedSignals` (shown to admins, never scored).
- Store `assessment` as returned (including `methodVersion`). After `validUntil` it must
  leave current warnings and must not become Low.
- Only request a new AI explanation when the assessment changes, to keep cost down.

**Known contract difference:** the frontend's `RiskLevel` type is
`low | moderate | high | critical`; the approved levels are `low | high | severe | critical`.
`toFrontendRiskAssessment` passes `severe` through unchanged rather than relabelling it, so
the frontend type needs `severe` added (and `moderate` retired).

## Layout

| Path | What |
| --- | --- |
| `src/index.ts` | Public API |
| `src/engine/` | Deterministic engine: scaling, evidence weighting, gates, confidence; tunables in `config.ts` |
| `src/providers/openMeteo.ts` | Open-Meteo forecast, GloFAS flood API and ERA5 archive adapters |
| `src/weather/summary.ts` | Resident weather payload (from the same forecast the engine used) |
| `src/climatology/build.ts` | Rainfall percentiles and Gumbel return-period discharge |
| `src/pipeline/runAssessment.ts` | Fetch → assess for one area; provider failures become missing inputs |
| `src/explain/` | AI prompt, output checks and Vultr client |
| `src/adapters/frontend.ts` | Conversion to the frontend `RiskAssessment` shape |
| `src/communities/pilot.ts` | Pilot areas (river reaches checked by hand) |
| `data/climatology.json` | Generated local climatology for the pilots |

## Commands (run inside `risk-engine/`)

```bash
npm install
npm test               # 55 tests
npm run typecheck
npm run assess:demo    # live assessment of the pilot areas
npm run explain:live   # live AI explanation test (needs VULTR_INFERENCE_API_KEY in .env)
npm run climatology    # rebuild data/climatology.json
```

Copy `.env.example` to `.env` for the Vultr key. Never commit `.env`.

## Status and limitations

- Preliminary: thresholds and coefficients are starting values, not yet back-tested.
- Five pilot areas so far (Ikorodu, Lekki/Ajah, Lokoja, Makurdi, Yenagoa). Scaling to all 774
  LGAs needs LGA boundary polygons and community coordinates from the location dataset.
- All live inputs are modelled (5–25 km grids); no live local gauges yet, so confidence stays
  Low/Medium until NIHSA/NiMet station data is obtained. The Yenagoa river reach is unverified.
- Open-Meteo's free tier is non-commercial only.
