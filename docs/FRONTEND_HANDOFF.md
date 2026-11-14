# FloodGuard AI — Frontend Handoff

**Purpose:** Document the current frontend implementation, technical decisions, data sources, and integration requirements so other team members can continue development without having to reverse-engineer previous decisions.

**Project:** FloodGuard AI  
**Documentation date:** November 13, 2026

---

## 1. Project overview

FloodGuard AI is a flood-awareness and monitoring platform intended to help residents understand potential flood risks, access relevant safety information, and discover flood-related reports in their communities.

The frontend is being developed with React, TypeScript, Vite, and Tailwind CSS. It is designed to support integration with a backend service that will provide community information, verified hazard reports, safety resources, and other platform data.

An important distinction: the current application is a prototype. Its risk information should not be presented as an official government warning or a scientifically validated flood prediction.

## 2. Work completed

### Nationwide administrative location coverage

The frontend now uses locally stored administrative data for Nigerian states and LGAs rather than relying on a small collection of hardcoded demo locations.

The downloaded dataset contains:

| Administrative level | Records |
|---|---:|
| States and FCT | 37 |
| Local Government Areas | 774 |
| Wards | 8,799 |

**Local data files:**

- `public/data/nigeria/states.json`
- `public/data/nigeria/lgas.json`
- `public/data/nigeria/wards.json`

The state and LGA datasets are used by the frontend location service. The ward dataset is available for future administrative-level features.

**Data source:** [Open Admin Data Nigeria](https://github.com/open-admin-data/nigeria-administrative-divisions)

The source dataset is based on OCHA Common Operational Datasets and INEC administrative data and is distributed under CC BY 4.0. Preserve attribution when redistributing or adapting the data.

### Location service

The location service is responsible for loading and exposing location information to the UI.

Key functions include:

- `listStates()` — retrieves the Nigerian states and FCT.
- `listLgas(stateId)` — retrieves LGAs belonging to a selected state.
- `listCommunitiesByLga(lgaId)` — retrieves communities associated with an LGA.
- `searchCommunities(query)` — searches available community records.
- `resolveCoordinates(...)` — supports location resolution when the API is configured.

The state and LGA data are loaded from the local JSON files. Community discovery remains a separate concern because administrative records do not automatically provide verified community or settlement records.

### Community hierarchy selector

The location selector is designed around the following hierarchy:

**State → LGA → Community**

A user should be able to select a state and LGA even when no community records are currently available for that area.

The absence of community records must not cause the application to invent community names or hide the administrative location options.

Wards are administrative units. They must not be presented as communities unless a separate, verified dataset establishes that relationship.

### Explore page

The Explore page has been updated to distinguish between:

1. **Administrative coverage:** the number of states and LGAs available in the local dataset.
2. **Community coverage:** the number of actual community records available to the application.

These figures represent different things. Nationwide administrative coverage does not mean that every community has active flood monitoring, verified reports, or confirmed hazard information.

---

## 3. Important technical decisions

### Administrative data and community data are separate

The nationwide dataset solves the problem of selecting states and LGAs. It does not solve the problem of discovering every Nigerian community.

Community records need their own source, verification process, and backend storage.

Do not generate placeholder communities to make the selector appear complete.

### Demo mode and API mode

The location service supports the distinction between demo data and backend-powered data.

The intended configuration is:

- `VITE_LOCATION_DATA_MODE=demo` — use available demo fixtures for community-related functionality.
- `VITE_LOCATION_DATA_MODE=api` — use the configured backend API.
- `VITE_API_BASE_URL` — supplies the backend base URL.

The local administrative JSON files remain available independently of the community data mode.

Before enabling API mode, the frontend and backend teams must agree on the actual API base URL, endpoint paths, response structures, and authentication requirements.

### Avoid circular dependencies

The location service imports the community demo fixtures directly from the mock data module rather than importing the resident service.

This avoids a circular dependency between the location service and resident service as the application grows.

### Data integrity and safety

The following rules should be preserved:

- Missing or stale weather data must not automatically be interpreted as low flood risk.
- Pending or unverified reports must not be presented as confirmed hazards.
- Administrative coverage must not be presented as active monitoring coverage.
- Demo records must be clearly identified as demo data.
- The application must not invent emergency contact numbers.
- Do not describe the prototype as an official flood-warning system.

---

## 4. Proposed backend integration contract

The frontend architecture anticipates the following backend capabilities. These are proposed integration contracts, not confirmation that the backend endpoints already exist.

| Method | Proposed endpoint | Purpose |
|---|---|---|
| GET | `/locations/states` | Retrieve states |
| GET | `/locations/states/:stateId/lgas` | Retrieve LGAs for a state |
| GET | `/locations/lgas/:lgaId/communities` | Retrieve communities in an LGA |
| GET | `/locations/communities?search=` | Search communities |
| POST | `/locations/resolve` | Resolve a location or coordinates |
| GET | `/locations/communities?status=active` | Retrieve active communities |
| GET | `/locations/communities/:communityId` | Retrieve a community |
| GET | `/communities/:communityId/overview` | Retrieve community overview |
| GET | `/hazards?communityId=&status=verified` | Retrieve verified hazard reports |
| GET | `/safety/guidelines` | Retrieve safety guidelines |
| GET | `/safety/hotlines` | Retrieve emergency contact information |
| GET | `/platform/impact` | Retrieve platform impact statistics |

### Suggested collection response

The frontend and backend teams should agree on a consistent response envelope. One possible structure is:

```json
{
  "data": [],
  "coverage": "national",
  "source": "Open Admin Data Nigeria",
  "lastUpdated": "2026-11-13T00:00:00Z"
}