# Technical Design Document: Clash Fleet Manager

**Version:** 10.5
**Status:** Draft for Review  

---

## Section 0: Strategy & Telos (Reframing Note)

**Version:** Strategy overlay for TDD v10.1
**Status:** Adopted — supersedes the implied "droplet is the destination" framing throughout the rest of this document.
**Purpose:** Reset what this project *is* before reading the phases, scope, and non-goals that follow.

---

### 0.1 What this project actually is

This is a **personal application, built well.** That is the whole goal, and it is a complete goal on its own.

The earlier version of this document carried an unstated assumption: that the end state is a multi-tenant, hardened, internet-exposed SaaS application running on a DigitalOcean Droplet, and that personal use was a waypoint on the road there. That assumption is now retired.

The reframing is this:

> **Phase one is making the app genuinely good for one user — me. That is allowed to be the final state.**
>
> The multi-tenant, internet-exposed future sits **behind a gate.** Going through the gate is an optional, deliberate decision made *after* the personal app exists — not a default the project drifts into.

Everything downstream in this document should be re-read through that lens. Where the original text justifies a decision "for the SaaS target," the real justification is now "because it is good architecture for my app, and conveniently also a cheap seam toward an optional future."

### 0.2 Why the gate, given this is not commercial

This is not a commercial product. It will not generate meaningful revenue. The realistic best case for a public deployment is that donations or Patreon roughly cover the server bill. That single fact is what makes the gate correct rather than counterintuitive.

In a commercial project, putting a gate before production would be backwards — you would want to minimize time-to-market because there is a payoff waiting at the end. Here there is no such payoff. Going through the gate buys the *privilege of paying for, securing, and operating a public service that other people use for free,* with all the operational and security liability that entails.

So the rational structure is to **protect the thing with certain value (a tool I use and maintain easily) and place a deliberate decision in front of the thing with speculative, possibly-negative value (running a hardened multi-tenant service at a loss).**

### 0.3 The gate

The gate cleanly separates two different disciplines that the original document blurred into one continuous ramp:

* **Before the gate — Software Engineering.** Making the application well-built, modular, correct, testable, and pleasant to maintain. All of this has immediate value to a fleet of one. None of it is throwaway, because "well-built for me" and "well-built as a foundation" are very nearly the same set of moves.

* **After the gate — Operations & Security.** Running a service for other people on the hostile internet: authentication, exposure hardening, rate limiting, disaster recovery, error tracking, uptime ownership. This work has **no payoff for a local single-user app** and is justified *only* by deciding to go multi-tenant.

The gate is a real decision to be answered from the far side of a working app, when the questions can be answered with evidence instead of assumption:

* Do I actually want to operate an internet-exposed service?
* Is there a second user who genuinely matters?
* Am I willing to own the security and uptime burden indefinitely?
* Does anything (donations, demand) justify the recurring cost and risk?

If the answer is yes, the post-gate work begins. If the answer is no — or never — the app stays personal and local, and **nothing has been lost.**

### 0.4 The one rule that keeps "eye on scalability" honest

The risk of this strategy is gold-plating the personal app with "scalability" features that are really the droplet wearing a disguise. The discipline that prevents it is a single test applied to every pre-gate decision:

> **Keep cheap seams. Defer expensive builds.**

A **seam** is a boundary left in place so a future bolt-on is a fill-in rather than a retrofit. Seams are cheap now, cheap to carry, and make future-me's life easy. **Pre-gate, a thing is allowed if it is either (a) better for my app right now, or (b) a cheap seam that costs ~nothing to leave in.** A thing is *not* allowed pre-gate if its only justification is the droplet.

Worked examples of the line:

| Item                                                | Verdict               | Why                                                                                       |
| --------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------- |
| `owner_id` on user-owned tables                     | **Seam — keep**       | Free on empty tables; brutal to retrofit later. Improves nothing today but costs nothing. |
| Per-record version tokens                           | **Better now — keep** | Directly fixes the current overwrite/data-loss bug. Pays off immediately.                 |
| `origin` discriminator on timers                    | **Seam — keep**       | Cheap column; clarifies the model even for one user.                                      |
| `get_current_owner()` identity seam                 | **Seam — keep**       | One attachment point for future auth; also just cleaner than a global "current user."     |
| Tenant-scoped queries (`WHERE owner_id = :current`) | **Seam — keep**       | A no-op filter today; means isolation is already enforced everywhere if the gate opens.   |
| Breaking up the 7000-line monolith                  | **Better now — keep** | Maintainability and testability win for a fleet of one, independent of any future.        |
| OAuth / Google / Discord login                      | **Defer — post-gate** | No value to a local single user; pure operations work.                                    |
| Rate limiting, reverse proxy, exposure hardening    | **Defer — post-gate** | Only meaningful against the hostile internet.                                             |
| Offsite backups, Sentry, structured ops logging     | **Defer — post-gate** | Production operations, not personal-app engineering.                                      |
| Second-user permissions / roles UI                  | **Defer — post-gate** | Built for a user who is still hypothetical.                                               |

When something is ambiguous, the question is simply: *does this make my app better for me right now, or am I building it for a user who is still hypothetical?* If it's the latter, it lives behind the gate.

---

### 0.5 How this changes the rest of the document

The phases, scope tables, and non-goals below remain largely valid as *engineering* guidance, but their framing shifts:

* **Phases 0–2 and Phase 5** establish the protected operational baseline: regression coverage, a stable API contract, FastAPI with JSON persistence, and a modularized current frontend. This baseline is allowed to remain the final personal application indefinitely.
* **Phase 3** remains pre-gate engineering work, but it is now an **independently promotable MariaDB successor workstream**, not a mandatory continuation or assumed cutover.
* **Phase 4 (auth) and Phase 6 (production hardening)** are explicitly **post-gate.** They move behind the strategic decision and are not assumed.
* Wherever the text reads "for the SaaS target" or "for production," substitute "because it is good architecture, and conveniently also a seam." The work is the same; the *reason* is now self-justifying rather than conditional on a future that may never arrive.
* Stale-save protection already fixes the present overwrite/data-loss problem. A normalized MariaDB schema may later improve granularity, history, querying, and data management, but schema work is not required to preserve the overwrite protection that already exists.

### 0.6 Protected Operational Baseline and Successor-Work Seam

The current FastAPI/JSON application is an accepted operational baseline. It satisfies the present personal-use requirement and may remain the active application indefinitely.

MariaDB persistence, deeper data modeling, and any future frontend replacement are successor workstreams developed on the other side of a protected seam. They are not emergency remediation, and they are not prerequisites for continuing to use or maintain the current application.

The operating rule is:

> **The current application remains complete and usable while successor components earn the right to replace it.**

This has the following consequences:

* JSON remains the default operational datastore until an explicit MariaDB promotion decision is made.
* MariaDB schema work begins as an isolated development and testing activity, not as an immediate operational migration.
* DDL must be stored in source control and capable of creating a clean database in a disposable local MariaDB container.
* The schema may be inspected and tested through DBeaver or another database client without connecting the operational application to it.
* Database work may pause, restart, change direction, or be abandoned without leaving the operational application in a partially migrated state.
* The existing frontend, API behavior, JSON datastore, and operational data must not depend on unfinished MariaDB work.
* Schema design, backend persistence integration, data migration, operational cutover, and frontend replacement are separate decisions and should not be combined into one change.
* Dual-writing to JSON and MariaDB is not the default migration strategy. It may only be introduced through a separately designed and tested work package because it adds synchronization and recovery risk.
* The existing application remains the behavioral reference implementation. A successor must demonstrate API and user-flow parity before it is considered for promotion.
* A future frontend replacement must consume a stable API and must not require the datastore migration and frontend rewrite to occur simultaneously.

The MariaDB promotion boundary is separate from the strategic multi-tenant gate described in Section 0.3. The MariaDB boundary asks whether a tested successor persistence implementation should replace the current JSON datastore. The strategic gate asks whether the personal application should become an internet-exposed service for other users.

No MariaDB cutover is implied merely because schema development has begun or because an opt-in compatibility store exists.

## 1. Context & Scope

**Overview:** The project has evolved from a legacy monolithic tool into a working, well-architected **personal application** that is modular, testable, and pleasant to maintain. The accepted operational baseline now consists of the classic-script HTML/JavaScript frontend, the FastAPI backend, and JSON flat-file persistence. The PHP path remains available as a legacy compatibility and verification path during the transition. MariaDB and any future frontend replacement are isolated successor workstreams rather than prerequisites for continued operation.

**Migration Strategy:** The project uses the Strangler Fig pattern. Completed replacements become the new protected baseline, while later successor components are developed behind explicit seams. Each step should change one major system concern at a time so regressions can be isolated and unfinished work cannot destabilize the operational application.

**Runtime Environment:** The primary runtime is the local/NAS environment where the personal app actually lives. A constrained DigitalOcean Droplet using Docker Compose is the *post-gate* production target should the multi-tenant path ever be taken; designing against a low-cost host with limited CPU, memory, and storage remains a useful efficiency discipline either way.

**Primary Architectural Bias:** Preserve the hard-won behavior of the existing tool while gradually replacing implementation details. Regression risk is treated as more important than architectural purity. A successor component is not entitled to operational use merely because it has been implemented; it must earn promotion through evidence.

---

### 1.1 Assumptions

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

* **No Migration Urgency:** The current FastAPI/JSON application already meets the personal-use requirement. MariaDB and frontend successor work may proceed slowly, pause indefinitely, or stop without creating an incomplete operational state.

* **Testing Must Precede Major Refactoring:** The frontend monolith should not be aggressively split apart until key user flows are protected by automated browser tests.

* **Operational Simplicity Beats Theoretical Elegance:** When two designs are technically valid, the simpler design should be preferred unless the more complex option directly reduces a known risk.

---
### 1.2 Day-1 Implementation Scope

This section defines the capabilities included in the pre-gate personal-app program and the successor work that may be developed without being promoted. "Day-1" is retained as the historical label, but it no longer implies that every listed successor capability must replace the accepted FastAPI/JSON operational baseline.

### In Scope

The Day-1 implementation includes the following:

* **Single Personal Application Instance:** A runnable web application hosted in the local/NAS environment using Docker Compose. (The same compose setup is what a post-gate droplet deployment would build on, but production hosting is not a Day-1 item.)

* **FastAPI Backend:** A Python/FastAPI backend replacing the legacy PHP API while preserving the essential load/save behavior needed by the frontend.

* **MariaDB Successor Workstream:** Source-controlled DDL, an isolated containerized database, schema tests, and an optional relational persistence implementation for accounts, timers, saved views, account tag mappings, snapshot metadata, game object mappings, events, and history. Inclusion in the engineering program does not imply operational cutover.

* **Owner-Scoped Data Model (seam):** All user-owned data is scoped to an `owner_id` ownership boundary from the start. Today this is a no-op filter with one owner; it is kept as a cheap seam so isolation is already in place if the gate opens.

* **Identity Seam (not auth):** Every "who is this" question routes through a single `get_current_owner()` abstraction, which pre-gate simply returns the local owner (e.g. via a hardcoded ID or a Tailscale header). Real OAuth login is deferred post-gate (see Out of Scope); this seam is the one attachment point it will later plug into.

* **Core Timer Management:** Users must be able to create, edit, delete, view, filter, sort, pin, and manage timers.

* **Account Snapshot Import:** Users must be able to paste or upload Clash of Clans account snapshot JSON, parse timer candidates, review them, and selectively create timers.

* **Saved Views:** Users must be able to create and manage named account views that limit which accounts appear in the UI.

* **Account Tag Mapping:** The system must support mapping Clash account tags to user-friendly account names.

* **Snapshot Freshness Tracking:** The system must retain snapshot metadata and freshness thresholds so users can see how old account data is.

* **Stale Save Protection:** The system must reject stale writes from old browser tabs or devices rather than silently overwriting newer data.

* **Basic Backup and Restore Procedure:** If MariaDB is promoted, provide a simple, documented way to back up and restore the local database before it becomes operational. Scheduled offsite disaster recovery remains post-gate operations work (see Section 0.3).

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

* **Thick Client / Thin Server:** To protect the constrained host from avoidable CPU spikes, the browser will continue to handle heavy compute logic such as JSON snapshot parsing, timer math, filtering, sorting, and local UI rendering. The backend acts as a lightweight API and persistence boundary.

* **FastAPI Backend:** FastAPI is the accepted operational backend and preserves the established load/save API behavior. The PHP implementation remains available as a legacy compatibility and verification path while the transition history remains useful.

* **Protected Operational Runtime:** The operational application runs the frontend and FastAPI against JSON persistence. MariaDB may run separately as a disposable development/test service and is added to the operational runtime only after an explicit promotion decision.

* **Docker Compose Deployment:** Docker Compose provides repeatable application and test runtimes. Supporting services such as MariaDB or reverse proxying are included only in the compositions and environments that actually require them.

* **Local Containerized Simulation:** The local Windows development environment should simulate deployment constraints where practical by enforcing CPU and memory limits in `docker-compose.yaml`.

* **API Versioning Contract:** Initial API routes use simple URL-based versioning, such as `/api/v1`. Header-based versioning is deferred unless API growth justifies it later.

* **Current Frontend Modularization:** The current classic-script frontend has been incrementally decomposed behind Playwright regression coverage. This modularization is distinct from any future decision to replace the frontend technology or user interface.

* **Successor Isolation:** A normalized MariaDB store and a future frontend replacement must each be independently testable against stable contracts. Neither workstream may require the other to be completed or promoted at the same time.

---

## 4. Data Strategy

* **Operational Datastore:** JSON remains the default operational datastore until an explicit MariaDB promotion decision is made.

* **MariaDB Relational Target:** The normalized successor model will use MariaDB 10.11 unless a later decision changes the engine. User-owned records will be scoped to a tenant, fleet, or owner boundary. Global uniqueness should be avoided unless a value is truly global; most uniqueness rules should be owner-scoped compound constraints.

* **Compatibility Bridge vs. Normalized Model:** The existing Phase 3B `fleet_documents` schema and `MariaDbStore` deliberately store current API aggregates as JSON documents. They prove that MariaDB can sit behind the `FleetStore` seam, but they are not the normalized domain schema and do not imply an operational migration.

* **Configuration Durability:** Saved views, account tag mappings, snapshot freshness settings, and game object mappings should be treated as durable configuration, not disposable timer state.

* **Timer State as Operational Data:** Timers are time-sensitive operational records. A future MariaDB cutover may rebuild current timer state rather than require full legacy ETL, but the active JSON implementation remains authoritative until promotion.

* **Optimistic Concurrency:** Mutable records must include an `updated_at`, revision number, or equivalent version token. Saves from stale clients must be rejected rather than silently overwriting newer server state. This rule applies regardless of datastore.

* **Snapshot Payload Strategy:** Raw Clash account snapshots may be parsed client-side and reduced into timer candidates before persistence. Raw snapshot storage is optional and should be introduced only if it supports debugging, auditability, history, or future features. Browser-side compression should be evaluated only after measuring payload size.

* **Backup and Recovery:** Disposable schema-laboratory databases need only be reproducible from DDL and seed data. Before MariaDB is promoted, local backup and restore must be documented and rehearsed. Scheduled offsite disaster recovery remains post-gate operations work.

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

* **Backups:** Before a personal-use MariaDB cutover, local backup and restore must be proven. Scheduled offsite backups, alerting, and retention policies apply only after the strategic gate is opened.

* **Restore Testing:** A backup is not considered valid until a restore path has been tested at least once in a non-production environment.

* **Error Tracking:** Sentry or equivalent error tracking may be used for both frontend and backend errors. It should be configured with low-overhead async reporting, sampling where appropriate, and privacy scrubbing.

* **Structured Logging:** Backend logs should include request correlation IDs, authenticated tenant/user context where safe, endpoint name, response status, and error category. Logs should not include secrets or raw snapshot payloads.

---

## 7. Testing Strategy

* **Day-1 Enforcement:** Automated testing is a foundational requirement, not an afterthought. Tests should be established before structural refactoring begins.

* **Frontend E2E Testing:** Playwright will treat the legacy frontend as a black box, verifying core human user flows remain intact as the backend and frontend are refactored.

* **Frontend Unit Testing:** Unit tests should be introduced for extracted pure functions, especially snapshot parsing, timer calculations, freshness calculations, sorting, and work queue classification.

* **Backend Testing:** The FastAPI backend is tested with `pytest`. Tests must cover persistence contracts, owner scoping where implemented, stale-write rejection, input validation, and backup-sensitive behavior where practical.

* **Database Schema Testing:** MariaDB DDL must build successfully from an empty database. Tests should verify constraints, indexes, triggers, seed data, and destructive/restrictive relationship behavior independently of the operational app.

* **Parity Testing:** Any MariaDB-backed successor must run the same store contract, API contract, and browser flows as the JSON-backed baseline before promotion is considered.

* **Regression Fixtures:** Known edge cases from the existing app should be preserved as test fixtures. This includes builder counts, guardian timers, builder base queues, account tag mapping, saved views, snapshot freshness, and stale save conflicts.

* **Testing Priority:** Test the behavior users rely on first. Do not spend early effort testing implementation details likely to change during the migration.

---

## Appendix A: Migration Phases

The migration follows a staged Strangler Fig approach. Each phase changes only one major variable at a time so regressions can be isolated quickly and the existing working tool remains available throughout the transition. Completed phases become part of the protected operational baseline; unfinished successor phases remain optional and isolated.

> **Gate and promotion note (v10.5):** Phases 0–2 and Phase 5 establish the accepted FastAPI/JSON personal application. Phase 3 is pre-gate MariaDB successor work, but only Phase 3E can authorize an operational datastore cutover. Phase 4 and Phase 6 remain post-gate authentication and public-service operations work. A future frontend replacement is a separate optional successor workstream and is not coupled to MariaDB promotion. See Sections 0.3 and 0.6.

### Phase 0: Baseline the Legacy Application

> **Current status:** Substantially completed and retained as regression history.

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

> **Current status:** Substantially completed; the API contract now protects both PHP and FastAPI compatibility paths.

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

> **Current status:** Completed as the accepted operational baseline. FastAPI with JSON persistence is deployed, verified, and independently usable.

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

### Phase 3: Develop and Evaluate MariaDB Persistence

Phase 3 is an independently promotable successor workstream. Beginning or completing any subphase does not commit the operational application to leave JSON.

#### Phase 3A: Isolated MariaDB Schema Laboratory

Develop the database model without creating any dependency from the operational application.

Key activities:

* Store all DDL, triggers, indexes, and seed scripts in source control.
* Start MariaDB in a disposable local container with an isolated volume and non-production credentials.
* Prove that an empty database can be created repeatably from the DDL.
* Connect through DBeaver or another database manager for inspection and exploratory testing.
* Add representative seed data and automated tests for constraints, relationships, indexes, triggers, and history-protection rules.
* Permit the schema to be destroyed, redesigned, paused, or abandoned without affecting the operational JSON application.

Exit criteria:

* A clean database can be rebuilt from source-controlled artifacts.
* Schema tests pass independently of FastAPI and the operational application.
* The DDL and supporting documentation accurately describe the intended model.
* No operational component depends on the laboratory database.

#### Phase 3B: Compatibility-Store Proof

Prove the persistence seam while preserving the existing aggregate API payloads.

> **Current status:** Implemented as an opt-in bridge through `FleetStore`, `MariaDbStore`, and `backend/db/mariadb_schema.sql`. The current `fleet_documents` model stores API aggregates as JSON documents and is deliberately not the normalized domain model.

Key activities:

* Keep `JsonFileStore` as the operational default.
* Run the MariaDB implementation only when explicitly selected through configuration.
* Execute the same store-contract, API-contract, and browser E2E tests against both persistence implementations.
* Preserve stale-save rejection and backup behavior.
* Use the bridge to validate configuration, connectivity, transactions, error handling, container execution, and deployability.

Exit criteria:

* MariaDB can sit behind the existing persistence seam without changing the frontend contract.
* The bridge passes its contract and E2E verification.
* JSON remains independently deployable and operational.
* Documentation clearly states that the bridge is not the normalized schema or a production cutover.

#### Phase 3C: Normalized Domain Schema

Design the heavier relational model needed for long-term data management.

Key activities:

* Model accounts, timers, snapshots, timer candidates, saved views, game objects, events, event status, configuration, and required history.
* Add cheap ownership, origin, lifecycle, and concurrency seams where they clarify the model or avoid expensive future retrofits.
* Define foreign-key behavior deliberately so operational cleanup does not accidentally erase required history.
* Capture unknown game-object mappings without blocking imports.
* Record architectural decisions and rejected alternatives as the model evolves.
* Keep this schema separate from the compatibility document-store bridge unless an explicit migration plan joins them.

Exit criteria:

* The normalized DDL builds cleanly from an empty database.
* Constraints encode the agreed business rules.
* Representative use cases can be inserted, updated, queried, and rejected as expected.
* The schema is understandable and inspectable without requiring a frontend rewrite.

#### Phase 3D: Normalized FastAPI Persistence and Parity

Implement the normalized store behind stable application contracts while JSON remains the operational default.

Key activities:

* Implement repository/store operations against the normalized schema.
* Preserve the existing API contract where practical and version deliberate contract changes explicitly.
* Compare normalized MariaDB behavior against the JSON reference implementation.
* Run backend contract tests and browser E2E tests against the normalized store.
* Keep schema design, backend integration, migration tooling, and frontend work in separate commits and work packages.

Exit criteria:

* Critical API and user flows pass against normalized MariaDB.
* Stale writes are rejected rather than silently overwriting newer data.
* Failures do not affect the operational JSON environment.
* Remaining parity differences are documented and intentionally accepted or resolved.

#### Phase 3E: Migration Rehearsal and Explicit Promotion Decision

This is the technical promotion boundary between the protected JSON baseline and a MariaDB-backed operational application. Promotion is optional; remaining on JSON is a valid outcome.

Key activities:

* Rehearse representative data conversion into an isolated MariaDB environment.
* Verify backup, restore, rollback, and clean-rebuild procedures.
* Test the complete deployment flow using the exact image and schema artifacts intended for promotion.
* Confirm user-visible parity and document any intentionally changed behavior.
* Evaluate whether MariaDB provides enough practical benefit to justify additional operational complexity.
* Make an explicit go/no-go decision. Do not infer approval from completed development work.

Promotion criteria:

* The schema and migration are repeatable from source control.
* Contract, parity, and browser tests pass.
* Backup, restore, and rollback have been rehearsed.
* The current JSON application remains available as a tested rollback path for the agreed transition window.
* The decision record explicitly approves MariaDB as the new operational datastore.

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

### Phase 5: Incrementally Modularize the Current Frontend

> **Current status:** Substantially completed using classic browser scripts, explicit load order, behavior-preserving extraction, and Playwright regression coverage.

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

#### Phase 5B: Optional Future Frontend Replacement

A future frontend rewrite is a separate successor workstream, not a continuation that must begin after modularization and not a prerequisite for MariaDB work.

Key activities:

* Define the stable API contract the replacement frontend will consume.
* Recreate critical user flows behind automated acceptance tests.
* Keep the current frontend operational until the replacement demonstrates sufficient parity and usability.
* Avoid coupling the rewrite to normalized schema development, persistence cutover, or public-service authentication.
* Make a separate promotion decision when the replacement has earned confidence.

Exit criteria:

* The replacement can run against an approved API without direct knowledge of datastore implementation.
* Critical user flows pass independently of the current frontend.
* The existing frontend remains a viable fallback until an explicit promotion decision.

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

> **Scope note (v10.5):** A disposable schema-laboratory database is recreated from DDL and seed data rather than treated as operational data. Before any personal-use MariaDB promotion, local backup, restore, and rollback must be rehearsed. The scheduled offsite requirements below apply after the strategic public-service gate is opened.

### Backup Requirements

A post-gate production MariaDB database must be backed up automatically on a schedule.

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

### Backend and Database Test Cases

Backend and database tests should cover:

* Rebuilding each MariaDB schema from an empty database.
* Enforcing required constraints, indexes, foreign-key behavior, and trigger rules.
* Running the persistence contract against JSON and each MariaDB implementation.
* Creating and loading owner-scoped timers where the normalized model applies.
* Preventing cross-owner reads and writes where ownership is implemented.
* Rejecting stale saves.
* Saving and loading saved views.
* Saving and loading account tag mappings.
* Validating malformed payloads.
* Ensuring backup-sensitive operations do not silently fail.
* Preserving critical browser behavior across datastore implementations.

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
| MariaDB operational promotion | No decision until Phase 3E | Completing DDL or a store implementation does not authorize cutover. Remaining on JSON is valid. |
| Normalized schema scope | Develop iteratively in Phase 3C | Keep the current document-store bridge distinct from the normalized domain model. |
| Future frontend replacement | Optional and independently promotable | It must consume a stable API and must not be coupled to MariaDB cutover. |

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
* Optional replacement frontend technology and migration.

## Appendix H: AI-Assisted Development Governance

This appendix defines how AI should be used during the development of Clash Fleet Manager.

The purpose is not to slow development down. The purpose is to keep AI-generated work small, reviewable, testable, and aligned with the architecture described in this document.

AI is useful on this project because it can generate code, explain unfamiliar implementation details, propose edge cases, create tests, and help reason through tradeoffs. The risk is that AI can also produce too much plausible code too quickly. That risk is managed through scope control, branch discipline, acceptance criteria, regression tests, and human review.

The operating model is:

> **AI generates. The user governs. AI explains. The user challenges. AI tests. The user accepts or rejects.**

### H.1 Roles and responsibilities

The user remains the Product Owner, Architect, Project Manager, and Lead Tester.

AI may act as:

* Implementation assistant.
* Code reviewer.
* Test writer.
* Checklist generator.
* Debugging partner.
* Architecture challenger.
* Documentation assistant.

AI does **not** own the architecture, scope, merge decision, deployment decision, or acceptance decision.

The user is responsible for:

* Defining the actual problem.
* Keeping the project aligned to the personal-app-first strategy.
* Deciding whether a change belongs before or after the gate.
* Approving scope.
* Reviewing diffs.
* Running or reviewing tests.
* Deciding whether a branch is safe to merge.
* Tagging known-good milestones before risky work.

### H.2 Core governance principle

Every AI-assisted change must obey the same rule used throughout the architecture:

> **Keep cheap seams. Defer expensive builds.**

For AI development work, this means:

* Small, well-scoped changes are preferred over broad rewrites.
* Refactors must preserve behavior unless behavior change is explicitly requested.
* Feature work and cleanup work should not be mixed in the same change.
* Production-only concerns should not be introduced before the gate unless they are cheap seams or directly improve the personal app.
* The current working behavior of the app is more important than architectural elegance.

When in doubt, choose the change that is easier to review, easier to test, and easier to roll back.

### H.3 Standard session packet

Each coding session should begin with a clear packet of context.

A good AI request should include:

* Current branch name.
* Current goal.
* File or files allowed to change.
* Files that must not change.
* Behavior that must remain unchanged.
* Whether the task is a feature, bug fix, refactor, test addition, or documentation update.
* Relevant acceptance criteria.
* Relevant screenshots, test output, or current behavior notes.
* Whether the change is pre-gate or post-gate.
* Whether the change touches timer logic, freshness logic, snapshot logic, saved-view logic, API behavior, persistence, or mobile layout.

For complex work, ask for the intended approach before code is changed.

For small surgical fixes, AI may go directly to the patch, but the final explanation must still describe what changed and why.

### H.4 Scope control rules

AI must be explicitly constrained.

A standard instruction for code changes is:

```text
This is a scoped change. Do not rewrite unrelated code. Do not optimize unrelated areas. Do not change timer logic unless explicitly required. Keep the diff small and explain exactly which functions changed and why. Provide manual test steps and edge cases before I merge this.
```

Additional scope rules:

* Do not perform opportunistic cleanup.
* Do not rename functions, files, or variables unless required by the task.
* Do not change formatting across a large file just because nearby code is being edited.
* Do not combine feature work with refactoring.
* Do not combine backend changes with frontend changes unless the task requires both.
* Do not change API contracts without explicitly calling that out.
* Do not change data shape, persistence behavior, or concurrency behavior without explicit approval.
* Do not remove legacy fallback behavior unless the replacement path is already tested.
* Do not introduce a new dependency without explaining why it is necessary.

The preferred unit of work is:

> **One branch, one coherent idea, one reviewable diff.**

### H.5 Change categories

AI-assisted work should be classified before implementation.

#### Feature change

A feature change adds or changes user-visible behavior.

Required before implementation:

* User problem statement.
* Acceptance criteria.
* Expected UI behavior.
* Impacted workflows.
* Manual test steps.

Feature changes must not include unrelated refactoring.

#### Bug fix

A bug fix corrects behavior that is currently wrong.

Required before implementation:

* Current behavior.
* Expected behavior.
* Likely cause, if known.
* Smallest safe change.
* Regression test or manual test.

Bug fixes should preserve unrelated behavior, even if the nearby code could be improved.

#### Refactor

A refactor changes structure without intentional behavior change.

Required before implementation:

* Known-good baseline.
* Tests or manual checklist covering the affected behavior.
* Clear extraction target.
* Confirmation that no user-visible behavior is intended to change.

Refactor rules:

* Move code before improving code.
* Extract one concern at a time.
* Keep diffs dominated by moved code, not rewritten logic.
* Avoid refactoring timer rendering, snapshot parsing, saved views, and freshness logic in the same commit.
* Stop and reassess if the diff becomes hard to explain.

#### Test addition

A test addition improves confidence without changing product behavior.

Required before implementation:

* Behavior being protected.
* User flow or edge case being tested.
* Whether the test is Playwright, backend, unit, or manual checklist coverage.

Tests should focus first on behavior the user actually relies on, not implementation details likely to change during migration.

#### Documentation change

A documentation change updates architecture, design rationale, usage notes, or commit/session guidance.

Required before implementation:

* Target document or section.
* Whether the change reflects an accepted decision or a proposed idea.
* Whether the wording should be prescriptive, advisory, or historical.

Documentation should not silently change scope.

### H.6 High-risk areas

The following areas require extra caution because regressions are easy to miss:

* Timer creation, editing, deletion, pinning, sorting, and filtering.
* Snapshot import and staged timer creation.
* Replacement of account timers while preserving manually noted timers.
* Saved views and account focus filtering.
* Snapshot freshness thresholds and age indicators.
* Account tag mapping.
* Builder, lab, pet, equipment, builder base, helper, and guardian timer classification.
* Stale-save protection and overwrite prevention.
* API payload shapes.
* MariaDB persistence and schema migration behavior.
* Owner or tenant scoping.
* Mobile layout, modal scrolling, and floating action buttons.

Any AI-generated change touching one of these areas must explicitly say so in the final explanation.

### H.7 Diff review checklist

Before merging AI-generated code, review the diff using this checklist:

* Does the diff only touch the files expected?
* Does the change match the stated goal?
* Is there unrelated cleanup?
* Did AI modify timer logic?
* Did AI modify freshness logic?
* Did AI modify snapshot parsing or import behavior?
* Did AI modify saved-view filtering?
* Did AI modify API payload shape or persistence behavior?
* Did AI modify stale-save or concurrency logic?
* Did AI modify mobile layout or modal behavior?
* Are the changes explainable in plain English?
* Are edge cases addressed?
* Are tests or manual verification steps provided?
* Is the change small enough to roll back safely?

If the answer to any of these questions is unclear, the change should not be merged until clarified.

### H.8 Testing expectations

Testing is part of the change, not a separate afterthought.

For frontend behavior, Playwright should protect the core user flows before major refactoring continues.

Priority Playwright coverage includes:

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
* Handling stale-save conflicts.

For backend behavior, tests should protect:

* Persistence.
* Owner-scoped queries.
* Stale-write rejection.
* Input validation.
* Malformed payload handling.
* Backup-sensitive operations.
* Cross-owner or cross-tenant access prevention where applicable.

Manual testing remains acceptable for areas not yet automated, but manual test steps should be written down before merge.

### H.9 Branch, commit, and tag discipline

Development should use Git as the source of truth.

Preferred workflow:

1. Start from a clean `main`.
2. Create a focused branch for the work package.
3. Make the smallest coherent change.
4. Run the relevant tests.
5. Review the diff carefully.
6. Commit one coherent idea.
7. Merge only after the behavior is accepted.
8. Tag known-good states before risky refactors, migrations, or squash merges.

Commit messages should explain:

* What changed.
* Why it changed.
* What behavior was preserved.
* Any important testing performed.
* Any known limitations or follow-up work.

For risky branches, preserve a tag or backup reference before rewriting history, squashing, or deleting the branch.

### H.10 Acceptance criteria and Definition of Done

Every non-trivial work item should have acceptance criteria before code is changed.

Acceptance criteria should describe observable behavior, not implementation preference.

Example:

```text
Acceptance criteria:
- Existing timers still load.
- Saved views still filter the timer list, account pills, and summary areas.
- Snapshot import still stages candidate timers for review.
- Replacing account timers still preserves manually noted timers.
- Stale saves are rejected with a clear user-facing message.
- Mobile layout remains usable in a narrow viewport.
```

A standard Definition of Done for AI-assisted changes:

* Scope stayed within the requested change.
* Diff was reviewed.
* Relevant tests passed.
* Manual test steps were completed where automated coverage does not exist.
* No unrelated behavior changed.
* No sensitive data was logged.
* No new dependency was added without approval.
* Documentation or comments were updated only where useful.
* Commit message accurately describes the change.

### H.11 Prompt templates

#### Small bug fix

```text
Please make a surgical fix for this bug.

Current behavior:
[describe current behavior]

Expected behavior:
[describe expected behavior]

Allowed files:
[list files]

Do not change:
[list protected behavior]

Please keep the diff small, explain the exact cause, and provide manual test steps.
```

#### Feature change

```text
Please implement this feature as a scoped change.

Goal:
[describe user-facing goal]

Acceptance criteria:
[list criteria]

Allowed files:
[list files]

Do not change:
[list protected behavior]

Please identify whether this touches timer logic, freshness logic, snapshot logic, saved-view logic, API behavior, persistence, or mobile layout.
```

#### Refactor

```text
Please refactor this one concern only.

Goal:
[describe extraction or restructuring goal]

Behavior must remain unchanged.

Allowed files:
[list files]

Do not:
- Add features
- Change API contracts
- Change data shape
- Change timer behavior
- Change snapshot behavior
- Change saved-view behavior
- Change freshness behavior

Please explain how the diff preserves behavior and provide regression test steps.
```

#### Test addition

```text
Please add test coverage for this behavior.

Behavior to protect:
[describe behavior]

Test type:
[Playwright/backend/unit/manual checklist]

Do not change product behavior.

Please keep test comments light but useful, focusing on intent rather than obvious mechanics.
```

### H.12 When to stop and reassess

An AI-assisted change should pause for reassessment when:

* The diff becomes larger than expected.
* More files are touched than expected.
* AI proposes a new dependency.
* A feature change turns into a refactor.
* A refactor requires behavior changes.
* The API contract needs to change.
* The data model needs to change.
* A test failure reveals unclear expected behavior.
* The implementation starts solving a future post-gate problem instead of the current personal-app problem.

Stopping is not failure. It is the mechanism that keeps the project from drifting into unmanaged code generation.

### H.13 Final rule

The project succeeds by remaining understandable.

The best AI-assisted change is not the cleverest change. It is the change that solves the real problem, preserves known behavior, produces a reviewable diff, and leaves the app easier to trust than before.

> **Keep the stack boring. Keep the changes small. Keep the AI constrained. Keep the tests explicit. Refactor for reviewability before hardening for production.**
