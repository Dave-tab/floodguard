# FLOODGUARD AI

## Software Requirements Specification (SRS)

*Testable functional and non-functional requirements for the 36-hour MVP*

| Document Information | Details |
|---|---|
| Document ID | FG-SRS-001 |
| Version / Status | 1.0 / Draft for immediate team execution |
| Project | FloodGuard AI — AI Smart Assistance |
| Delivery Constraint | 36-hour hackathon MVP; scope is time-boxed |

**Confidentiality:** Team working document. Share with project contributors and judges as appropriate.

---

## 1. Introduction

### 1.1 Purpose

This SRS defines the observable behaviour, interfaces, constraints and acceptance conditions for the FloodGuard AI 36-hour hackathon MVP. It is intended for developers, testers, product contributors and evaluators.

### 1.2 Product Scope

The software provides community selection, available weather context, transparent prototype risk information, hazard reporting, administrative report verification and resident-facing display of verified hazards. Optional features are explicitly marked and must not block P0 delivery.

### 1.3 Definitions

| Term | Definition |
|---|---|
| Community | A configured geographic area supported by the MVP. |
| Hazard report | A resident-submitted observation such as blocked drainage or rising water. |
| Pending | A submitted report awaiting administrative review. |
| Verified | A report reviewed and confirmed by an authorised administrator. |
| Risk assessment | A prototype estimate derived from available inputs; not an official warning. |
| Unavailable | The system cannot produce a sufficiently supported result because required data is missing, stale or inaccessible. |

## 2. Overall Description

### 2.1 User Classes

- **Resident:** May view supported community information and submit a hazard report.
- **Administrator:** May access the protected report-management interface and perform authorised review actions.
- **Unauthenticated visitor:** May access public information if the team chooses a no-login public mode; report submission may require authentication or an anonymous submission policy.

### 2.2 Operating Environment

- Modern mobile and desktop browsers.
- Responsive web application built with React/Vite/TypeScript.
- Hosted database/auth/storage service such as Supabase.
- Internet connection required for live weather retrieval, map tiles and hosted data operations; graceful error states required.

### 2.3 Design and Implementation Constraints

- The implementation window is 36 hours; P0 requirements take precedence.
- Only explicitly configured communities are in scope.
- External API fields and rate limits are subject to provider availability.
- No unvalidated machine-learning flood prediction claim is permitted.
- All public hazard representations must distinguish verified from unverified information.

## 3. Functional Requirements

**Priority definitions:**
- **P0:** Required for MVP acceptance.
- **P1:** Implement only after P0 passes.
- **P2:** Future release.

| ID | Feature | Priority | Requirement Statement | Acceptance Check |
|---|---|---|---|---|
| SRS-F-001 | Community selection | P0 | The system shall allow the resident to select an active community from the configured community list. | A user can select a listed community and the dashboard shows the selected community name. |
| SRS-F-002 | Community change | P0 | The system shall allow the resident to change the currently selected community. | Changing the community refreshes or clearly resets community-specific weather, risk and hazard data. |
| SRS-F-003 | Community metadata | P0 | The system shall store a stable community identifier and, where available, its latitude and longitude. | Each active community has a unique ID; map/weather requests use the selected community's configured coordinates. |
| SRS-F-004 | Weather retrieval | P0 | The system shall request supported weather information for the selected community from the configured provider. | When provider data is returned, the interface shows the available fields and provider/source. |
| SRS-F-005 | Weather freshness | P0 | The system shall display the retrieval or observation/forecast timestamp relevant to displayed weather information. | A tester can identify when the displayed data was last updated; stale data is not presented as live. |
| SRS-F-006 | Weather failure | P0 | The system shall display an explicit unavailable/error state when weather data cannot be retrieved. | With network/API failure, no fabricated temperature or rainfall value appears. |
| SRS-F-007 | Risk assessment | P0 | The system shall calculate a prototype risk result from documented, available inputs using trusted application logic. | Given a known test input set, the engine returns the expected documented result. |
| SRS-F-008 | Insufficient data | P0 | The system shall return an unavailable or insufficient-data state when required data/freshness conditions are not met. | Missing data never defaults to LOW. |
| SRS-F-009 | Risk explanation | P0 | The system shall show the actual contributing inputs, missing inputs and limitations for each risk assessment. | The explanation can be traced to the stored assessment input payload. |
| SRS-F-010 | Risk disclaimer | P0 | The system shall identify prototype risk information as an estimate and not an official warning or validated prediction. | The disclaimer is visible near risk information. |
| SRS-F-011 | Safety guidance | P0 | The system shall show plain-language precautionary guidance appropriate to the displayed risk state. | Guidance is present for each supported risk state and avoids unsupported rescue/evacuation claims. |
| SRS-F-012 | Report category | P0 | The system shall allow a reporter to choose a hazard category from the configured list. | The form offers blocked drainage, rising water, flooded road, overflowing waterway, damaged drainage and other. |
| SRS-F-013 | Report description | P0 | The system shall accept a short description for a hazard report and validate required input. | A valid description is saved; empty/invalid required text is rejected with a clear message. |
| SRS-F-014 | Report location | P0 | The system shall associate each report with a selected community and may store precise coordinates when provided. | A submitted report is associated with the correct community; coordinates are not invented. |
| SRS-F-015 | Report creation | P0 | The system shall persist a valid report with a unique identifier, creation timestamp and initial status Pending. | After successful submission, the report exists in the database with Pending status. |
| SRS-F-016 | Submission confirmation | P0 | The system shall show confirmation after a report is successfully saved. | The user sees a success message and a reference identifier or equivalent confirmation. |
| SRS-F-017 | Submission failure | P0 | The system shall inform the user when report submission fails and shall not show false success. | A simulated backend failure results in an error state and no success confirmation. |
| SRS-F-018 | Admin authentication | P0 | The system shall require an authorised administrator identity for protected report-management operations. | A non-admin user cannot perform admin actions through direct API/database requests. |
| SRS-F-019 | Admin report queue | P0 | The system shall allow an administrator to retrieve reports for review. | An admin can see pending reports and their category, community, description and submission time. |
| SRS-F-020 | Report verification | P0 | The system shall allow an authorised administrator to change a Pending report to Verified or Rejected. | Admin action persists the new status and reviewer identity/timestamp where supported. |
| SRS-F-021 | Report progress statuses | P1 | The system should support In Progress and Resolved statuses for verified reports. | Admin can update status and resident-facing status is consistent. |
| SRS-F-022 | Public hazard display | P0 | The system shall expose only Verified reports as confirmed hazards in the resident map/list. | Pending and Rejected reports do not appear in confirmed public hazard results. |
| SRS-F-023 | Hazard detail | P0 | The system shall show the category, community/location, description, report time and verification status for a verified hazard. | Selecting a marker/list item displays those fields where data is available. |
| SRS-F-024 | Map fallback | P0 | The system shall provide a readable list or equivalent fallback if the map cannot load. | A user can still access verified hazard information without map tiles. |
| SRS-F-025 | Report photo | P1 | The system may allow a report image to be uploaded and associated with the report. | If implemented, accepted image types/size are constrained and upload failure does not lose the text report. |
| SRS-F-026 | Report tracking | P1 | The system should allow a reporter to view the current status of their submitted report. | The reporter can retrieve their report without accessing another user's private data. |
| SRS-F-027 | Alert source distinction | P1 | The system should distinguish weather-derived information, community reports and administrator-issued notices. | The displayed source type is explicit and not conflated. |
| SRS-F-028 | Emergency broadcast | P1 | An authorised administrator should be able to create a notice with title, message, affected community, severity and optional expiry. | A valid notice appears to the intended community and carries issue time/source. |
| SRS-F-029 | Report filtering | P1 | The admin interface should filter reports by status, community and category. | Applying a filter returns only matching records. |
| SRS-F-030 | AI explanation fallback | P0 | If an AI explanation provider is unavailable, the system shall provide a deterministic template explanation or a clear explanation-unavailable state. | AI outage does not break risk calculation or dashboard rendering. |

## 4. Non-Functional Requirements

| ID | Quality Attribute | Priority | Requirement Statement | Verification |
|---|---|---|---|---|
| SRS-NF-001 | Security | P0 | All database tables exposed to clients shall have appropriate access policies; admin mutations shall be enforced server-side/database-side. | Resident account cannot change report status or role, including by direct request. |
| SRS-NF-002 | Privacy | P0 | Public views shall not expose reporter email, phone number or other unnecessary personal information. | Inspect public API responses and confirm private fields are absent. |
| SRS-NF-003 | Data integrity | P0 | Reports shall have stable identifiers, valid category/status values and server-generated timestamps. | Invalid enum values and malformed required fields are rejected. |
| SRS-NF-004 | Reliability | P0 | External service failure shall not cause the application to invent or misrepresent data. | Weather/API failure is represented as unavailable with no fabricated figures. |
| SRS-NF-005 | Usability | P0 | A resident shall be able to complete a basic hazard report in approximately one minute under normal network conditions. | Usability test with a first-time tester; record completion time. |
| SRS-NF-006 | Responsive design | P0 | Core resident and admin flows shall remain usable on a narrow mobile viewport and desktop browser. | Test at a small mobile viewport and desktop width. |
| SRS-NF-007 | Accessibility | P0 | Form controls shall have visible labels, readable contrast and clear validation/error messages. | Keyboard and visual inspection of primary form/dashboard. |
| SRS-NF-008 | Performance | P0 | The application shall avoid blocking the primary report and dashboard interactions on non-essential charts or map assets. | Core controls remain usable while optional map/chart content loads. |
| SRS-NF-009 | Auditability | P0 | A report status change shall record the new status and, where supported, reviewer and update timestamp. | Review action can be traced to an administrator and time. |
| SRS-NF-010 | Explainability | P0 | Every risk category shown shall be accompanied by its assessment time, available input factors and a limitation/confidence statement. | Tester can identify why the risk state was displayed. |
| SRS-NF-011 | Maintainability | P1 | Risk rules, status values and shared data contracts shall be centralised rather than duplicated across UI components. | A rule/status change does not require editing multiple inconsistent copies. |
| SRS-NF-012 | Availability | P1 | The deployed demo should be reachable throughout judging; team shall retain a backup demonstration path. | Test deployment from an independent device/network and prepare recorded/screenshots fallback. |

## 5. External Interface Requirements

### 5.1 User Interface

- Resident navigation should provide clear access to Home/Overview, Map, Report and Profile or equivalent essentials.
- Admin navigation should provide Overview, Reports and relevant management actions; avoid implementing unused navigation items.
- Risk labels, data source, timestamps and disclaimers must be visually distinguishable.
- Use plain language; do not rely on colour alone to communicate risk or verification status.

### 5.2 Weather Interface

- Requests shall use the selected community coordinates and the provider's supported parameters.
- The application shall preserve units and identify the provider.
- The system shall handle timeout, rate limit, invalid response and unavailable fields.
- Do not hard-code live-looking weather values as if retrieved from the provider; demo fixtures must be labelled.

### 5.3 Database and Storage Interface

- Database writes shall validate required fields and allowed enum values.
- Public queries shall return only fields required for public display and only Verified hazards as confirmed hazards.
- Image storage, if implemented, shall restrict file size/type and protect access.

## 6. Data Requirements

| Data Object | Required Fields | Validation / Rule |
|---|---|---|
| Community | id, name, state, LGA; coordinates if weather/map is enabled | Active community must have unique ID; coordinates must be valid geographic values. |
| Hazard report | id, community_id, category, description, status, created_at | Category and status must be allowed values; new status is Pending; description length bounded. |
| Risk assessment | id, community_id, assessed_at, data status, inputs/provenance | Risk category nullable; if insufficient data, status must explicitly be unavailable/insufficient. |
| Alert | id, source_type, severity, title, message, issued_at | Source type and severity constrained; expiry optional; creator required for admin notice. |

## 7. Business Rules

1. A newly submitted hazard report is Pending.
2. Only an authorised administrator can verify, reject or progress a report.
3. Only Verified reports may be shown as confirmed hazards to general residents.
4. A report being visible on the map does not imply that a public authority has acted on it.
5. Risk information is an estimate based on available inputs and must never be presented as an official warning.
6. Missing or stale data must not be interpreted as low risk.
7. An AI explanation must not introduce facts, measurements, incidents or safety instructions absent from trusted structured inputs.
8. Demo or synthetic records must be identifiable as demo data and must not be presented as real-time community reports.

## 8. Error Handling and Edge Cases

| Scenario | Expected System Behaviour |
|---|---|
| Weather API times out | Show weather unavailable/stale state; preserve the rest of the dashboard. |
| Selected community has no coordinates | Show weather/map limitation; do not send invalid location request. |
| No risk inputs available | Show Risk information unavailable; do not show LOW. |
| Resident submits empty description | Block submission and show field-level validation. |
| Duplicate-looking report | Allow admin review; do not automatically multiply risk or label as confirmed. |
| Resident attempts admin endpoint | Reject with unauthorised response; no mutation occurs. |
| Admin rejects a report | Keep it out of confirmed public hazard results. |
| Map tiles fail | Show list fallback and preserve report details. |
| Image upload fails | Tell user; allow retry or submit without image if image is optional. |
| AI provider fails | Use deterministic explanation fallback or display explanation unavailable; core risk result remains. |
| Database write fails | Do not show success; preserve form input where feasible for retry. |

## 9. Acceptance Test Scenarios

| Test ID | Scenario | Steps | Expected Result |
|---|---|---|---|
| AT-01 | Select a community | Open app; select an active community. | Selected community name and associated data are shown. |
| AT-02 | Weather unavailable | Force weather request failure. | Unavailable state shown; no fabricated weather values. |
| AT-03 | Insufficient risk inputs | Provide missing/stale input fixture. | Risk information unavailable/insufficient; never default LOW. |
| AT-04 | Submit hazard report | Choose category, enter description, select community and submit. | Report is saved as Pending and confirmation is shown. |
| AT-05 | Reject invalid report | Submit without required description/category. | Submission is blocked with validation feedback. |
| AT-06 | Admin verifies report | Sign in as admin; open pending report; verify it. | Status changes to Verified with reviewer/time where supported. |
| AT-07 | Public map visibility | View resident map/list before and after verification. | Pending report is absent as confirmed hazard; Verified report appears. |
| AT-08 | Resident permission boundary | Attempt admin status mutation as resident. | Operation is denied by backend/database policy. |
| AT-09 | Map fallback | Block map tile loading. | Verified hazards remain accessible in list form. |
| AT-10 | AI explanation outage | Disable or invalidate AI provider. | Deterministic fallback or clear unavailable explanation appears; dashboard remains functional. |

## 10. Traceability Matrix

| PRD Goal | SRS Coverage | Evidence |
|---|---|---|
| Community awareness | SRS-F-001 to F-011 | Community selection, weather/risk UI, source and freshness, explanation. |
| Community reporting | SRS-F-012 to F-017 | Valid report stored Pending and confirmation displayed. |
| Administrative accountability | SRS-F-018 to F-021 | Protected admin queue and status transition. |
| Trustworthy public hazard map | SRS-F-022 to F-024 | Only verified hazards public; detail and list fallback. |
| AI as responsible assistance | SRS-F-009, F-010, F-030; SRS-NF-010 | Grounded explanation, disclaimer and fallback. |
| Security and privacy | SRS-NF-001 to NF-003 | RLS/role tests and public-field inspection. |

## 11. Release Readiness Checklist

- [ ] All P0 acceptance scenarios have been run against the deployed build.
- [ ] Resident and admin permissions have been tested with separate accounts/roles.
- [ ] Weather and risk failure states have been tested; no fabricated data is shown.
- [ ] Pending/rejected reports are not exposed as confirmed public hazards.
- [ ] The core flow works on a mobile viewport.
- [ ] Demo data is labelled and the team can explain which parts are live, computed, templated or simulated.
- [ ] The demo narrative does not claim government integration, guaranteed response or scientifically validated prediction unless such capability genuinely exists.

## 12. Open Decisions to Resolve at Kick-off

- Which exact pilot community or communities will be configured for the demo?
- Will resident report submission require login, or will anonymous submission be supported with abuse controls?
- Which weather provider fields are actually available and reliable for the chosen pilot location?
- Will AI explanation be implemented, or will deterministic templates be used for the 36-hour release?
- Will photo upload fit after the core report workflow is complete?
- Who will be assigned the administrator role, and how will that role be provisioned securely?