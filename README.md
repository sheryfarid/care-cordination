# AI-Enabled NHS Clinical Workflow and Care Coordination Platform — prototype

Synthetic-data prototype covering the **Fracture Liaison Service** (second-dose zoledronate coordination) and **Medication Safety and Discharge Coordination** workflows. It is a technology-partnership demonstration and discovery tool. It is **not** an approved clinical system, holds no real patient data and has no live NHS, Epic, GP or community-pharmacy integration.

## Run it

```bash
npm install
npm test          # 31 engine, rule and safety tests
npm run build     # bundles to dist/ and writes the single-file page
npm run dev       # esbuild watch + static server on index.html
```

## What is in this slice

| Brief section | Where |
| --- | --- |
| Shared engine, deterministic execution, retries, idempotency, failure recovery | `src/engine.ts` |
| Versioned rules with owners, approval status, test cases and history | `src/rules.ts`, Administration → Rules |
| Node registry, two seeded workflows, publish validation (incl. gate-bypass check) | `src/workflows.ts` |
| Task, review, exception, communication, referral and hash-linked audit services; permission checks | `src/services.ts` |
| Provider-independent AI adapter (offline deterministic mock only; disabled by default) | `src/ai.ts` |
| Store, persistence, service actions (Zustand) | `src/store.ts` |
| Workflow Studio (@xyflow/react): palette drag-and-drop, ports, mini-map, undo/redo, duplicate, search, auto layout, import/export, drafts, publish, version compare, simulation, replay, node dry-run, read-only review | `src/ui/studio.tsx` |
| Command Centre, service pages, worklists, Patient 360 | `src/ui/pages1.tsx` |
| Review queue, tasks, communications + AI assistant, integration hub, analytics, governance, administration | `src/ui/pages2.tsx` |
| Synthetic scenarios (6 FLS, 7 medication) | `src/seed.ts` |

All twelve navigation items open working screens. Dashboard counts are computed from the seeded data. Simulations step the real engine; nothing is animated independently.

## Safety behaviours covered by tests

Missing information never routes to “complete”; an outdated result routes to “incomplete”; an interface outage goes to a technical-failure branch with a manual fallback task and never reaches the readiness checklist; correspondence and scheduling cannot happen before a clinical gate (enforced at runtime and at publish); only the required role can decide a review, and denials are audited; repeated triggers reuse open tasks, executions and referrals; a failed handover keeps one open exception; AI drafts never change medicines and report uncertainty; tasks cannot close without evidence; dry runs have no side effects and never pass a gate.

## Architecture: prototype to target

The prototype runs the service layer in the browser so it can be demonstrated without infrastructure. The module boundaries are drawn so each maps to a backend service:

```
React (Vite, TanStack Query)  ──REST/OpenAPI + SSE──▶  NestJS API (auth, RBAC, validation, correlation IDs)
                                                        ├─ Workflow execution service  ◀── engine.ts
                                                        ├─ Rules service               ◀── rules.ts
                                                        ├─ Task / review / audit       ◀── services.ts
                                                        ├─ Integration adapters        ◀── adapterCall + Integration Hub
                                                        └─ AI gateway                  ◀── ai.ts
                                         BullMQ workers (Redis): scheduled triggers, escalation sweep, retries
                                         PostgreSQL (Prisma): entities in section 15 of the brief, tenant column on every row
```

`startExecution`/`stepExecution`/`resumeAfterReview` are pure functions over a data object, so they move behind an API with PostgreSQL row locks unchanged in shape. Execution state, node runs and retry logs are already persisted per execution.

## Deliberate deviations from the brief in this slice

The NestJS, PostgreSQL/Prisma, Redis/BullMQ, Docker Compose, OpenTelemetry and Playwright layers are not included yet; permission checks run in the in-browser service layer rather than a server. Tailwind and shadcn/ui were replaced by a hand-written token stylesheet so the page works as a single self-contained file. Persistence is per-browser.

## Production-readiness gaps

Backend services and migrations; real identity (NHS CIS2 or organisational SSO); server-side RBAC and tenant isolation; live adapters only after Epic, GP and DMS approvals; clinical sign-off of every rule (all thresholds here are synthetic); DCB0129 safety case and DCB0160 deployment assessment; DPIA, DSPT and IG assessment; medical device intended-purpose assessment; penetration testing; WCAG 2.2 AA audit with assistive-technology users; AI provider evaluation before any enablement; monitoring, backup and incident processes. The system names “Alira”, “Heidi” and “EMIS” are unverified discovery items.
