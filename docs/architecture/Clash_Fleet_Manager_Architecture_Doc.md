# Architecture & Migration Design Doc: Clash Fleet Manager v8

## 1. Project Overview
**Goal:** Migrate a legacy monolithic Clash of Clans fleet management tool (HTML/JS frontend, `api.php` backend, `timers.json` flat-file datastore) to a modern, containerized stack (Python/FastAPI backend, MariaDB relational database).
**Migration Strategy:** Strangler Fig Pattern. The migration is being done iteratively to ensure continuous system stability, isolating variables at each step to prevent cascading debugging failures.

---

## 2. Target Production Environment
* **Host:** DigitalOcean Droplet (Linux-based)
* **Constraints:** $12/month tier (0.5 vCPU, 1GB RAM)
* **Orchestration:** Docker Compose

---

## 3. Key Architectural Decisions & Rationale

### Decision 1: Local Containerized Simulation (Docker Compose)
* **What:** The local development environment uses Docker Desktop (via WSL2 on Windows) to spin up a strict Linux-based Droplet simulator.
* **Rationale:** "It works on my machine" syndrome is a massive risk during migrations. By explicitly setting `cpus: '0.5'` and `memory: 1G` in the `docker-compose.yaml` for both the `db` (MariaDB 10.11) and `api` (Python 3.11-slim) services, the local Windows laptop perfectly mimics the constrained production environment.

### Decision 2: Monorepo Structure
* **What:** The new Python `backend/` directory, database volumes, and `docker-compose.yaml` are integrated directly into the root of the existing legacy Git repository, sitting right next to the monolithic `index.html` and legacy `data/` folder.
* **Rationale:** **Atomic Commits.** During a Strangler Fig migration, frontend API URL changes (`fetch()`) and new backend endpoints must be perfectly synchronized. A monorepo ensures that if a deployment breaks, a single Git revert rolls back both the frontend routing and the backend logic simultaneously. 

### Decision 3: The "Inner Dev Loop" (Volume Mapping & Hot-Reloading)
* **What:** The `docker-compose.yaml` maps the local Windows `./backend` folder to the container's `/app` directory, and the FastAPI Uvicorn server is booted with the `--reload` flag.
* **Rationale:** Frictionless development. Modifying Python code on the Windows host instantly triggers a graceful restart of the Uvicorn server inside the isolated Linux container. This eliminates the need to rebuild Docker images for every code change, keeping the iteration cycle under 2 seconds.

### Decision 4: The "Imposter API" (Isolation of Variables)
* **What:** Stage 1 of the migration involves writing a Python FastAPI backend that does *nothing* but exactly mimic the legacy `api.php` file—reading and writing directly to the existing `timers.json` flat file via a volume mount (`./data:/app/data`).
* **Rationale:** Risk mitigation. By swapping the language (PHP to Python) *before* swapping the datastore (JSON to MariaDB), variables are isolated. If the frontend fails to load, it is definitively a CORS issue, a network routing issue, or a JSON parsing issue in FastAPI, rather than a malformed SQL query. 

### Decision 5: Strict Git Hygiene
* **What:** A `.gitignore` file enforces the exclusion of the `mysql_data/` directory and Python `__pycache__/` directories.
* **Rationale:** Prevents catastrophic repository bloat. Relational databases constantly mutate binary files; committing these would rapidly bloat the Git history with gigabytes of unmergeable noise.

### Decision 6: Thick Client / Thin Server Architecture
* **What:** The `index.html` frontend handles all heavy compute logic—including parsing the massive Clash of Clans JSON snapshots, timer math, sorting, and UI state management. The FastAPI backend remains deliberately "dumb," acting primarily as a lightweight router to shuffle data in and out of the database.
* **Rationale:** The target Droplet is severely resource-constrained (0.5 vCPU, 1GB RAM). By offloading the compute-heavy tasks to the user's browser, we protect the server from CPU spikes and memory exhaustion, ensuring the API remains fast, stable, and highly concurrent under load.

### Decision 7: Client-Side JSON Compression
* **What:** Before sending the in-game Clash of Clans snapshot payloads to the API, the browser frontend will compress the JSON data. The MariaDB database will store these payloads in their compressed format rather than as raw, uncompressed text.
* **Rationale:** Raw JSON is incredibly verbose. Sending and storing uncompressed text would unnecessarily consume network bandwidth, aggressively bloat the database, and waste the Droplet's limited disk space and memory buffer pool. Compressing it client-side drastically reduces infrastructure costs and disk I/O.

### Decision 8: Multi-Tenant Architecture
* **What:** The end-state application will be a multi-tenant SaaS. The database schema and backend queries will be designed to strictly isolate data by a `user_id` foreign key. Global unique constraints (e.g., account names) will be converted to tenant-scoped compound constraints (e.g., `user_id` + `account_name`).
* **Rationale:** To transition the project from a personal, single-user utility into a scalable SaaS product. Building tenant isolation directly into the foundational SQL schema and API routing now prevents a massive, high-risk refactor later in the development lifecycle.

### Decision 9: Day-1 Automated Testing
* **What:** Automated testing will be integrated across both tracks from the very beginning. We will use `pytest` for the Python backend, and an End-to-End (E2E) framework like **Playwright** for the frontend, eventually introducing **Vitest/Jest** as the UI becomes modular.
* **Rationale:** Retrofitting tests into a complex application is difficult and often gets skipped. By mandating a test-driven foundation from day 1, we establish a continuous safety net. For the frontend monolith, E2E tests act as a "black box" verifying exact user flows *before* refactoring begins. As we modularize `index.html` and build the multi-tenant backend, this combined testing suite guarantees that new features and structural changes do not silently break existing architecture.

### Decision 10: Security & Authentication Posture
* **What:** Authentication will be handled via OAuth (Discord and Google) to offload password liability. Session management will use stateless JSON Web Tokens (JWTs) stored in the thick client. The API will be protected by strict IP and user-based Rate Limiting (e.g., `slowapi`).
* **Rationale:** Building and maintaining password reset flows is a liability and time sink. OAuth provides frictionless login. JWTs eliminate the need for the database to verify sessions on every request, saving compute and memory. Rate limiting ensures the constrained $12 Droplet cannot be taken down by abuse or infinite loops.

### Decision 11: Data Migration Strategy (The Clean Slate)
* **What:** We will not migrate the legacy `timers.json` flat file. On launch, the database will start empty. Users will rebuild their active timers organically using the application's existing in-game JSON snapshot parsing feature.
* **Rationale:** Writing, testing, and debugging one-off ETL (Extract, Transform, Load) scripts to migrate legacy personal data into a multi-tenant schema is a low-ROI effort. Since users can rebuild their state in ~20 minutes via the snapshot tool, a "Clean Slate" approach saves hours of engineering time and keeps the new backend 100% free of legacy tech debt.

### Decision 12: Deployment Strategy (Manual First)
* **What:** Initial deployments to the DigitalOcean Droplet will be executed manually via SSH, running `git pull` followed by `docker compose up -d --build`. Automated CI/CD (e.g., GitHub Actions) is explicitly deferred.
* **Rationale:** Introducing automated deployment pipelines introduces finicky DevOps variables (SSH keys, YAML formatting, known_hosts bypassing). By deploying manually, we eliminate deployment orchestration as a point of failure while the new architecture stabilizes. CI/CD will be implemented only after the core application is stable and manual deployments become a bottleneck.

### Decision 13: Disaster Recovery & Backups
* **What:** Database backups will be handled via a nightly cron job running `mysqldump` to export the MariaDB data, compress it, and push it to secure offsite object storage (e.g., DigitalOcean Spaces or AWS S3).
* **Rationale:** Full infrastructure-level snapshots are "all-or-nothing" and make restoring a single tenant's data impossible. Nightly SQL dumps provide surgical recovery flexibility, protect against accidental table drops, and are extremely cost-effective.

### Decision 14: Configuration & Secrets Management
* **What:** All sensitive data (database credentials, OAuth secrets, JWT signing keys) will be managed via local `.env` files injected into the Docker containers at runtime. The `.env` files are strictly added to `.gitignore`.
* **Rationale:** Managed secret vaults are premature optimization for a single Droplet. A `.env` file paired with standard Linux Droplet hardening (key-based SSH, UFW firewall) provides robust security with zero added latency or cost.

### Decision 15: Observability & Error Tracking
* **What:** Sentry (Free Tier) will be integrated into both the Python API and the Javascript frontend to catch unhandled exceptions.
* **Rationale:** Basic Docker logs are reactive and blind. Sentry provides proactive, instant alerts with full stack traces. Because delivery is asynchronous and UI errors are offloaded to the user's browser, the performance hit on the $12 Droplet is negligible.

### Decision 16: API Versioning Contract
* **What:** The initial release (v1) will use simple routing without strict versioning overhead. The documented end-state goal is to migrate to Header-Based Versioning (e.g., `Accept-Version: v2`) as the API matures.
* **Rationale:** A pragmatic MVP approach. The early adopter user base is small enough to tolerate simple URL updates. Transitioning to header-based versioning later ensures API URLs remain clean forever while protecting older thick clients from breaking response payload changes.

---

## 4. Execution Strategy: Parallel Tracks
To efficiently execute the Strangler Fig migration moving forward, the project is structurally divided into two high-level, concurrent tracks of work:
* **Track 1: Backend Infrastructure:** Establishing the containerized environment, implementing the multi-tenant MariaDB database, and building the Python/FastAPI backend to replace the temporary Imposter API.
* **Track 2: Frontend Refactoring:** Deconstructing and modernizing the 7,000-line monolithic `index.html` file into maintainable, modular components while preserving its "thick client" responsibilities.

---

## 5. Current State (End of Stage 1)
* The legacy `api.php` file has been fully deprecated and deleted.
* The monolithic `index.html` frontend has been successfully rewired to route `fetch()` calls to `localhost:8000` (FastAPI).
* The system is fully stable, with Python acting as a 1-to-1 proxy for the flat JSON file datastore.
* **Next Phase:** Database Integration. Modifying the draft MariaDB schema for multi-tenancy, then rewiring the internal logic of the Python API endpoints to read/write from the running database container instead of the flat `timers.json` file.
