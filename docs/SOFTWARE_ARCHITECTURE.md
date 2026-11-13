# FLOODGUARD AI

## Software Architecture Document (SAD)

*System structure, component responsibilities, data flows and technical decisions*

| Document Information | Details |
|---|---|
| Document ID | FG-SAD-001 |
| Version / Status | 1.0 / Draft for immediate team execution |
| Project | FloodGuard AI — AI Smart Assistance |
| Delivery Constraint | 36-hour hackathon MVP; scope is time-boxed |

**Confidentiality:** Team working document. Share with project contributors and judges as appropriate.

---

## 1. Purpose and Scope

This document defines the proposed architecture for the FloodGuard AI 36-hour hackathon MVP. It is an implementation guide, not a claim that every component has already been built. The team must update it when implementation choices materially differ.

## 2. Architectural Drivers

- Deliver a working end-to-end product within 36 hours.
- Prefer a small, understandable architecture with low operational overhead.
- Keep risk calculation deterministic and auditable; use generative AI only for optional explanation.
- Protect administrative actions and personal/report data.
- Make data provenance, freshness and missing-data states visible.
- Support mobile-first use and graceful degradation when external services fail.

## 3. Proposed Technology Baseline

| Layer | Recommended Choice | Reason / Constraint |
|---|---|---|
| Web client | React + Vite + TypeScript | Fast iteration, component model, type safety. |
| Styling | Tailwind CSS | Rapid responsive UI; shared tokens/components. |
| Backend / database | Supabase (PostgreSQL) | Managed database, Auth, Storage and Row Level Security reduce backend setup. |
| Maps | Leaflet + OpenStreetMap tiles | Low-cost interactive map; map tiles require attribution and network access. |
| Weather | Open-Meteo or another verified weather provider | Use provider-supported forecast fields; record provider and retrieval time. |
| AI explanation | Optional LLM provider behind a server-side function | Only if time and secure key handling permit; otherwise use deterministic templates. |
| Hosting | Vercel/Netlify for web; Supabase hosted services | Rapid deployment; confirm environment variables and production policies. |

The team should not introduce a separate custom API server unless a concrete requirement cannot be safely handled by Supabase Edge Functions or the selected backend. Avoid adding libraries/services late in the build without a clear owner and integration need.

## 4. System Context

External actors and systems:

- **Resident:** Selects a community, views information and submits observations.
- **Administrator:** Reviews reports, verifies/rejects hazards and manages notices if implemented.
- **Weather provider:** Returns forecast/current weather information for supported coordinates.
- **Optional AI provider:** Converts a structured assessment payload into a short explanation; it is not a source of weather facts.
- **Hosting, database and storage services:** Serve the web client, persist records and store optional report images.

## 5. High-Level Architecture

| Component | Responsibility | Trust Boundary |
|---|---|---|
| React client — resident | Community selection, weather/risk display, report form, verified hazard map/list, safety guidance. | Untrusted client; never enforce authorisation only in UI. |
| React client — admin | Report queue, detail review, permitted status updates, filters. | Admin-only routes are convenience; backend policies enforce access. |
| Supabase Auth | User identity and session management, if account-based access is enabled. | Identity provider. |
| PostgreSQL + RLS | Communities, profiles/roles, hazard reports, assessments and alerts. | Authoritative access-control boundary. |
| Storage | Optional report image uploads with restricted access and safe file constraints. | Private by default; use controlled read access. |
| Weather adapter | Fetch provider data, normalise units/fields, record timestamps and handle failure. | External dependency; data must be attributed. |
| Risk engine | Deterministic rule/score calculation from validated inputs; return status, score, reasons and confidence/limitations. | Trusted application logic; do not accept arbitrary client-provided scores. |
| Explanation service | Optional plain-language explanation from structured assessment; fallback template if unavailable. | Untrusted generated text; validate and constrain output. |

## 6. Component Design

### 6.1 Frontend Modules

- **Community module:** Lists supported communities and coordinates; persists current selection in app state or local preference.
- **Weather module:** Requests weather for selected community coordinates; displays provider, retrieval time and unavailable states.
- **Risk module:** Renders category, score only if appropriate, explanation, input coverage and safety guidance.
- **Report module:** Validates category, description and location; submits a Pending report; displays confirmation.
- **Map module:** Displays only public-safe, verified hazard records; uses distinct markers and accessible list alternative.
- **Admin module:** Protected report queue and report detail actions; status changes require backend authorisation.
- **Shared UI:** Loading, empty, offline/error, validation and confirmation states.

### 6.2 Backend Responsibilities

- Persist reports and status changes with server/database timestamps.
- Enforce role-based permissions using Supabase Auth claims/profile role plus RLS policies.
- Keep weather provider keys and AI provider keys out of browser code where secrets are required.
- Validate all incoming report fields on the server/database boundary.
- Compute or validate risk assessments in trusted code; do not trust a score submitted by the browser.
- Expose only verified/public-safe report fields to resident views.

## 7. Data Model

| Entity | Core Fields | Notes |
|---|---|---|
| profiles | id (auth user), display_name, role, created_at | Role values should be constrained; default role is resident. Admin assignment is controlled, not self-service. |
| communities | id, name, state, lga, latitude, longitude, is_active | Only configured pilot communities are selectable. |
| hazard_reports | id, reporter_id nullable, community_id, category, description, latitude/longitude nullable, status, photo_path nullable, created_at, updated_at, reviewed_by nullable, review_note nullable | New reports Pending; public exposure only after Verified. |
| risk_assessments | id, community_id, risk_level nullable, score nullable, inputs_json, confidence/status, explanation, provider, assessed_at | Store input provenance and missing-data notes; do not store unsupported precision. |
| alerts | id, community_id nullable, source_type, severity, title, message, issued_at, expires_at nullable, created_by nullable | Separate automated weather context from admin-issued notices. |
| shelters (future) | id, name, location, verification_status, source | Do not present unverified shelters as safe destinations. |

## 8. Data Flow

### 8.1 Weather and Risk Assessment

1. Client selects a community and requests its dashboard data.
2. Weather adapter fetches provider data using community coordinates.
3. Adapter normalises units, records provider and retrieval time, and returns explicit errors/missing fields.
4. Risk engine receives only validated available inputs plus relevant verified community observations.
5. Risk engine applies documented rules and returns risk state, optional score, contributing factors, missing inputs and confidence/limitations.
6. Explanation layer formats this structured result into plain language; a deterministic template is the fallback.
7. Client renders the result with source, freshness and disclaimer.

### 8.2 Hazard Report and Verification

1. Resident submits category, description, community/location and optional image.
2. Backend validates fields and creates a report with status Pending.
3. Admin dashboard queries authorised pending/recent reports.
4. Administrator reviews and updates status with reviewer identity and timestamp.
5. Resident-facing query returns only Verified records for confirmed-hazard map/list; other statuses remain private or visible only to the reporter/admin as appropriate.
6. Status and review history should be auditable where implementation time permits.

## 9. Risk Engine Design and Guardrails

The risk engine should be a small deterministic module with a documented input contract. The initial prototype may use an illustrative weighted heuristic only where data exists. The architecture must support an explicit insufficient-data result.

| Input | Prototype Treatment | Fallback |
|---|---|---|
| Forecast rainfall | Normalise provider forecast over a documented window. | Mark missing; do not fabricate. |
| Recent observed rainfall | Use only if provider exposes reliable accumulation. | Missing input lowers confidence or makes assessment unavailable. |
| Drainage condition | Use verified, recent reports at an appropriate geographic scope. | Do not extrapolate a single observation to an entire community. |
| Historical incidents | Use sourced records if available. | Omit and disclose missing history. |
| Community reports | Use verification status, recency and proximity; deduplicate where feasible. | Unverified reports inform review, not confirmed hazard state. |

### Risk Engine Rules

- Do not map a prototype score to a risk label until thresholds are explicitly defined and reviewed by the team.
- Never show LOW merely because data is missing or an API failed.
- A single pending report must not independently trigger a critical community-wide warning.
- AI prompt input should contain structured facts only; instruct the model not to add measurements, events or instructions not present in the payload.
- If AI fails, the dashboard must still work using a deterministic explanation template.

## 10. Security and Privacy

- Enable Row Level Security on all tables exposed through Supabase APIs.
- Residents may create reports and read public community/weather data; they must not change report status or assign themselves admin roles.
- Only administrators may review and update reports. Verify this in database policies, not just frontend route guards.
- Keep service-role keys and provider secrets server-side only.
- Validate and limit uploaded image MIME type and size; use randomised storage paths; do not trust file extensions alone.
- Do not expose reporter email, phone number or private profile fields in public map queries.
- Collect location only when the user selects it or grants permission; explain the purpose and allow manual location/community selection.
- Use HTTPS deployment and avoid logging secrets or unnecessary personal data.

## 11. Reliability, Performance and Accessibility

- Provide loading, empty, unavailable and retry states for weather, map and database requests.
- Cache or reuse weather responses briefly to avoid repeated provider calls; display the retrieval time.
- Avoid making the map the only way to access hazard information; provide an accessible list view.
- Use responsive layouts and test at a narrow mobile viewport.
- Keep the critical path lightweight; compress images and defer non-essential map/chart features.
- Use clear text labels, sufficient contrast, keyboard-accessible forms and meaningful validation messages.

## 12. Deployment and Environments

- Use one shared development project/database for hackathon integration and a deployed production/demo environment if time allows.
- Store configuration in environment variables; document required variable names in `.env.example` without real secrets.
- Apply database migrations/schema changes in a controlled sequence and communicate changes to the team.
- Seed a small set of clearly labelled demo communities and demo reports; identify synthetic data as demo data.
- Before demo, test the deployed URL from a separate browser/device and confirm backend policies work in production.

## 13. Architecture Decision Records

| Decision | Rationale | Trade-off / Revisit Trigger |
|---|---|---|
| Use a managed backend such as Supabase | Reduces backend setup and supports relational data, auth and RLS. | Provider dependence; revisit if complex processing or unsupported integrations emerge. |
| Use deterministic risk calculation | Auditable, fast and explainable in a short hackathon. | Not a validated flood model; future calibration and domain expertise required. |
| Keep LLM explanation optional | AI adds accessible explanations without owning safety-critical calculations. | LLM latency/cost/availability; template fallback required. |
| Show verified hazards separately | Protects users from treating unreviewed reports as facts. | Verification workflow depends on an admin being available. |

## 14. Technical Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Weather API unavailable or incomplete | Explicit unavailable state; cached timestamped data if available; no invented values. |
| Admin role misconfiguration | Test RLS with resident and admin accounts before deployment. |
| Duplicate or malicious reports | Basic validation, rate limiting if available, admin verification and duplicate review. |
| Map/geocoding delay | Use community coordinates and a simple list fallback; defer complex geocoding. |
| LLM hallucination or outage | Constrain to structured inputs, label as explanation, validate/fallback to templates. |
| Scope creep | Freeze P0; accept P1 only after end-to-end acceptance. |

## 15. Implementation Handoff

Before parallel development begins, the team must agree on:

- Repository structure.
- Route names.
- Shared TypeScript types.
- Database table/column names.
- Status enum values.
- API response shapes.
- Environment variable names.
- Who owns integration.