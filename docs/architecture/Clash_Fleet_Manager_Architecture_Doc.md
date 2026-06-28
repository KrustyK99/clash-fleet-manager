# Technical Design Document: Clash Fleet Manager
**Version:** 9.0 (Standardized TDD Format)
**Status:** Approved for Implementation

---

## 1. Context & Scope
**Overview:** The project is a migration of a legacy, monolithic Clash of Clans fleet management tool (HTML/JS frontend, `api.php` backend, `timers.json` flat-file datastore) into a modern, multi-tenant SaaS application.
**Migration Strategy:** The "Strangler Fig" pattern. Migration will occur iteratively to ensure continuous system stability, isolating variables at each step (e.g., swapping language before datastore) to prevent cascading debugging failures.
**Target Environment:** A constrained DigitalOcean Droplet ($12/month tier: 0.5 vCPU, 1GB RAM) orchestrated via Docker Compose.

---

## 2. Goals & Non-Goals
### Goals
* **Multi-Tenant SaaS:** Transition the tool from a single-user personal utility into a secure, isolated SaaS platform.
* **Frictionless Development:** Maintain an "Inner Dev Loop" of under 2 seconds using a monorepo structure, Docker volume mapping, and Uvicorn hot-reloading.
* **Resource Preservation:** Architect the system to run efficiently on highly constrained hardware.

### Non-Goals (Out of Scope)
* **Automated CI/CD:** We are explicitly deferring GitHub Actions or automated pipelines for Day 1. Deployments will be handled manually to reduce DevOps variables during early stabilization.
* **Legacy Data Migration:** We are not building ETL scripts to migrate the existing `timers.json`. We will use a "Clean Slate" approach where users rebuild state via the app's JSON snapshot parsing feature.
* **Enterprise Secrets Vault:** We are not integrating HashiCorp Vault or AWS Secrets Manager. Standard `.env` files and Droplet hardening provide sufficient security.

---

## 3. System Architecture
* **Thick Client / Thin Server:** To protect the 0.5 vCPU Droplet from CPU spikes, the `index.html` frontend will handle all heavy compute logic (JSON snapshot parsing, timer math, sorting). The Python/FastAPI backend will act strictly as a lightweight data router.
* **Local Containerized Simulation:** The local Windows development environment (via Docker Desktop/WSL2) will strictly simulate production constraints by enforcing `cpus: '0.5'` and `memory: 1G` in the `docker-compose.yaml`.
* **API Versioning Contract:** The initial release will utilize simple URL routing (v1). As the user base grows and the API stabilizes, the system will migrate to Header-Based Versioning (e.g., `Accept-Version: v2`) to keep URLs clean and protect older thick clients.

---

## 4. Data Strategy
* **Relational Multi-Tenancy:** The backend will utilize MariaDB 10.11. All database schemas and queries will strictly isolate data using a `user_id` foreign key, converting global unique constraints into tenant-scoped compound constraints.
* **Client-Side JSON Compression:** To minimize network bandwidth, API latency, and database storage overhead, massive in-game JSON payloads will be compressed by the browser *before* being transmitted to the backend.
* **Disaster Recovery:** A nightly cron job will execute `mysqldump` to export the MariaDB data, compress it, and push it to secure offsite object storage (e.g., DigitalOcean Spaces or S3) to ensure surgical data recovery options.

---

## 5. Security & Authentication Posture
* **Authentication (OAuth):** Login will be handled exclusively via Discord and Google OAuth. This provides frictionless onboarding while entirely offloading the liability of password management and reset flows.
* **Session Management (JWT):** The API will remain stateless. Authentication will be verified via JSON Web Tokens (JWTs) stored in the thick client, saving the database from querying sessions on every request.
* **Droplet Protection (Rate Limiting):** The application will implement strict IP and user-based rate limiting (via `slowapi`) to ensure the server cannot be exhausted by malicious bots or infinite UI loops.

---

## 6. Operations & Observability
* **Deployment Pipeline:** Initial deployments will execute manually via SSH (`git pull` -> `docker compose up -d --build`). 
* **Secrets Management:** All sensitive credentials will be injected into Docker containers at runtime via `.env` files, which are strictly managed by `.gitignore` rules.
* **Error Tracking:** Sentry (Free Tier) will be integrated into both the JS frontend and Python backend. Its asynchronous delivery mechanisms ensure instant Slack/Discord alerts for unhandled exceptions with zero performance penalty to the host Droplet.

---

## 7. Testing Strategy
* **Day-1 Enforcement:** Automated testing is a foundational requirement, not an afterthought, establishing a safety net before structural refactoring begins.
* **Frontend (E2E):** An End-to-End framework (Playwright) will treat the legacy `index.html` monolith as a "black box," verifying human user flows remain intact as the DOM is refactored. Component testing (Vitest/Jest) will be introduced as the UI becomes modular.
* **Backend:** The Python API will be continuously tested using `pytest` to ensure database reads/writes and multi-tenant scoping function as expected.
