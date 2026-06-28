# Architecture & Migration Design Doc: Clash Fleet Manager

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

---

## 4. Current State (End of Stage 1)
* The legacy `api.php` file has been fully deprecated and deleted.
* The monolithic `index.html` frontend has been successfully rewired to route `fetch()` calls to `localhost:8000` (FastAPI).
* The system is fully stable, with Python acting as a 1-to-1 proxy for the flat JSON file datastore.
* **Next Phase:** Database Integration. Rewiring the internal logic of the Python API endpoints to read/write from the running MariaDB container instead of the flat `timers.json` file.
