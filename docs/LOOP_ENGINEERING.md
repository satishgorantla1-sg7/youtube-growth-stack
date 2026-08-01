# Loop Engineering, in plain language

Loop engineering means building the repository so each change produces evidence, feedback, and reusable learning. The “loop” is not a server framework and it does not replace the backend. It is the way humans and coding agents safely improve the product.

```mermaid
flowchart LR
  I[Issue] --> F[Frame acceptance criteria]
  F --> C[Change one vertical slice]
  C --> V[Verify locally]
  V --> R[Review diff and risks]
  R --> P[Pull request]
  P --> CI[Automated checks]
  CI --> H[Human review]
  H -->|changes requested| F
  H -->|approved| M[Merge]
  M --> L[Capture durable learning]
  L --> I
```

## Where it lives

| Repository surface | What it contributes to the loop |
|---|---|
| `AGENTS.md` | Durable rules and verification commands |
| `.agents/skills/*` | Repeatable procedures for common changes |
| `.github/workflows/ci.yml` | Independent, reproducible evidence |
| `.github/pull_request_template.md` | Human review checklist |
| `docs/decisions/*` | Why consequential choices were made |
| Tests and migrations | Executable product and data contracts |

The loop is successful when a future contributor can understand a decision, reproduce the checks, and make the next change without guessing.
