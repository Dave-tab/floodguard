# FloodGuard AI — Project Documentation

This directory contains the core product and engineering specifications for the FloodGuard AI hackathon MVP.

## Documents

| Document | Purpose |
|---|---|
| [Product Requirements Document](./PRD.md) | Defines the product vision, scope, target users, features, priorities and success criteria. |
| [Software Requirements Specification](./SRS.md) | Defines testable functional and non-functional requirements, acceptance tests and release readiness. |
| [Software Architecture Document](./SOFTWARE_ARCHITECTURE.md) | Defines the proposed system architecture, components, data model, data flows, security and technical decisions. |

## Recommended Reading Order

1. **PRD:** Understand what we are building and why.
2. **SRS:** Understand what the application must do and how we will test it.
3. **Software Architecture:** Understand how the application should be structured and implemented.

## Team Guidelines

- Treat P0 requirements as the MVP commitment.
- Do not start P1 work until the P0 workflow works end-to-end.
- Keep implementation decisions consistent with the architecture document.
- Communicate database schema, API contract and shared type changes before making dependent changes.
- Update documentation through a pull request when an agreed technical or product decision changes.
- Do not describe proposed features as implemented until they have been built and verified.

## Core MVP Workflow

Resident selects a community → views available weather and qualified risk information → submits a hazard report → administrator reviews and verifies the report → verified hazard appears in the resident map/list.

**Important:** FloodGuard AI provides prototype risk information, not official emergency warnings or scientifically validated flood predictions. Missing or stale data must never be presented as LOW risk.