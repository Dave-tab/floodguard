# FloodGuard AI

**Know the Risk. Prepare Before It Happens.**

FloodGuard AI is a community-focused flood-risk awareness and environmental hazard reporting platform developed for HackGlobal 2026.

## Technology Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Supabase
- Leaflet / OpenStreetMap
- Recharts

## Getting Started

### Requirements

- Node.js and npm
- Git

### Installation

Clone the repository:

    git clone YOUR_REPOSITORY_URL

Navigate into the project:

    cd FloodGuard-AI

Install dependencies:

    npm install

Create your local environment file:

    Copy-Item .env.example .env.local

Start the development server:

    npm run dev

### Available Scripts

- `npm run dev` - Start the development server.
- `npm run build` - Type-check and build the application.
- `npm run lint` - Run ESLint.
- `npm run preview` - Preview the production build.

## Project Structure

- `src/app` - Application setup, routing and providers.
- `src/components/ui` - Reusable interface components.
- `src/components/layout` - Shared layout components.
- `src/features/resident` - Resident-facing functionality.
- `src/features/community` - Community information and hazard reporting.
- `src/features/admin` - Administrative dashboard and report verification.
- `src/hooks` - Reusable React hooks.
- `src/lib` - External library configuration and clients.
- `src/services` - API and application services.
- `src/types` - Shared TypeScript types.
- `src/utils` - Utility functions.
- `supabase/migrations` - Database migrations.
- `supabase/functions` - Supabase Edge Functions.

## Team Responsibilities

- Frontend Developer 1 - Resident Experience.
- Frontend Developer 2 - Community Features.
- Frontend Developer 3 - Admin Dashboard.
- Full-Stack Developer 1 - Core Backend and Database.
- Full-Stack Developer 2 - Weather, Risk Engine and AI Services.

## Collaboration Guidelines

1. Do not push directly to `main`.
2. Create a feature branch for assigned work.
3. Keep changes within your assigned feature or shared responsibility.
4. Pull the latest `main` before starting new work.
5. Open a pull request for review before merging.
6. Communicate changes to shared types, API contracts and database schemas.
7. Never commit environment secrets.

## Product Integrity

- Forecast information must not be presented as a confirmed flood prediction.
- Prototype risk estimates must not be presented as official emergency warnings.
- Missing or stale data must be clearly identified.
- Unverified hazard reports must not be presented as confirmed incidents.

## Project

HackGlobal 2026
