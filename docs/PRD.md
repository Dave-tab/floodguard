# FLOODGUARD AI

## Product Requirements Document (PRD)

*A community-powered flood-risk intelligence and early-action platform*

| Document Information | Details |
|---|---|
| Document ID | FG-PRD-001 |
| Version / Status | 1.0 / Draft for immediate team execution |
| Project | FloodGuard AI — AI Smart Assistance |
| Delivery Constraint | 36-hour hackathon MVP; scope is time-boxed |

**Confidentiality:** Team working document. Share with project contributors and judges as appropriate.

---

## 1. Executive Summary

FloodGuard AI is a mobile-first, community-powered flood-risk intelligence platform designed to help residents and local monitoring teams identify environmental hazards earlier, understand changing risk conditions, and coordinate preventive action. It combines available weather information with structured community hazard reports and administrative verification.

The 36-hour hackathon release will demonstrate one complete, credible workflow: a resident selects a community, views available weather and an explicitly qualified risk assessment, submits a hazard report, an administrator reviews and verifies that report, and the verified hazard becomes visible on the community map and in relevant resident information.

FloodGuard AI is not an official emergency-management system and the MVP will not claim to predict flooding with scientific certainty. Risk outputs are prototype estimates based on available inputs. Missing, stale or insufficient data must be disclosed rather than converted into a reassuring LOW rating.

## 2. Problem Statement

Communities can experience repeated flooding associated with intense rainfall, blocked drainage, rising water and inadequate local monitoring. Residents may notice warning signs but lack a simple, trusted channel to report them. Weather information alone may not reflect street-level drainage conditions, while unverified social reports can be difficult for monitoring teams to organise and act upon.

The product opportunity is to connect weather context and community observations in a single, understandable workflow that supports earlier awareness, verification and practical preparedness.

## 3. Product Vision and Value Proposition

**Vision:** Make local flood-risk information more understandable, community-informed and actionable.

**Value proposition:** FloodGuard AI brings weather context, location-based community hazard reports, transparent prototype risk assessment and an administrative verification workflow together so users can move from observation to informed action.

## 4. Goals and Non-Goals

### 4.1 MVP Goals

- Allow a resident to select a monitored community and view its available weather context and risk information.
- Collect structured hazard reports with category, description and location; photo upload is included only if it can be implemented reliably within the timebox.
- Give authorised administrators a queue to review, verify, reject and update reports.
- Display verified hazards distinctly on a map or clear location-based list.
- Explain risk outputs using the actual inputs, data freshness and limitations; AI may explain structured results but must not invent data or independently declare an emergency.
- Provide concise safety guidance appropriate to the displayed risk state.
- Deliver a coherent, deployed end-to-end demonstration with test evidence.

### 4.2 Explicit Non-Goals for the 36-Hour Release

- Scientifically validated, street-level flood prediction or guaranteed prediction of flood events.
- Live IoT water-level sensors, CCTV analytics, satellite image processing or custom machine-learning model training.
- Nationwide coverage, complete historical flood datasets or automatic integration with government emergency systems.
- Guaranteed dispatch, drainage clearing, rescue, evacuation or response by public authorities.
- Native Android/iOS applications, SMS/voice alert infrastructure or full multilingual support.
- Publicly publishing unverified reports as confirmed flood locations.

## 5. Target Users and Needs

| User | Primary Need | MVP Support |
|---|---|---|
| Resident / community member | Understand local conditions and report an observed hazard quickly. | Community selection, weather/risk view, report submission, map, safety guidance. |
| Administrator / monitoring officer | Review incoming reports, distinguish verified information and maintain status. | Protected admin dashboard, report queue, verification/status actions. |
| Hackathon evaluator | Assess whether the solution is useful, technically credible and demonstrably functional. | End-to-end demo, transparent data provenance, testable acceptance criteria. |

## 6. Product Scope and Prioritisation

| Priority | Capability | Release Decision |
|---|---|---|
| **P0 — Must Ship** | Community selection; resident overview; weather integration or clearly labelled fallback; transparent risk assessment; hazard reporting; admin review; verified hazard display; safety guidance; deployed demo. | Build and test. |
| **P1 — If Time Permits** | Photo uploads; report reference/tracking; emergency broadcast; alert history; richer charts; filters and report notes. | Only after P0 workflow works end-to-end. |
| **P2 — Future** | SMS/voice, local-language support, sensors, advanced predictive models, shelters, authority integrations, regional analytics. | Do not compromise MVP for these. |

## 7. Core User Journey

1. Resident opens FloodGuard AI and selects a supported community (or uses a location permission flow only if implemented and consented to).
2. The application retrieves available weather data for that community and displays the source and last-updated time.
3. The risk engine evaluates only available, relevant inputs and returns a risk state or **"Risk information unavailable"**.
4. The resident sees a plain-language explanation and practical precautionary guidance.
5. The resident submits a hazard report with category, description and a selected community/location.
6. The report enters the administrator queue as **Pending** and is not shown as a confirmed hazard to the public.
7. An authorised administrator reviews the details and changes the report to **Verified**, **Rejected** or another permitted status.
8. Verified hazards appear on the public community map/list with their report time and verification status.

## 8. Functional Product Requirements

| ID | Requirement | Priority |
|---|---|---|
| PRD-FR-01 | The resident can select and change a supported community. | P0 |
| PRD-FR-02 | The resident can view weather context and its source/freshness where data is available. | P0 |
| PRD-FR-03 | The application displays a risk category only when minimum required inputs and freshness rules are satisfied; otherwise it displays unavailable/insufficient data. | P0 |
| PRD-FR-04 | The application explains risk using actual assessment inputs and identifies limitations. | P0 |
| PRD-FR-05 | A resident can submit a hazard report with category, description and location/community. | P0 |
| PRD-FR-06 | New reports default to Pending and are not represented as verified hazards. | P0 |
| PRD-FR-07 | An authorised administrator can review and update report status. | P0 |
| PRD-FR-08 | Only verified reports are presented as confirmed hazards on the resident map/list. | P0 |
| PRD-FR-09 | The application provides risk-appropriate safety guidance and avoids unsupported evacuation instructions. | P0 |
| PRD-FR-10 | The system distinguishes weather-derived information, community reports and administrator-issued notices. | P1 |
| PRD-FR-11 | A reporter can view a submission confirmation/reference and current status. | P1 |
| PRD-FR-12 | Administrators can filter reports by community, category and status. | P1 |

## 9. Risk Assessment Product Rules

The initial scoring approach is a transparent prototype heuristic, not a validated hydrological model. The team may use the following illustrative weights only if the required inputs are genuinely available and documented:

| Input | Illustrative Weight | Important Qualification |
|---|---:|---|
| Forecast rainfall | 35% | Use provider forecast values and time window; do not treat forecast as observed rainfall. |
| Recent rainfall accumulation | 25% | Use only if a reliable accumulation source exists; otherwise mark missing. |
| Drainage condition | 20% | Use verified/appropriately weighted local observations; do not infer citywide condition from one report. |
| Historical flood incidents | 10% | Use only sourced records; omit or mark unavailable if absent. |
| Community reports | 10% | Weight by verification, recency and location; avoid duplicate inflation. |

### Risk Assessment Rules

- Do not silently redistribute weights when an input is missing. Either calculate using an explicitly documented normalisation method and lower confidence, or return insufficient data.
- A single unverified report must not automatically produce a HIGH or CRITICAL community-wide risk.
- Risk labels must be accompanied by assessment time, input availability and a short explanation.
- Do not describe the result as an official warning or guaranteed flood prediction.
- AI-generated text is explanatory only. The deterministic risk engine owns the score/category.

## 10. Success Measures

| Measure | MVP Target / Evidence |
|---|---|
| End-to-end workflow | A report submitted by a resident can be reviewed by an admin and then appears as verified in the resident map/list. |
| Report completion | A tester can submit a basic report in approximately one minute or less. |
| Data transparency | Every displayed weather/risk result shows a source or clear unavailable state and a last-updated/assessment time where applicable. |
| Verification integrity | Pending and rejected reports are never shown as confirmed hazards. |
| Access control | Unauthorised users cannot access admin actions or mutate verification status. |
| Reliability | Core demo flow works on a mobile viewport and handles API/network failure without fabricated values. |

## 11. Constraints, Assumptions and Risks

- **Time constraint:** 36 hours from the team's confirmed start; scope is fixed to P0 before P1.
- **Data availability:** Weather APIs may not provide all requested variables, historical records or community-scale resolution.
- **Geographic coverage:** Initially limited to explicitly configured pilot communities; no claim of nationwide coverage.
- **Operational response:** The MVP can organise and display reports but cannot guarantee that a government agency or field team receives or resolves them.
- **Connectivity:** Optimise the core experience for mobile and modest bandwidth; avoid large assets and unnecessary requests.
- **Trust and safety:** Inaccurate alerts can cause harm. Make uncertainty visible, separate data sources and avoid unsupported emergency advice.
- **Privacy:** Collect only necessary user/report data; do not expose reporter personal details publicly.

## 12. 36-Hour Delivery Strategy

| Phase | Timebox | Exit Condition |
|---|---|---|
| Scope lock & setup | 0–2h | P0 agreed, repository/environment ready, owners and integration contract agreed. |
| Foundation & data | 2–8h | App shell, database schema, auth/role approach and community seed data ready. |
| Core resident flow | 8–16h | Community, weather state, risk state and report submission work. |
| Admin & verification | 16–23h | Admin queue and protected status transitions work against shared data. |
| Map & explanation | 23–28h | Verified hazards visible; risk explanation and safety guidance integrated. |
| Integration & QA | 28–33h | P0 acceptance tests pass; failures and edge cases addressed. |
| Deploy & pitch | 33–36h | Stable deployment, seeded demo data, backup demo plan and clear pitch. |

## 13. Release Acceptance

The 36-hour MVP is considered demo-ready only when the team can demonstrate the full resident-to-admin-to-resident workflow using the deployed application; the system does not expose unverified reports as confirmed hazards; data failures are visible; and all claims in the pitch match the actual implementation.

## 14. Change Control

Any feature proposed after scope lock must identify:

- The user problem it solves.
- Estimated implementation and testing time.
- Dependency impact.
- Which existing P0 work it will displace.