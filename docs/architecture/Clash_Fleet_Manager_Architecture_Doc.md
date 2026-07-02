# Technical Design Document: Clash Fleet Manager

**Version:** 10.3
**Status:** Draft for Review  
**Note:** Prefaced by Section 0 (Strategy & Telos). The body below was reconciled in v10.3 so its framing no longer contradicts the gate; engineering content is unchanged. Read Section 0 first.

---

# Section 0: Strategy & Telos (Reframing Note)

**Version:** Strategy overlay for TDD v10.1
**Status:** Adopted — supersedes the implied "droplet is the destination" framing throughout the rest of this document.
**Purpose:** Reset what this project *is* before reading the phases, scope, and non-goals that follow.

---

## 0.1 What this project actually is

This is a **personal application, built well.** That is the whole goal, and it is a complete goal on its own.

The earlier version of this document carried an unstated assumption: that the end state is a multi-tenant, hardened, internet-exposed SaaS application running on a DigitalOcean Droplet, and that personal use was a waypoint on the road there. That assumption is now retired.

The reframing is this:

> **Phase one is making the app genuinely good for one user — me. That is allowed to be the final state.**
>
> The multi-tenant, internet-exposed future sits **behind a gate.** Going through the gate is an optional, deliberate decision made *after* the personal app exists — not a default the project drifts into.

Everything downstream in this document should be re-read through that lens. Where the original text justifies a decision "for the SaaS target," the real justification is now "because it is good architecture for my app, and conveniently also a cheap seam toward an optional future."

## 0.2 Why the gate, given this is not commercial

This is not a commercial product. It will not generate meaningful revenue. The realistic best case for a public deployment is that donations or Patreon roughly cover the server bill. That single fact is what makes the gate correct rather than counterintuitive.

In a commercial project, putting a gate before production would be backwards — you would want to minimize time-to-market because there is a payoff waiting at the end. Here there is no such payoff. Going through the gate buys the *privilege of paying for, securing, and operating a public service that other people use for free,* with all the operational and security liability that entails.

So the rational structure is to **protect the thing with certain value (a tool I use and maintain easily) and place a deliberate decision in front of the thing with speculative, possibly-negative value (running a hardened multi-tenant service at a loss).**

## 0.3 The gate

The gate cleanly separates two different disciplines that the original document blurred into one continuous ramp:

* **Before the gate — Software Engineering.** Making the application well-built, modular, correct, testable, and pleasant to maintain. All of this has immediate value to a fleet of one. None of it is throwaway, because "well-built for me" and "well-built as a foundation" are very nearly the same set of moves.

* **After the gate — Operations & Security.** Running a service for other people on the hostile internet: authentication, exposure hardening, rate limiting, disaster recovery, error tracking, uptime ownership. This work has **no payoff for a local single-user app** and is justified *only* by deciding to go multi-tenant.

The gate is a real decision to be answered from the far side of a working app, when the questions can be answered with evidence instead of assumption:

* Do I actually want to operate an internet-exposed service?
* Is there a second user who genuinely matters?
* Am I willing to own the security and uptime burden indefinitely?
* Does anything (donations, demand) justify the recurring cost and risk?

If the answer is yes, the post-gate work begins. If the answer is no — or never — the app stays personal and local, and **nothing has been lost.**

## 0.4 The one rule that keeps "eye on scalability" honest

The risk of this strategy is gold-plating the personal app with "scalability" features that are really the droplet wearing a disguise. The discipline that prevents it is a single test applied to every pre-gate decision:

> **Keep cheap seams. Defer expensive builds.**

A **seam** is a boundary left in place so a future bolt-on is a fill-in rather than a retrofit. Seams are cheap now, cheap to carry, and make future-me's life easy. **Pre-gate, a thing is allowed if it is either (a) better for my app right now, or (b) a cheap seam that costs ~nothing to leave in.** A thing is *not* allowed pre-gate if its only justification is the droplet.

Worked examples of the line:

| Item | Verdict | Why |
| --- | --- | --- |
| `owner_id` on user-owned tables | **Seam — keep** | Free on empty tables; brutal to retrofit later. Improves nothing today but costs nothing. |
| Per-record version tokens | **Better now — keep** | Directly fixes the current overwrite/data-loss bug. Pays off immediately. |
| `origin` discriminator on timers | **Seam — keep** | Cheap column; clarifies the model even for one user. |
| `get_current_owner()` identity seam | **Seam — keep** | One attachment point for future auth; also just cleaner than a global "current user." |
| Tenant-scoped queries (`WHERE owner_id = :current`) | **Seam — keep** | A no-op filter today; means isolation is already enforced everywhere if the gate opens. |
| Breaking up the 7000-line monolith | **Better now — keep** | Maintainability and testability win for a fleet of one, independent of any future. |
| OAuth / Google / Discord login | **Defer — post-gate** | No value to a local single user; pure operations work. |
| Rate limiting, reverse proxy, exposure hardening | **Defer — post-gate** | Only meaningful against the hostile internet. |
| Offsite backups, Sentry, structured ops logging | **Defer — post-gate** | Production operations, not personal-app engineering. |
| Second-user permissions / roles UI | **Defer — post-gate** | Built for a user who is still hypothetical. |

When something is ambiguous, the question is simply: *does this make my app better for me right now, or am I building it for a user who is still hypothetical?* If it's the latter, it lives behind the gate.

---

## 0.5 How this changes the rest of the document

The phases, scope tables, and non-goals below remain largely valid as *engineering* guidance, but their framing shifts:

* **Phases 0–3 and 5** (baseline tests, API contract, FastAPI + MariaDB schema, frontend modularization) are now the **pre-gate personal-app program.** They are the destination of phase one, not steps toward the droplet.
* **Phase 4 (auth) and Phase 6 (production hardening)** are now explicitly **post-gate.** They move behind the decision and are not assumed.
* Wherever the text reads "for the SaaS target" or "for production," substitute "because it is good architecture, and conveniently also a seam." The work is the same; the *reason* is now self-justifying rather than conditional on a future that may never arrive.
* The schema-first decision (merging the original Phases 2–3 into a single schema-first cutover, with the API contract as the fixed invariant and the legacy JSON path retained as a hot fallback) stands, because the schema is what fixes the present overwrite pain — not merely what enables a future.

## 1. Context & Scope

**Overview:** The project is a migration of a legacy, monolithic Clash of Clans fleet management tool into a modern, well-architected **personal application** — modular, testable, and pleasant to maintain — with the data model and seams left in place so that a multi-tenant future is an *optional* path behind the gate rather than an assumed destination (see Section 0). The current legacy implementation consists of an HTML/JavaScript frontend, a lightweight PHP backend, and JSON flat-file persistence.

**Migration Strategy:** The migration will use the Strangler Fig pattern. The system will be migrated iteratively to preserve stability, isolate variables, and avoid cascading debugging failures. The guiding principle is to change one major system concern at a time.

**Runtime Environment:** The primary runtime is the local/NAS environment where the personal app actually lives. A constrained DigitalOcean Droplet using Docker Compose is the *post-gate* production target should the multi-tenant path ever be taken; designing against a low-cost host with limited CPU, memory, and storage remains a useful efficiency discipline either way.

**Primary Architectural Bias:** Preserve the hard-won behavior of the existing tool while gradually replacing implementation details. Regression risk is treated as more important than architectural purity.

---

## 1.1 Assumptions

The following assumptions shape the initial architecture and migration plan. If any of these assumptions change, the affected architecture decisions should be reviewed before implementation continues.

* **Small User Base:** The app serves one user today and, even post-gate, would expect only a small number. The architecture should be sound but not over-engineered for scale that does not yet exist.

* **Constrained Hosting Environment (post-gate target):** Should the multi-tenant path be taken, the production target is a low-cost DigitalOcean Droplet with limited CPU, memory, and storage. Treating resource efficiency as a first-class constraint is a useful discipline even for the personal app, and keeps the post-gate option cheap.

* **Thick Client Remains Acceptable:** The browser can continue to perform timer calculations, sorting, filtering, snapshot parsing, and other client-side logic. The backend does not need to own every piece of application intelligence on Day 1.

* **Manual Snapshot Workflow Remains Core:** The app is not attempting to directly integrate with Clash of Clans or automate account synchronization. Users will continue to paste or upload account snapshot JSON and review parsed timer candidates before saving them.

* **Clean Timer Slate Is Acceptable:** Existing timer data is operational and time-sensitive. Day-1 migration does not require full ETL of legacy `timers.json` timer records, provided users can rebuild current state through the snapshot parser and manual timer entry.

* **Configuration Has More Long-Term Value Than Timers:** Saved views, account tag mappings, snapshot freshness settings, and similar configuration data are more durable than timer state. These should either be manually seedable, importable, or migrated separately from timer data.

* **Tenant-Ownership Seam Kept From Day One:** The schema and API are designed so user-owned data is scoped to an ownership boundary (`owner_id`) from the start, even though the only user today is me. This is a cheap seam (see Section 0.4), not a commitment to launch: it costs ~nothing on empty tables, is brutal to retrofit later, and means multi-tenant isolation is already enforced everywhere if the gate is ever opened.

* **Co-Management Is a Likely Use Case:** The model should allow for more than one person to access the same fleet or account group in the future, even if advanced roles and permissions are deferred.

* **Manual Deployment Is Acceptable Initially:** Automated CI/CD is not required for Day 1. Manual deployment is acceptable while the system is stabilizing, provided the steps are documented and repeatable.

* **Regression Risk Is Higher Than Greenfield Complexity:** The existing app already works and contains many learned edge cases. The migration should prioritize preserving known behavior over rewriting large areas for architectural purity.

* **Testing Must Precede Major Refactoring:** The frontend monolith should not be aggressively split apart until key user flows are protected by automated browser tests.

* **Operational Simplicity Beats Theoretical Elegance:** When two designs are technically valid, the simpler design should be preferred unless the more complex option directly reduces a known risk.

---

## 1.2 Day-1 Implementation Scope

This section defines what is included in the initial build and what is intentionally deferred. The purpose is to keep the first implementation focused, testable, and runnable in the local/NAS environment. "Day-1" here means the pre-gate personal-app program (see Section 0); items justified only by the post-gate multi-tenant path are called out as deferred.

### In Scope

The Day-1 implementation includes the following:

* **Single Personal Application Instance:** A runnable web application hosted in the local/NAS environment using Docker Compose. (The same compose setup is what a post-gate droplet deployment would build on, but production hosting is not a Day-1 item.)

* **FastAPI Backend:** A Python/FastAPI backend replacing the legacy PHP API while preserving the essential load/save behavior needed by the frontend.

* **MariaDB Persistence:** Relational persistence for users, fleets, accounts, timers, saved views, account tag mappings, snapshot metadata, and game object mappings.

* **Owner-Scoped Data Model (seam):** All user-owned data is scoped to an `owner_id` ownership boundary from the start. Today this is a no-op filter with one owner; it is kept as a cheap seam so isolation is already in place if the gate opens.

* **Identity Seam (not auth):** Every "who is this" question routes through a single `get_current_owner()` abstraction, which pre-gate simply returns the local owner (e.g. via a hardcoded ID or a Tailscale header). Real OAuth login is deferred post-gate (see Out of Scope); this seam is the one attachment point it will later plug into.

* **Core Timer Management:** Users must be able to create, edit, delete, view, filter, sort, pin, and manage timers.

* **Account Snapshot Import:** Users must be able to paste or upload Clash of Clans account snapshot JSON, parse timer candidates, review them, and selectively create timers.

* **Saved Views:** Users must be able to create and manage named account views that limit which accounts appear in the UI.

* **Account Tag Mapping:** The system must support mapping Clash account tags to user-friendly account names.

* **Snapshot Freshness Tracking:** The system must retain snapshot metadata and freshness thresholds so users can see how old account data is.

* **Stale Save Protection:** The system must reject stale writes from old browser tabs or devices rather than silently overwriting newer data.

* **Basic Backup and Restore Procedure:** A simple, documented way to back up and restore the local database. (Scheduled offsite disaster recovery is post-gate operations work — see Section 0.3 — but a basic local backup is sensible even for personal use.)

* **Baseline Automated Testing:** Playwright tests must cover critical frontend user flows, and backend tests must cover persistence, owner-scoped queries, and stale-write rejection (the latter being the actual fix for the present overwrite bug).

* **Manual Deployment:** Deployment may be manual for Day 1, provided the process is documented, repeatable, and reversible.

### Out of Scope

The Day-1 implementation does not include the following:

* **OAuth Login & Public Authentication (post-gate):** Google/Discord OAuth, session cookies, and any public login flow are deferred behind the gate. Pre-gate, identity is handled by the `get_current_owner()` seam (see In Scope).

* **Internet Exposure & Production Hardening (post-gate):** Reverse proxy, rate limiting, exposure hardening, offsite disaster recovery, and error-tracking/observability tooling are operations work justified only by going multi-tenant (see Section 0.3).

* **Automated CI/CD:** GitHub Actions or other automated deployment pipelines are deferred until the application stabilizes.

* **Full Legacy Timer ETL:** Existing `timers.json` timer records do not need to be migrated into the new database. Timer state may be rebuilt through snapshot imports and manual entry.

* **Direct Clash of Clans Integration:** The app will not call Supercell APIs, scrape game data, automate account sync, or attempt real-time integration with the game.

* **Mobile Native App:** The initial product remains a responsive web application, not an iOS or Android app.

* **Advanced Roles and Permissions:** Multi-user fleet sharing may be considered in the data model, but complex role-based access control is deferred.

* **Billing and Subscriptions:** Payment processing, paid tiers, invoices, and subscription management are not part of Day 1.

* **Public User Onboarding Funnel:** Marketing pages, self-serve onboarding flows, email campaigns, and growth analytics are deferred.

* **Advanced Admin Console:** Internal admin tooling is limited to what is necessary for support and data inspection.

* **Enterprise Secrets Management:** HashiCorp Vault, AWS Secrets Manager, or equivalent tooling is deferred. Environment files and server hardening are sufficient for the initial deployment.

* **Header-Based API Versioning:** The initial API will use simple `/api/v1` route versioning. Header-based versioning may be reconsidered later if the API surface grows.

* **Large-Scale Performance Optimization:** The system should be efficient, but optimizations for thousands of concurrent users are out of scope until usage justifies them.

* **Major Visual Redesign:** The migration should preserve known working behavior. Visual redesigns should be handled separately from the architecture migration.

---

## 2. Goals & Non-Goals

### Goals

* **Well-Architected Personal App (with seams kept):** Transform the tool from a 7000-line monolith into a modular, testable, maintainable personal application — keeping the ownership and concurrency seams that make an optional multi-tenant future a fill-in rather than a retrofit. The multi-tenant platform itself is a post-gate option, not a goal of this phase (see Section 0).

* **Frictionless Development:** Maintain an inner development loop of under 2 seconds where practical using a monorepo structure, Docker volume mapping, and Uvicorn hot-reloading.

* **Resource Preservation:** Architect the system to run efficiently on highly constrained hardware.

* **Safe Migration:** Preserve working behavior while replacing implementation layers in controlled increments.

* **Operational Visibility:** Provide users with a low-friction way to understand which Clash accounts need attention and which upgrade queues are active.

### Non-Goals

* **Multi-Tenant Launch / Public Deployment:** Going live as an internet-exposed multi-tenant service is a post-gate decision, not a goal of the pre-gate program (see Section 0.3).

* **Automated CI/CD on Day 1:** Automated deployment pipelines are deferred until the application stabilizes.

* **Full Legacy Timer Data Migration:** The initial build will not require ETL of existing timer records from `timers.json`.

* **Enterprise Secrets Vault:** Enterprise-grade secrets management is not required for Day 1.

* **Full Product Commercialization:** Billing, subscription tiers, public marketing funnels, and large-scale onboarding are outside the initial implementation scope.

---

## 3. System Architecture

* **Thick Client / Thin Server:** To protect the constrained host from avoidable CPU spikes, the browser will continue to handle heavy compute logic such as JSON snapshot parsing, timer math, filtering, sorting, and local UI rendering. The backend will act as a lightweight API and persistence layer.

* **FastAPI Backend:** The legacy PHP API will be replaced with a Python/FastAPI backend. The first FastAPI version should preserve the behavior of the existing load/save API before introducing deeper structural changes.

* **Docker Compose Deployment:** The application will run through Docker Compose, including the frontend service, FastAPI service, MariaDB, and supporting infrastructure such as reverse proxying if required.

* **Local Containerized Simulation:** The local Windows development environment should simulate production constraints where practical by enforcing CPU and memory limits in `docker-compose.yaml`.

* **API Versioning Contract:** Initial API routes will use simple URL-based versioning, such as `/api/v1`. Header-based versioning is deferred unless API growth justifies it later.

* **Frontend Refactoring Constraint:** The frontend monolith should not be aggressively modularized until key user flows are covered by Playwright tests. Refactoring should begin with pure utility functions, snapshot parsing, and API client code before moving into UI rendering.

---

## 4. Data Strategy

* **Relational Multi-Tenancy:** The backend will use MariaDB 10.11. All user-owned records will be scoped to a tenant, fleet, or user ownership boundary. Global uniqueness should be avoided unless the value is truly global. Most uniqueness rules should be tenant-scoped compound constraints.

* **Configuration Durability:** Saved views, account tag mappings, snapshot freshness settings, and game object mappings should be treated as durable configuration, not disposable timer state.

* **Timer State as Operational Data:** Timers are time-sensitive operational records. Legacy timer data may be rebuilt rather than fully migrated, but new timer records should be persisted relationally.

* **Optimistic Concurrency:** Mutable records must include an `updated_at`, revision number, or equivalent version token. Saves from stale clients must be rejected rather than silently overwriting newer server state.

* **Snapshot Payload Strategy:** Raw Clash account snapshots may be parsed client-side and reduced into timer candidates before persistence. Raw snapshot storage is optional and should be introduced only if it supports debugging, auditability, or future features. Browser-side compression should be treated as an optimization to evaluate after measuring payload size, not as a Day-1 requirement.

* **Disaster Recovery:** A scheduled backup process will export MariaDB data, compress it, and push it to secure offsite object storage. Restore procedures must be documented and tested, not merely assumed.

---

## 5. Security & Authentication Posture

> **Scope note (v10.3):** This section is largely **post-gate** (see Section 0.3). It specifies how authentication and exposure hardening *would* work if the multi-tenant path is taken. Pre-gate, the only item that applies is the `get_current_owner()` identity seam; the rest is retained as a ready specification, not Day-1 work.

* **Authentication:** Login will be handled through Google and/or Discord OAuth. This avoids local password storage, password reset flows, and unnecessary credential liability.

* **Session Handling:** The preferred Day-1 approach is to avoid browser-readable long-lived tokens. Secure, HttpOnly, SameSite cookies should be preferred for session transport unless a later implementation decision justifies an alternate model.

* **Authorization Boundary:** Every API read and write must be scoped to the authenticated user’s tenant or fleet membership. Tenant isolation must be enforced in backend logic and tested explicitly.

* **Rate Limiting:** The application will implement IP-based and user-based rate limiting to reduce the risk of malicious bots, accidental infinite loops, or excessive client refreshes exhausting the constrained host.

* **Secrets Management:** Sensitive credentials will be injected through environment variables or `.env` files excluded from source control. Enterprise secrets tooling is deferred.

* **Error Reporting Privacy:** Error reporting must scrub sensitive values, including OAuth tokens, cookies, raw pasted game JSON, account identifiers where appropriate, and full request payloads.

---

## 6. Operations & Observability

> **Scope note (v10.3):** This section is largely **post-gate** (see Section 0.3). Production deployment, scheduled offsite backups, error tracking, and structured ops logging are justified by running a service for others. Pre-gate, a basic local backup (Section 1.2) is the only piece that earns its keep; the rest is retained as a ready specification.

* **Deployment Pipeline:** Initial deployments will be manual and executed through documented SSH commands such as `git pull`, `docker compose build`, and `docker compose up -d`. The deployment process must be repeatable and reversible.

* **Rollback Strategy:** Each deploy should have a simple rollback path, such as reverting to the previous Git commit and restarting containers. Database migrations must be handled carefully and backed up before execution.

* **Backups:** MariaDB backups must run on a schedule and be stored offsite. Backup success/failure should be visible through logs or alerts.

* **Restore Testing:** A backup is not considered valid until a restore path has been tested at least once in a non-production environment.

* **Error Tracking:** Sentry or equivalent error tracking may be used for both frontend and backend errors. It should be configured with low-overhead async reporting, sampling where appropriate, and privacy scrubbing.

* **Structured Logging:** Backend logs should include request correlation IDs, authenticated tenant/user context where safe, endpoint name, response status, and error category. Logs should not include secrets or raw snapshot payloads.

---

## 7. Testing Strategy

* **Day-1 Enforcement:** Automated testing is a foundational requirement, not an afterthought. Tests should be established before structural refactoring begins.

* **Frontend E2E Testing:** Playwright will treat the legacy frontend as a black box, verifying core human user flows remain intact as the backend and frontend are refactored.

* **Frontend Unit Testing:** Unit tests should be introduced for extracted pure functions, especially snapshot parsing, timer calculations, freshness calculations, sorting, and work queue classification.

* **Backend Testing:** The FastAPI backend will be tested with `pytest`. Tests must cover persistence, tenant scoping, stale-write rejection, input validation, and backup-sensitive behavior where practical.

* **Regression Fixtures:** Known edge cases from the existing app should be preserved as test fixtures. This includes builder counts, guardian timers, builder base queues, account tag mapping, saved views, snapshot freshness, and stale save conflicts.

* **Testing Priority:** Test the behavior users rely on first. Do not spend early effort testing implementation details likely to change during the migration.

---

## Appendix A: Migration Phases

The migration will follow a staged Strangler Fig approach. Each phase changes only one major variable at a time so that regressions can be isolated quickly and the existing working tool remains available throughout the transition.

> **Gate ordering note (v10.3):** The phase *numbers* are inherited from the original plan and no longer match the pre/post-gate split exactly. Read it this way: **Phases 0–3 and Phase 5 are pre-gate** (the personal-app program — schema-first cutover, the overwrite fix, and frontend modularization), and **Phase 4 and Phase 6 are post-gate** (auth and production hardening). In particular, frontend modularization (Phase 5) is pre-gate work even though it is numbered after the gate; sequence it by what helps the personal app, not by the number. See Section 0.

### Phase 0: Baseline the Legacy Application

Before any structural migration begins, the current `index.html`, `api.php`, `timers.json`, and `account_views.json` implementation will be treated as the behavioral baseline.

Key activities:

* Capture the current working application state.
* Identify the critical user flows that must remain stable.
* Create Playwright black-box tests around those flows.
* Avoid refactoring the frontend until baseline tests exist.

Exit criteria:

* Core flows are covered by automated browser tests.
* The current app can still be run locally in its legacy form.
* Known edge cases are documented as fixtures or manual test notes.

### Phase 1: Define the API Contract

The existing PHP/file-based API will be documented as the initial API contract before it is replaced.

Key activities:

* Document the load/save endpoints and payload shapes.
* Preserve the existing stale-save protection pattern.
* Identify which payloads belong to timer data versus shared app configuration.
* Define the initial `/api/v1` route structure for the future FastAPI backend.

Exit criteria:

* The legacy API behavior is documented.
* The frontend can be tested against the documented API contract.
* The new backend has a clear compatibility target.

### Phase 2: Replace PHP with FastAPI While Keeping File Storage

The first backend migration step will replace `api.php` with a Python/FastAPI service while continuing to use JSON files for persistence.

This phase deliberately changes only the backend language/runtime, not the datastore.

Key activities:

* Implement FastAPI equivalents for the existing load/save behavior.
* Continue reading and writing JSON files.
* Preserve backup creation and stale-save rejection.
* Run the existing Playwright tests against the FastAPI backend.

Exit criteria:

* The frontend works against FastAPI with no user-visible behavior change.
* Existing tests pass.
* JSON file persistence remains intact.
* Deployment remains simple and reversible.

### Phase 3: Introduce MariaDB Persistence

Once FastAPI is stable, persistence will move from JSON files to MariaDB.

This phase changes the datastore while keeping the API contract stable.

Key activities:

* Add MariaDB schema for users, fleets, accounts, timers, saved views, account tag mappings, snapshot metadata, and game object mappings.
* Implement tenant-scoped reads and writes.
* Add optimistic concurrency fields to mutable records.
* Keep compatibility logic where practical so the frontend does not need a major rewrite.

Exit criteria:

* Timer and configuration data persist in MariaDB.
* Tenant isolation is enforced by schema and query design.
* Stale writes are rejected rather than silently overwriting newer data.
* Backup and restore procedures are tested.

### Phase 4: Add Authentication and Tenant Isolation — **THE GATE (post-gate work begins here)**

> This phase is where the gate sits (see Section 0.3). Everything before it is the pre-gate personal-app program and is allowed to be the final state. Starting this phase is the deliberate decision to pursue the multi-tenant future. Do not drift into it by inertia.

After the backend and datastore are stable, authentication and multi-tenant access rules will be introduced.

Key activities:

* Add Google and/or Discord OAuth login.
* Associate authenticated users with tenants/fleets.
* Enforce tenant ownership on every read and write.
* Add authorization tests to prevent cross-tenant data access.

Exit criteria:

* Users can log in without local passwords.
* Each user only sees data they are authorized to access.
* Backend tests verify tenant isolation.
* Existing single-user behavior maps cleanly into a default tenant/fleet model.

### Phase 5: Incrementally Modularize the Frontend

Only after backend behavior and test coverage are stable will the frontend monolith be split into smaller modules.

Key activities:

* Extract pure utility functions first.
* Extract snapshot parsing logic into a testable module.
* Extract API client functions.
* Extract UI rendering areas gradually.
* Avoid large visual redesigns during structural refactoring.

Exit criteria:

* The frontend is no longer dependent on one large monolithic file.
* Snapshot parsing and timer logic are independently testable.
* Playwright tests continue to protect core user flows.
* Refactoring remains incremental and reversible.

### Phase 6: Production Hardening — **post-gate**

> Post-gate operations work (see Section 0.3). Only relevant once the decision to run a public multi-tenant service has been made.

Once the migrated application is functionally stable, operational hardening will be completed.

Key activities:

* Add Sentry or equivalent error tracking with privacy scrubbing.
* Add rate limiting.
* Add structured logging.
* Add database backup automation.
* Add a documented manual deployment and rollback procedure.
* Evaluate whether automated CI/CD is worth adding.

Exit criteria:

* Production errors are visible.
* Backups are automated and restorable.
* Deployment steps are repeatable.
* The app can run reliably on the constrained DigitalOcean Droplet target.

---

## Appendix B: Domain Model

This section captures the initial domain model. It is not a final database schema, but it defines the core entities that the schema should support. The ownership entities are present as seams (see Section 0.4) even while there is a single owner.

### Core Entities

| Entity | Purpose | Notes |
| --- | --- | --- |
| `User` | Authenticated human user | Created from OAuth identity. Does not require local password storage. |
| `Tenant` or `Fleet` | Ownership boundary for a group of Clash accounts | Supports future co-management and data isolation. |
| `TenantMember` | Links users to tenants/fleets | Enables future shared fleet access and roles. |
| `Account` | A Clash account being tracked | Includes user-friendly account name and optional Clash account tag. |
| `Timer` | Active, paused, expired, or manual operational timer | Scoped to account and tenant/fleet. |
| `SavedView` | Named subset of accounts | Used to focus the UI on selected account groups. |
| `AccountTagMap` | Maps Clash account tags to account names | May be modeled as part of `Account` if tag uniqueness is tenant-scoped. |
| `SnapshotMetadata` | Last snapshot capture/import information per account | Supports freshness indicators and stale account data warnings. |
| `SnapshotFreshnessSettings` | Tenant/fleet-level freshness thresholds | Controls fresh/aging/stale UI indicators. |
| `GameObjectMap` | Maps Clash data IDs to readable object names | Supports better snapshot timer names and mobile display. |
| `SnapshotImport` | Optional record of a pasted/imported snapshot | Useful only if raw or summarized snapshot history is retained. |
| `SnapshotCandidate` | Optional parsed candidate generated from a snapshot | May be transient client-side only unless candidate history is useful. |

### Modeling Guidance

* Prefer tenant-scoped uniqueness over global uniqueness.
* Preserve account names as user-facing labels, but do not assume they are globally unique.
* Treat Clash account tags as stable identifiers when available, but allow manual account creation without a tag.
* Keep timer records operational and editable.
* Keep game object mapping maintainable because unknown Clash data IDs will appear over time.
* Design for co-management even if advanced permission controls are deferred.

---

## Appendix C: API and Concurrency Rules

### API Versioning

The initial API will use URL-based versioning:

```text
/api/v1/...
```

Header-based versioning is deferred. It may be reconsidered only if there is a clear need to support multiple thick-client versions with cleaner URL semantics.

### API Contract Principles

* Backend endpoints should be boring, explicit, and easy to test.
* The backend should validate tenant ownership on every request.
* The frontend should not send or receive data belonging to another tenant.
* API responses should include version or timestamp fields where clients need stale-write protection.
* Raw snapshot payloads should not be logged.

### Stale Save Protection

The existing app already protects against stale overwrites by sending the client’s last known server update timestamp with save requests. The migrated app must preserve this behavior — it is the actual fix for the present overwrite/data-loss problem, not merely future-proofing.

General rule:

1. Client loads a record or aggregate.
2. Server returns the record plus a version token, such as `updated_at` or `revision`.
3. Client sends that version token back when saving.
4. Server compares the client token to the current server token.
5. If the token is stale, the server rejects the save with a conflict response.
6. Client must reload before saving again.

Recommended conflict response:

```json
{
  "error": "Data changed on another device. Reload before saving.",
  "code": "STALE_DATA",
  "currentVersion": "...",
  "lastKnownVersion": "..."
}
```

### Mutable Aggregates Requiring Concurrency Protection

* Timers
* Saved views
* Account tag mappings
* Snapshot freshness settings
* Account metadata
* Any future shared fleet configuration

---

## Appendix D: Backup and Restore Procedure

### Backup Requirements

The production MariaDB database must be backed up automatically on a schedule.

Minimum requirements:

* Run at least nightly.
* Use `mysqldump` or an equivalent logical backup method.
* Compress backup files.
* Store backups outside the Droplet, such as DigitalOcean Spaces, S3, or another secure offsite location.
* Retain multiple backup generations.
* Log backup success and failure.

### Suggested Backup Flow

1. Run `mysqldump` against the MariaDB container or service.
2. Write the dump to a timestamped file.
3. Compress the dump.
4. Upload the compressed dump to offsite object storage.
5. Prune old local backups.
6. Optionally prune remote backups according to a retention policy.
7. Emit a success/failure log entry.

### Restore Requirements

A backup strategy is incomplete unless restore has been tested.

Minimum restore procedure:

1. Provision a non-production MariaDB instance.
2. Download a selected backup file.
3. Decompress the backup.
4. Restore the SQL dump.
5. Start the application against the restored database.
6. Verify that users, accounts, timers, saved views, snapshot metadata, and account tag mappings are present.
7. Document the result of the restore test.

### Restore Safety Rules

* Do not restore directly over production without a fresh backup.
* Do not run destructive migrations without a recent verified backup.
* Keep schema migration scripts in source control.
* Prefer reversible migrations where practical.

---

## Appendix E: Test Fixtures and Critical User Flows

### Critical User Flows

Initial Playwright tests should cover:

* Loading the timer list.
* Creating a manual timer.
* Editing a timer.
* Deleting a timer.
* Pinning and unpinning a timer.
* Filtering by account.
* Using a saved view.
* Opening the fleet summary.
* Parsing account snapshot JSON.
* Reviewing snapshot candidates.
* Adding selected snapshot timers.
* Replacing existing account timers while preserving manually noted timers.
* Handling a stale save conflict.

### Snapshot Parsing Fixtures

Fixtures should include known cases for:

* Home builder timers.
* Builder Base builder timers.
* Lab timers.
* Pet timers.
* Equipment timers.
* Guardian timers that consume home builder capacity.
* Helper cooldowns.
* Unknown data IDs.
* Account tag mapping.
* Snapshot freshness metadata.

### Backend Test Cases

Backend tests should cover:

* Creating and loading tenant-scoped timers.
* Preventing cross-tenant reads.
* Preventing cross-tenant writes.
* Rejecting stale saves.
* Saving and loading saved views.
* Saving and loading account tag mappings.
* Validating malformed payloads.
* Ensuring backup-sensitive operations do not silently fail.

### Regression Philosophy

Known edge cases from the existing app should become fixtures whenever possible. The goal is not to test every line of legacy code, but to preserve behavior that took real usage to discover.

---

## Appendix F: Open Decisions

The following decisions remain open and should be resolved before or during early implementation.

| Decision | Current Leaning | Notes |
| --- | --- | --- |
| Exact tenant naming | `Fleet` may be more domain-friendly than `Tenant` | Internally, either can work. User-facing language should probably use “Fleet.” |
| Auth providers | Google and Discord | Confirm whether both are required for Day 1 or whether one provider is enough initially. |
| Session transport | Secure HttpOnly cookies | Avoid browser-readable long-lived tokens unless there is a strong reason. |
| Raw snapshot storage | Defer or optional | Persist parsed outputs first unless raw history is needed. |
| Game object mapping maintenance | Database table plus admin/manual update path | Unknown Clash data IDs should not block imports. |
| Co-manager access | Model now, advanced roles later | Basic shared access may be enough initially. |
| CI/CD timing | Defer | Reconsider after manual deploy process stabilizes. |
| Billing | Out of scope | Revisit only after product usage justifies it. |
| Header-based API versioning | Defer | `/api/v1` is simpler for the initial build. |

---

## Appendix G: Deferred Enhancements

These items are intentionally not part of Day 1 but may be considered later.

* Automated CI/CD.
* Billing and subscriptions.
* Public marketing site and onboarding funnel.
* Advanced role-based access control.
* Native mobile app.
* Large-scale performance tuning.
* Rich admin console.
* Historical analytics based on snapshot history.
* Automated import helpers beyond paste/upload snapshot workflows.
* Full visual redesign.
