
# FloodGuard AI

### Know the Risk. Prepare Before It Happens.

FloodGuard AI is a community-focused flood-risk awareness and environmental hazard reporting platform designed to help residents understand local environmental risks, report potential hazards, and access relevant safety information.

The platform brings together resident-facing tools, community-level risk information, weather data, and administrative workflows to support better awareness and preparedness.

**Project:** HackGlobal 2026  
**Repository:** [Dave-tab/floodguard](https://github.com/Dave-tab/floodguard)  
**Status:** Active Development

---

## Table of Contents

- [Overview](#overview)
- [Problem Statement](#problem-statement)
- [Product Capabilities](#product-capabilities)
- [Application Architecture](#application-architecture)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Available Scripts](#available-scripts)
- [Project Structure](#project-structure)
- [Application Routes](#application-routes)
- [Development Workflow](#development-workflow)
- [Data Integrity and Safety](#data-integrity-and-safety)
- [Current Implementation Status](#current-implementation-status)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Flooding and environmental hazards can disrupt communities, damage property, and put lives at risk. Access to timely, understandable, and location-relevant information is an important part of community preparedness.

FloodGuard AI aims to make environmental risk information more accessible by providing a platform where residents can explore community information, view weather and hazard-related data, and submit environmental observations.

It also provides an administrative interface for reviewing reports, monitoring community risk information, and preparing emergency communications.

The platform is being developed with a focus on accessibility, clear information presentation, and a modular architecture that supports future backend and AI integrations.

## Problem Statement

Communities often face challenges such as:

- Limited access to localized environmental risk information.
- Delayed reporting of flooding and drainage-related hazards.
- Difficulty identifying and communicating emerging environmental threats.
- Fragmented information between residents and response administrators.
- Limited access to understandable information that supports preparedness.

FloodGuard AI addresses these challenges through a unified resident and administrative experience.

---

## Product Capabilities

### 1. Resident Experience

The resident interface provides access to environmental information and community-facing tools.

Current frontend capabilities include:

- **Explore:** Browse the resident-facing application experience.
- **Hazard Map:** Access the hazard mapping interface.
- **Community Information:** Explore community-level information.
- **Hazard Reporting:** Access the environmental hazard reporting workflow.
- **Public Alerts:** View the alerts interface.
- **My Activity:** Access personal report and activity information.
- **Authentication:** Login and registration interfaces.

### 2. Community Risk and Weather Information

FloodGuard brings together community information and weather-related data to support environmental awareness.

The application includes:

- Community weather information.
- Map-based geographic exploration.
- Location-aware resident experiences.
- Weather and risk information presentation.

Risk information should be interpreted in context and must not be treated as a guaranteed prediction of flooding.

### 3. Administrative Dashboard

The administrative interface provides a dedicated workspace for monitoring and managing community-related information.

Available administrative routes:

| Module | Route | Purpose |
|---|---|---|
| Dashboard | `/admin` | Administrative overview |
| Reports | `/admin/reports` | Report management interface |
| Communities | `/admin/communities` | Community risk monitoring |
| Broadcast | `/admin/broadcast` | Emergency broadcast interface |

The administrative experience is designed to support future integration with backend services for report verification, community monitoring, and emergency communication.

### 4. AI and Risk Intelligence

The broader FloodGuard initiative includes AI-assisted environmental risk intelligence.

The intended direction includes:

- Weather-informed risk assessment.
- Environmental hazard analysis.
- AI-assisted explanations of risk information.
- More accessible communication of potential environmental threats.

AI-generated explanations and risk estimates should be treated as decision-support information, not authoritative emergency instructions.

---

## Application Architecture

FloodGuard is organized around two primary application experiences:

**Resident Application**

Provides public-facing environmental information, community exploration, reporting interfaces, and resident activity.

**Administrative Application**

Provides administrative dashboards, report management, community risk monitoring, and emergency communication interfaces.

The frontend communicates with external services through dedicated service and integration layers. This structure allows application features to evolve without tightly coupling the user interface to backend implementation details.

---

## Technology Stack

| Technology | Purpose |
|---|---|
| React 19 | Component-based user interface |
| TypeScript | Static typing and maintainability |
| Vite 8 | Development server and production build tooling |
| Tailwind CSS 4 | Utility-first styling |
| React Router 7 | Application routing |
| Supabase | Planned backend integration, authentication and data services |
| Leaflet | Interactive mapping |
| OpenStreetMap | Map data and geographic visualization |
| Recharts | Data visualization and charts |
| Lucide React | Interface icons |

---

## Getting Started

### Prerequisites

Ensure the following tools are installed:

- Node.js 22.12 or later.
- npm.
- Git.

### 1. Clone the repository

```bash
git clone https://github.com/Dave-tab/floodguard.git
```

### 2. Navigate to the project directory

```bash
cd floodguard
```

### 3. Install dependencies

```bash
npm install
```

### 4. Configure environment variables

Create a local environment file:

**Windows PowerShell**

```powershell
Copy-Item .env.example .env.local
```

**macOS / Linux**

```bash
cp .env.example .env.local
```

Configure the required environment variables as described below.

### 5. Start the development server

```bash
npm run dev
```

Vite will provide a local development URL in the terminal, typically:

```text
http://localhost:5173
```

---

## Environment Configuration

FloodGuard uses environment variables to configure its external service integrations.

Create a `.env.local` file in the project root.

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable/anonymous client key |

Example:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_publishable_key
```

Replace the example values with credentials from your Supabase project.

**Important:**

- Never commit `.env.local` or other files containing secrets.
- Do not expose Supabase service-role keys in frontend code.
- Frontend environment variables prefixed with `VITE_` are included in the client-side application bundle.
- Configure database permissions and Row Level Security policies before connecting real user data.

Some frontend interfaces support preview states when backend configuration is unavailable. Preview functionality should not be interpreted as a successful database operation.

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the local development server |
| `npm run build` | Run TypeScript checks and generate a production build |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the generated production build locally |

Before submitting changes, run:

```bash
npm run build
npm run lint
```

Both commands should complete successfully.

---

## Project Structure

```text
floodguard/
│
├── public/                  # Static assets
│
├── src/
│   ├── app/                 # Application routing and setup
│   │
│   ├── components/          # Shared UI and layout components
│   │
│   ├── features/
│   │   ├── resident/       # Resident-facing features
│   │   ├── community/      # Community information
│   │   ├── admin/          # Administrative dashboard
│   │   └── auth/           # Authentication interfaces
│   │
│   ├── hooks/               # Reusable React hooks
│   ├── lib/                 # Library configuration
│   ├── services/            # External services and integrations
│   ├── types/               # Shared TypeScript types
│   └── utils/               # Utility functions
│
├── docs/                    # Project documentation
├── .env.example             # Environment variable template
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## Application Routes

### Resident Routes

| Route | Description |
|---|---|
| `/` | Resident homepage and exploration |
| `/communities/:communityId` | Community overview |
| `/hazard-map` | Hazard map interface |
| `/report-hazard` | Submit a hazard report |
| `/alerts` | Public alerts |
| `/my-activity` | Resident activity |
| `/login` | User login |
| `/register` | User registration |

### Administrative Routes

| Route | Description |
|---|---|
| `/admin` | Administrative dashboard |
| `/admin/reports` | Report management |
| `/admin/communities` | Community risk overview |
| `/admin/broadcast` | Emergency broadcast interface |

Authentication and authorization enforcement for administrative routes must be implemented and verified through the backend before production deployment.

---

## Development Workflow

FloodGuard uses a feature-branch workflow to support collaboration between frontend and backend developers.

### Branching Strategy

- `main` — Shared integration branch.
- `feat/*` — Feature development branches.
- `fix/*` — Bug fixes.
- `docs/*` — Documentation changes.

### Contribution Process

1. Ensure your local `main` branch is up to date.
2. Create a branch for your assigned feature.
3. Implement changes within the agreed feature scope.
4. Run the build and lint checks.
5. Commit your changes using a descriptive commit message.
6. Push your feature branch.
7. Open a pull request into `main`.
8. Request review and resolve any feedback before merging.

Example:

```bash
git switch main
git pull origin main

git switch -c feat/your-feature

# Implement your changes

npm run build
npm run lint

git add .
git commit -m "feat: describe your feature"
git push -u origin feat/your-feature
```

Avoid pushing directly to `main` unless explicitly authorized by the project maintainers.

### Team Responsibilities

The project is developed collaboratively across frontend and backend responsibilities.

| Role | Responsibility |
|---|---|
| Frontend Developer 1 | Resident experience |
| Frontend Developer 2 | Community features |
| Frontend Developer 3 | Administrative dashboard |
| Full-Stack Developer 1 | Core backend and database |
| Full-Stack Developer 2 | Weather, risk engine and AI services |

Changes to shared types, API contracts, database schemas, and service interfaces should be communicated to the relevant team members.

---

## Data Integrity and Safety

FloodGuard is an environmental awareness and preparedness platform. The accuracy and presentation of risk information are important.

The following principles guide development:

- Weather forecasts must not be presented as confirmed flood predictions.
- Risk estimates must not be presented as official emergency warnings.
- Missing, unavailable, or stale data must be clearly identified.
- Unverified resident reports must not be represented as confirmed incidents.
- AI-generated explanations must not replace official emergency guidance.
- Administrative access must be protected through verified authentication, authorization, and database policies.
- Emergency communication must not be represented as successfully delivered unless delivery has been confirmed.

Residents should follow official emergency instructions from relevant authorities.

---

## Current Implementation Status

FloodGuard is under active development. Its frontend application currently includes resident and administrative experiences, while some capabilities require further backend integration.

| Area | Status |
|---|---|
| Resident frontend | Implemented |
| Administrative frontend | Implemented |
| Community interface | Implemented |
| Weather and map integration | Integrated into frontend |
| Authentication backend | Requires verification |
| Persistent hazard reporting | Requires backend integration |
| Report verification workflow | Requires backend integration |
| Administrative authorization | Requires backend enforcement |
| Emergency broadcast delivery | Requires backend integration |
| AI risk intelligence | Subject to backend integration and validation |

A successful frontend build does not, by itself, establish that every backend-dependent workflow is operational.

---

## Contributing

Contributions, feedback, and technical improvements are welcome.

When contributing:

- Keep changes focused and maintainable.
- Follow the existing TypeScript and React conventions.
- Avoid unnecessary dependencies.
- Preserve the separation between resident and administrative features.
- Document changes to shared interfaces and integrations.
- Include appropriate error, loading, and empty states.
- Never commit credentials, private keys, or sensitive user information.

For substantial changes, discuss the proposed implementation with the project team before beginning work.

---

## License

No open-source license has currently been specified for this repository.

Until a license is added, the project should not be assumed to grant permission for redistribution, modification, or commercial use.

---

## Project Information

**FloodGuard AI — Know the Risk. Prepare Before It Happens.**

Developed as part of HackGlobal 2026.

Repository: [https://github.com/Dave-tab/floodguard](https://github.com/Dave-tab/floodguard)
