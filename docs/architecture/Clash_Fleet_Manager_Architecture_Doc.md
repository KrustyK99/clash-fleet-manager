# Architecture & Migration Design Doc: Clash Fleet Manager v6

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
