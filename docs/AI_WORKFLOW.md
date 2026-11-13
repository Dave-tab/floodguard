# FLOODGUARD AI — AI DEVELOPMENT WORKFLOW

## Purpose

This document defines how team members should use AI coding assistants while building FloodGuard AI.

AI is a development assistant. It does not replace human ownership, technical review, or project decisions.

## 1. Before starting a task

Every developer should provide their AI assistant with:

- The exact feature or issue being worked on.
- Their assigned responsibility.
- Relevant requirements from the PRD and SRS.
- Relevant architecture details.
- Relevant shared implementation contracts.
- Existing files or code that need to be inspected.

Do not ask an AI assistant to build an entire feature based on a vague description.

## 2. Recommended task prompt

Use this structure:

### Task
[Describe the exact feature or bug.]

### Assigned responsibility
[Describe the part of the system you own.]

### Requirements
[List the approved requirements.]

### Relevant files
[List known files or ask the assistant to inspect the project.]

### Constraints
[List what must not change.]

### Expected result
[Describe the expected behavior and acceptance criteria.]

### Approval boundary
Do not change architecture, shared contracts, database structures, security policies, dependencies, or product behavior without first presenting the proposal and receiving approval.

## 3. Approval process

AI must distinguish between:

**Routine implementation work**
Work that clearly follows approved requirements and existing patterns. AI may implement this within the assigned scope.

**Decisions requiring approval**
Changes that affect product scope, architecture, database design, API contracts, authentication, security, risk logic, external services, costs, or other developers' responsibilities.

For approval-required decisions, AI must:

1. Explain the problem.
2. Explain why the current approved approach is insufficient.
3. Present the proposed change.
4. Explain trade-offs and affected modules.
5. Wait for an explicit human decision.

A recommendation is not an approval.

## 4. Working with generated code

Before accepting generated code:

- Check whether it follows the requirements.
- Check whether it uses existing shared types.
- Check whether it introduces new dependencies.
- Check error and loading states.
- Check security implications.
- Check whether it creates fake or misleading data.
- Run appropriate checks.
- Request human review where necessary.

Do not blindly accept large AI-generated changes.

## 5. Handling uncertainty

When the assistant does not know:

- It must say so.
- It must identify the missing information.
- It must not invent an answer.
- It must request clarification when necessary.

When an external API is involved, verify its actual documentation and response structure before implementation.

## 6. Team integration

Before changing shared files, notify the relevant team members.

Shared contracts must be agreed upon before separate features depend on them.

Developers should avoid independently creating duplicate:
- Type definitions.
- API response formats.
- Database models.
- Authentication logic.
- UI components.
- Business rules.

## 7. Testing and reporting

AI-generated code is not automatically correct.

Every completed task should include:
- What was implemented.
- What was changed.
- What checks were run.
- What passed or failed.
- What remains incomplete.
- Any decisions still requiring approval.

## 8. Non-negotiable rule

Do not sacrifice correctness, security, product integrity, or team coordination for faster AI-generated output.
