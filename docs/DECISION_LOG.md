# FLOODGUARD AI — DECISION LOG

## Purpose

This document records important decisions that have been explicitly approved by the project owner or authorized technical leads.

AI assistants and developers must not treat proposed or unapproved decisions as established project facts.

## Decision statuses

- PROPOSED — Awaiting human approval.
- APPROVED — Explicitly approved.
- REJECTED — Considered and not accepted.
- SUPERSEDED — Replaced by a later approved decision.

## Decision entry template

Copy this section for every important decision.

---

### DEC-[NUMBER]: [Decision title]

**Status:** PROPOSED / APPROVED / REJECTED / SUPERSEDED

**Date:**

**Proposed by:**

**Approved by:**

**Context:**

What problem or requirement led to this decision?

**Options considered:**

What alternatives were considered?

**Proposed decision:**

What is being recommended?

**Final decision:**

What was actually approved?

**Reasoning:**

Why was this decision selected?

**Affected areas:**

Which features, developers, files, APIs, or database structures are affected?

**Consequences:**

What trade-offs, risks, or follow-up work does this introduce?

**Related documents:**

Links or references to relevant requirements and architecture sections.

---

## Existing project guardrails

The following are established project constraints documented in the current project specifications:

1. Forecast rainfall must not be represented as observed rainfall.
2. Prototype risk scores must not be presented as official warnings.
3. Missing or insufficient data must not automatically produce LOW risk.
4. Pending reports must not be displayed publicly as confirmed hazards.
5. Risk calculations must be deterministic and auditable.
6. AI must not independently determine or approve risk classifications.

These guardrails must not be changed by an AI assistant.
