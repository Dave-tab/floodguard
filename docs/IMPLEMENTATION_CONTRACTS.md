# FloodGuard AI — Implementation Contracts

**Project:** FloodGuard AI  
**Tagline:** Know the Risk. Prepare Before It Happens.  
**Document:** Implementation Contracts  
**Version:** 1.0  
**Status:** Active — Approved decisions and implementation requirements  
**Last Updated:** November 13, 2026

---

## 1. Purpose of This Document

This document defines the shared implementation rules, technical contracts, data structures, responsibilities, and system behaviours for FloodGuard AI.

It serves as the single source of truth for:

- Frontend developers.
- Backend developers.
- AI coding assistants.
- Integration and testing.
- Database and API implementation.

Every team member and AI coding assistant must follow these contracts.

The purpose is to prevent inconsistent implementations, duplicated functionality, incompatible interfaces, unapproved architectural decisions, and fabricated system behaviour.

### 1.1 Authority of This Document

The following documents provide additional project context:

- `docs/README.md`
- `docs/PRD.md`
- `docs/SRS.md`
- `docs/SOFTWARE_ARCHITECTURE.md`

This document translates approved product and architectural requirements into implementation rules.

If an implementation detail is unclear or conflicting:

1. Do not silently make assumptions.
2. Identify the conflicting requirements.
3. Ask the project owner or authorised team member for clarification.
4. Do not change approved contracts without explicit approval.

---

## 2. Project Overview

FloodGuard AI is a mobile-first, community-powered flood-risk intelligence and early-action platform.

It aims to help residents understand flood-related conditions in their communities, report emerging hazards, access relevant safety information, and receive timely community alerts.

The platform combines:

- Community-based discovery.
- Weather information.
- Prototype flood-risk assessment.
- Resident hazard reporting.
- Interactive hazard maps.
- Administrative verification.
- Community alerts and safety information.

### 2.1 Core MVP Workflow

The primary end-to-end workflow is:

1. A visitor opens FloodGuard AI.
2. The visitor selects a State.
3. The visitor selects a Local Government Area (LGA).
4. The visitor selects a community.
5. The visitor views the community overview.
6. The system displays available weather and qualified risk information.
7. The visitor can view publicly verified hazards.
8. A visitor who wants to report a hazard signs in or creates an account.
9. The authenticated resident submits a hazard report.
10. The report is stored with `pending` status.
11. An authorised administrator reviews the report.
12. The administrator verifies or rejects it.
13. Verified reports become publicly visible as confirmed hazards.

The system must never present pending reports as verified incidents.

---

## 3. Technology Stack

The approved project stack is:

### Frontend

- React 19
- Vite 8
- TypeScript
- Tailwind CSS v4
- React Router
- Supabase JavaScript client
- Leaflet and OpenStreetMap

### Backend and Infrastructure

- Supabase
- PostgreSQL
- Supabase Authentication
- Supabase Row Level Security (RLS)
- Supabase Storage
- Supabase Edge Functions where required

### External Services

- Open-Meteo for weather information.
- Gemini or Groq for optional AI-generated explanations.

### Deployment

- Vercel for frontend deployment.
- Supabase Cloud for backend infrastructure.

No developer or AI assistant may introduce a new major dependency, replace an approved technology, or change the architectural stack without approval.

---

## 4. Approved Product Decisions

### DEC-001: Authentication and Public Access

**Status: APPROVED**

FloodGuard AI must support public browsing and authenticated reporting.

#### Public Visitors

Unauthenticated visitors can:

- Open the landing page.
- Browse available States, LGAs and communities.
- View community information.
- View available weather information.
- View available prototype risk assessments.
- View publicly verified hazards.
- Access public safety information.

Public visitors cannot:

- Submit hazard reports.
- Access another resident's private report history.
- Perform administrative operations.

#### Authenticated Residents

Authenticated residents can:

- Access public features.
- Submit hazard reports.
- View their own submitted reports.
- Track report review status.

#### Administrators

Administrators can:

- Access the administrative dashboard.
- View submitted reports.
- Review reports.
- Verify or reject reports.
- Access authorised community-management and alert-management functionality.

#### Authentication Rules

- Supabase Authentication manages user authentication.
- Every submitted report must be associated with the authenticated user's ID.
- Residents cannot assign themselves administrator privileges.
- Administrator privileges must be controlled through trusted backend configuration.
- Backend authorisation and RLS must enforce permissions.
- Frontend-only role checks are not sufficient security.

When an unauthenticated visitor attempts to report a hazard, the application must prompt them to sign in or register.

---

### DEC-002: Community Discovery Structure

**Status: APPROVED**

The community discovery hierarchy is:

**State → LGA → Communities**

#### Navigation Requirements

1. The landing page must provide geographical community discovery.
2. Visitors select a State.
3. The system displays configured LGAs within that State.
4. Visitors select an LGA.
5. The system displays active communities within that LGA.
6. Selecting a community opens its overview.
7. Visitors can browse this hierarchy without authentication.
8. Only configured active communities are selectable.

#### Community Overview

A community overview should display available information such as:

- Community name and location.
- Current weather context.
- Available rainfall information.
- Prototype flood-risk assessment.
- Publicly verified hazards.
- Relevant safety guidance.

Unavailable information must be clearly identified rather than replaced with invented values.

#### Location Support

Browser geolocation may optionally support nearby-community discovery.

Rules:

- Request location permission explicitly.
- Do not silently collect precise location.
- Preserve manual community selection.
- Do not assume the selected community is the user's physical location.
- Do not invent community coordinates.

#### MVP Database Approach

Use a single `communities` table.

| Field       | Type             | Requirement |
|-------------|------------------|-------------|
| `id`        | UUID             | Primary key |
| `name`      | TEXT             | Required |
| `state`     | TEXT             | Required |
| `lga`       | TEXT             | Required |
| `latitude`  | DOUBLE PRECISION | Nullable |
| `longitude` | DOUBLE PRECISION | Nullable |
| `is_active` | BOOLEAN          | Required |

The frontend may group records by State and LGA.

Separate State and LGA tables are not required for the MVP.

Community records and coordinates must come from an approved dataset or verified administrative configuration.

AI must not fabricate supported communities or geographical coordinates.

---

### DEC-003: Single Hazard Category per Report

**Status: APPROVED**

Every hazard report must represent exactly one hazard category.

A resident reporting multiple different hazards must submit separate reports.

This ensures that:

- Report verification remains specific.
- Filtering is consistent.
- Analytics remain meaningful.
- Risk-engine inputs can be interpreted correctly.

The frontend and backend must enforce the same rule.

---

### DEC-004: Approved Hazard Categories

**Status: APPROVED**

The official MVP hazard categories are:

| Database Value         | Display Label        |
|------------------------|----------------------|
| `flooded_road`         | Flooded road         |
| `rising_water_level`   | Rising water level   |
| `blocked_drainage`     | Blocked drainage     |
| `overflowing_waterway` | Overflowing waterway |
| `damaged_drainage`     | Damaged drainage     |
| `other`                | Other                |

#### Implementation Rules

- A report must contain exactly one category.
- The frontend must use the exact database values.
- The backend must reject unsupported category values.
- The `other` category must allow the resident to describe the hazard in the report description.
- All features must use the same category definitions.
- Category values must not be independently renamed or redefined by individual developers.

---

## 5. Hazard Report Lifecycle

### 5.1 Approved Initial Status

Every newly submitted hazard report must receive:

`pending`

The frontend must not allow residents to submit reports with a self-selected verification status.

### 5.2 Proposed MVP Status Model

The initial report lifecycle uses:

| Status     | Meaning                                                |
|------------|--------------------------------------------------------|
| `pending`  | Submitted and awaiting administrative review           |
| `verified` | Reviewed and confirmed by an authorised administrator |
| `rejected` | Reviewed and rejected by an authorised administrator  |

Only authorised administrators can change review status.

### 5.3 Public Visibility

- Pending reports must not appear as confirmed hazards.
- Rejected reports must not appear as confirmed hazards.
- Verified reports may appear on the public community map and hazard list.
- Public visibility must be enforced through database permissions or trusted backend queries, not just frontend filtering.

### 5.4 Report Resolution

A verified hazard may eventually be resolved after the situation has been addressed.

The exact `resolved` status, transition rules, and whether it is required for the MVP remain subject to explicit approval.

Do not implement a new status transition without approval.

---

## 6. Database Contracts

The following entities form the initial application data model.

Final SQL migrations must implement these structures consistently with the approved architecture and security requirements.

### 6.1 Profiles

Represents application users.

| Field          | Type        | Description                    |
|----------------|-------------|--------------------------------|
| `id`           | UUID        | References authenticated user |
| `display_name` | TEXT        | User display name              |
| `role`         | TEXT/ENUM   | `resident` or `admin`          |
| `created_at`   | TIMESTAMPTZ | Creation timestamp             |

Rules:

- Profile IDs must correspond to Supabase Auth user IDs.
- Default role is `resident`.
- Users cannot update their own role to `admin`.
- Role changes must be controlled through trusted administrative operations.

### 6.2 Communities

| Field        | Type             | Description            |
|--------------|------------------|------------------------|
| `id`         | UUID             | Primary key            |
| `name`       | TEXT             | Community name         |
| `state`      | TEXT             | State                  |
| `lga`        | TEXT             | Local Government Area  |
| `latitude`   | DOUBLE PRECISION | Nullable coordinates   |
| `longitude`  | DOUBLE PRECISION | Nullable coordinates   |
| `is_active`  | BOOLEAN          | Community availability |
| `created_at` | TIMESTAMPTZ      | Creation timestamp     |

Rules:

- Only active communities should be selectable.
- Coordinates may be unavailable.
- Missing coordinates must not trigger invalid weather requests.
- State and LGA values must be consistent with the approved community dataset.

### 6.3 Hazard Reports

| Field          | Type             | Description                    |
|----------------|------------------|--------------------------------|
| `id`           | UUID             | Primary key                    |
| `reporter_id`  | UUID             | Authenticated submitting user |
| `community_id` | UUID             | Associated community           |
| `category`     | TEXT/ENUM        | One approved hazard category   |
| `description`  | TEXT             | Resident description           |
| `latitude`     | DOUBLE PRECISION | Nullable report coordinates    |
| `longitude`    | DOUBLE PRECISION | Nullable report coordinates    |
| `status`       | TEXT/ENUM        | Review status                  |
| `photo_path`   | TEXT             | Optional image path            |
| `reviewed_by`  | UUID             | Nullable administrator ID      |
| `reviewed_at`  | TIMESTAMPTZ      | Nullable review timestamp      |
| `review_note`  | TEXT             | Optional administrative note   |
| `created_at`   | TIMESTAMPTZ      | Submission timestamp           |
| `updated_at`   | TIMESTAMPTZ      | Last update timestamp          |

Rules:

- `reporter_id` is required and must come from the authenticated session.
- `community_id` must reference a valid community.
- `category` must match one approved value.
- `description` must satisfy approved validation limits.
- New reports must default to `pending`.
- Residents must not directly assign review statuses.
- Only authorised administrators can review reports.
- Pending and rejected reports must not be publicly exposed as confirmed hazards.
- Photo uploads must follow approved Storage permissions.

Precise report coordinates must only be collected through an explicitly approved location-selection or permission flow. The community association remains required even when precise coordinates are unavailable.

### 6.4 Risk Assessments

| Field            | Type        | Description                         |
|------------------|-------------|-------------------------------------|
| `id`             | UUID        | Primary key                         |
| `community_id`   | UUID        | Assessed community                  |
| `risk_level`     | TEXT        | Nullable risk classification        |
| `score`          | NUMERIC     | Nullable risk score                 |
| `inputs_json`    | JSONB       | Structured assessment inputs        |
| `missing_inputs` | JSONB       | Missing or unavailable inputs       |
| `confidence`     | TEXT        | Nullable confidence classification  |
| `explanation`    | TEXT        | Assessment explanation              |
| `provider`       | TEXT        | Data/provider information           |
| `assessed_at`    | TIMESTAMPTZ | Assessment timestamp                |

The implementation must distinguish between:

- Available assessment.
- Insufficient data.
- Unavailable assessment.

A missing assessment input must never automatically produce a `low` risk classification.

The precise risk-engine formula and thresholds must be approved before implementation.

### 6.5 Alerts

Alerts must distinguish between:

- Weather-related information.
- System-generated notifications.
- Administrator-issued community notices.

Suggested fields:

| Field          | Type                  |
|----------------|-----------------------|
| `id`           | UUID                  |
| `community_id` | UUID, nullable        |
| `source_type`  | TEXT                  |
| `severity`     | TEXT                  |
| `title`        | TEXT                  |
| `message`      | TEXT                  |
| `issued_at`    | TIMESTAMPTZ           |
| `expires_at`   | TIMESTAMPTZ, nullable |
| `created_by`   | UUID, nullable        |

Automated weather context must not be presented as an official government warning.

---

## 7. Weather Integration Contract

Open-Meteo is the approved weather information provider for the MVP.

The weather integration must:

1. Accept a valid community location.
2. Confirm coordinates are available.
3. Request supported weather information.
4. Normalize returned values and units.
5. Record the provider and retrieval time.
6. Handle missing fields.
7. Handle request failures and timeouts.
8. Expose data freshness to the frontend.

### 7.1 Weather Data Integrity

The system must distinguish:

- Observed rainfall.
- Forecast rainfall.
- Historical rainfall information.
- Unavailable weather information.

Forecast rainfall must never be described as rainfall already observed.

If the provider fails or returns incomplete information:

- Display an appropriate unavailable or stale-data state.
- Do not fabricate weather values.
- Do not treat unavailable information as zero rainfall.
- Do not automatically produce reassuring low-risk results.

---

## 8. Risk Engine Contract

The risk engine must be deterministic, auditable and separate from AI-generated explanations.

### 8.1 Proposed Risk Inputs

The PRD identifies these risk factors and weights:

| Input                        | Weight |
|------------------------------|--------|
| Forecast rainfall            | 35%    |
| Recent rainfall accumulation | 25%    |
| Drainage condition           | 20%    |
| Historical incidents         | 10%    |
| Community reports            | 10%    |
| **Total**                    | **100%** |

These are the approved PRD weight allocations, not a complete implementation formula.

### 8.2 Risk Engine Rules

- Risk calculations must be performed by trusted application logic.
- AI must not independently determine risk scores.
- Inputs must be validated before calculation.
- Each input must retain source and freshness information.
- Verified reports and unverified reports must not be treated as equivalent evidence.
- Pending reports must not automatically be treated as confirmed incidents.
- Missing inputs must be recorded.
- Missing weights must not silently be redistributed.
- The system must not claim scientific validation that has not occurred.

### 8.3 Missing Data

When required inputs are unavailable:

- Return an insufficient-data or unavailable result as appropriate.
- Record which inputs are missing.
- Do not fabricate values.
- Do not silently replace missing values with zero.
- Do not label the community low risk merely because information is missing.

### 8.4 Risk Classification

The exact numerical score thresholds, normalization rules, minimum data coverage and treatment of missing factors remain subject to explicit approval.

Developers must not independently invent these rules.

### 8.5 Risk Disclaimer

Risk assessments are prototype estimates, not official flood warnings or scientifically validated predictions.

The interface must communicate this limitation clearly.

---

## 9. AI Explanation Contract

AI may be used to explain an existing structured risk assessment in simple language.

AI must not:

- Determine the underlying risk score.
- Invent rainfall measurements.
- Invent flood incidents.
- Invent community observations.
- Turn missing data into confirmed facts.
- Issue official warnings.
- Generate unsupported safety instructions.

AI explanations must only use trusted structured information provided to the explanation service.

If AI is unavailable:

- Use a deterministic template where possible.
- Otherwise display an appropriate unavailable state.
- Do not block the core risk-assessment workflow.

AI is an optional explanation layer, not a critical dependency for risk calculation.

---

## 10. API and Service Contracts

The following are logical operations that the frontend and backend must support. They are not approval of specific endpoint names or deployment methods.

| Operation                     | Access        | Purpose                             |
|-------------------------------|---------------|-------------------------------------|
| List communities              | Public        | Retrieve configured communities     |
| Get community overview        | Public        | Retrieve community information      |
| Get weather context           | Public        | Retrieve available weather data     |
| Get community risk assessment | Public        | Retrieve qualified assessment       |
| Get verified hazards          | Public        | Retrieve publicly confirmed hazards |
| Submit hazard report          | Authenticated | Create a pending report             |
| Get own reports               | Authenticated | Retrieve resident's reports         |
| Get admin report queue        | Admin         | Retrieve reports awaiting review    |
| Review hazard report          | Admin         | Verify or reject a report           |
| Manage community alerts       | Admin         | Create and manage authorised notices |

### 10.1 Report Submission Contract

Logical input:

- `communityId`
- `category`
- `description`
- Optional `latitude`
- Optional `longitude`
- Optional photo

The backend must:

- Verify authentication.
- Obtain the reporter identity from the authenticated session.
- Validate the community.
- Validate the category.
- Validate the description.
- Validate optional coordinates.
- Set the initial status to `pending`.
- Return a success response only after the database operation succeeds.

The client must not submit trusted administrator or verification fields.

### 10.2 Report Review Contract

Logical input:

- `reportId`
- `decision`: `verified` or `rejected`
- Optional `reviewNote`

The backend must:

- Verify administrator privileges.
- Confirm the report exists.
- Validate the requested transition.
- Record the reviewing administrator.
- Record the review timestamp.
- Return an accurate operation result.

---

## 11. Security and Data Integrity

Security must be enforced on the backend.

### 11.1 Required Rules

- Never expose Supabase service-role keys in frontend code.
- Use environment variables for secrets.
- Use RLS for database access control.
- Validate incoming data server-side.
- Prevent residents from changing report verification status.
- Prevent residents from accessing other residents' private report histories.
- Prevent unauthorised administrator access.
- Restrict photo upload access appropriately.
- Do not trust client-submitted risk scores or administrative roles.

### 11.2 Public Data

Public access must be limited to intended public information, including:

- Active community records.
- Approved community information.
- Qualified weather and risk information.
- Verified hazard reports.
- Public safety content.

Private user information and unverified reports must remain protected.

---

## 12. Frontend Implementation Contracts

### 12.1 Shared Rules

- Use TypeScript for application code.
- Reuse shared types and interfaces.
- Keep API and database access in appropriate service modules.
- Avoid duplicating business logic across components.
- Handle loading, empty, success and error states.
- Use mobile-first responsive layouts.
- Maintain accessible interactions.
- Never display fabricated success states.

### 12.2 Shared Types

The frontend and backend must maintain consistent definitions for:

```ts
export type UserRole = 'resident' | 'admin';

export type HazardCategory =
  | 'flooded_road'
  | 'rising_water_level'
  | 'blocked_drainage'
  | 'overflowing_waterway'
  | 'damaged_drainage'
  | 'other';

export type HazardReportStatus =
  | 'pending'
  | 'verified'
  | 'rejected';