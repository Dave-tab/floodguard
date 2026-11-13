# FloodGuard AI — Contribution Guidelines

These guidelines define how developers contribute code, collaborate, and integrate their work into the FloodGuard AI project.

All five developers must follow this workflow.

## 1. Branch Strategy

The `main` branch is the stable integration branch.

Each developer must work on an assigned feature branch.

### Approved Feature Branches

| Branch | Responsibility |
|---|---|
| `feat/resident-experience` | Resident dashboard and weather interface |
| `feat/community-features` | Hazard reporting, maps, alerts and resident features |
| `feat/admin-dashboard` | Administrative dashboard and report management |
| `feat/core-backend` | Database, authentication, RLS and report operations |
| `feat/weather-risk-engine` | Weather integration and risk assessment |

Do not work directly on `main`.

If a task does not fit an existing branch, agree on a new branch with the team before creating it.

## 2. Development Workflow

Every developer must follow these steps:

1. Pull the latest changes from `main`.
2. Switch to their assigned feature branch.
3. Implement their assigned functionality.
4. Test their changes locally.
5. Commit changes with meaningful commit messages.
6. Push changes to their feature branch.
7. Open a Pull Request (PR) targeting `main`.
8. Request review before merging.
9. Resolve any requested changes or merge conflicts.
10. Confirm that the integrated application still works.

## 3. Commit Guidelines

Write clear commit messages describing the changes.

Examples:

- `feat: implement resident dashboard`
- `feat: add hazard report submission`
- `feat: integrate Open-Meteo weather service`
- `fix: resolve authentication redirect issue`
- `fix: correct community selection state`
- `refactor: extract reusable dashboard components`
- `docs: update implementation contracts`

Avoid vague messages such as:

- `update`
- `changes`
- `fixed stuff`
- `working code`

## 4. Pull Request Rules

Every Pull Request must:

- Target the `main` branch.
- Have a descriptive title.
- Explain what was implemented.
- Identify relevant features or issues.
- Mention any dependencies on another developer's work.
- Include known limitations or incomplete functionality.
- Confirm which checks were performed.

Do not merge unreviewed changes into `main`.

## 5. Code Integration Rules

- Do not push directly to `main`.
- Do not overwrite another developer's work.
- Do not silently modify shared components or contracts.
- Communicate before changing shared types, interfaces or database structures.
- Resolve merge conflicts carefully.
- Do not remove existing functionality without approval.
- Pull recent changes before beginning integration work.

## 6. Shared Contracts

All developers must follow:

- `docs/IMPLEMENTATION_CONTRACTS.md`
- `docs/SOFTWARE_ARCHITECTURE.md`
- `docs/SRS.md`

Any proposed change to shared contracts must be discussed and approved before implementation.

## 7. Environment and Security

Never commit:

- `.env` files containing secrets.
- Supabase service-role keys.
- API keys or access tokens.
- Private credentials.
- Personal user data.

Use the approved environment-variable configuration.

## 8. Before Submitting a Pull Request

Confirm that:

- [ ] The application builds successfully.
- [ ] Relevant lint checks pass.
- [ ] The implemented feature works locally.
- [ ] Existing functionality has not been unintentionally broken.
- [ ] No secrets or credentials are included.
- [ ] Shared contracts have been respected.
- [ ] Known limitations are documented.

## 9. Final Rule

The `main` branch must remain the stable, working integration branch.

Every developer is responsible for contributing clean, tested and compatible code.

Communication comes before changes that affect another developer's work.