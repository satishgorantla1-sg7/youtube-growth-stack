---
name: update-architecture
description: Update README Mermaid diagrams, architecture decisions, data flow, repository maps, and risk documentation after structural changes. Use when a component, boundary, provider, data domain, or workflow changes.
---

# Update Architecture

1. Compare the implementation with README diagrams and `docs/architecture`.
2. Update the product architecture, user journey, data flow, repository tree, and agent loop affected by the change.
3. Add a short ADR under `docs/decisions` for consequential choices and rejected alternatives.
4. Keep diagrams readable: one concern per diagram, short labels, no secrets or vendor credentials.
5. Distinguish shipped behavior, configured integrations, demo behavior, and planned work.
6. Validate Mermaid syntax through the documentation build or GitHub preview.
