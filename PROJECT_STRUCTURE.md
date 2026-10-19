# CineVote — Repository Structure

```
2526-pe2-HanneloreRamakersPXL/
│
├── ansible/                         ← ALL Ansible automation lives here
│   ├── ansible.cfg                  ← Ansible settings (inventory, callbacks, SSH)
│   ├── site.yml                     ← Main deployment playbook (one command)
│   ├── requirements.yml             ← Collection dependencies (ansible.posix, community.general)
│   │
│   ├── inventories/
│   │   └── local/                   ← Local Vagrant environment inventory
│   │       ├── hosts.yml            ← 3-tier host definitions (10.10.0.10/20/30)
│   │       └── group_vars/
│   │           ├── all/
│   │           │   ├── vars.yml     ← Shared variables (IPs, ports, paths, secret refs)
│   │           │   └── vault.yml    ← Vault-managed secrets (encrypt for production)
│   │           ├── frontend.yml     ← Frontend-specific variables (Nginx paths)
│   │           ├── backend.yml      ← Backend-specific variables (service name, log dir)
│   │           └── storage.yml      ← Storage-specific variables (PG version, tuning)
│   │
│   ├── roles/
│   │   ├── common/                  ← Applied to ALL tiers
│   │   │   ├── defaults/main.yml    ← Common packages list, timezone
│   │   │   ├── tasks/main.yml       ← DNF cache, packages, firewalld, timezone
│   │   │   └── handlers/main.yml    ← (empty — no common handlers)
│   │   │
│   │   ├── storage/                 ← PostgreSQL 14 tier
│   │   │   ├── defaults/main.yml    ← PG version, data dir, tuning defaults
│   │   │   ├── tasks/
│   │   │   │   ├── main.yml         ← Orchestrates sub-tasks in order
│   │   │   │   ├── install.yml      ← PGDG repo, packages, initdb, firewall
│   │   │   │   ├── configure.yml    ← pg_hba.conf template, postgresql.conf settings
│   │   │   │   ├── database.yml     ← Idempotent user + database creation
│   │   │   │   ├── migrations.yml   ← Migration tracking table + apply loop
│   │   │   │   ├── apply_migration.yml ← Per-migration include (skip if applied)
│   │   │   │   └── healthcheck.yml  ← Verify service + query schema_migrations
│   │   │   ├── handlers/main.yml    ← Reload/restart postgresql-14
│   │   │   └── templates/
│   │   │       └── pg_hba.conf.j2   ← Client auth rules (peer + backend IP md5)
│   │   │
│   │   ├── backend/                 ← Node.js / Express API tier
│   │   │   ├── defaults/main.yml    ← Service name, log dir, node version
│   │   │   ├── tasks/
│   │   │   │   ├── main.yml         ← Orchestrates sub-tasks in order
│   │   │   │   ├── install.yml      ← NodeSource repo, Node.js, app user, dirs, SELinux port
│   │   │   │   ├── deploy.yml       ← rsync storage+backend source, npm install, tsc build
│   │   │   │   ├── configure.yml    ← .env template (Vault secrets injected)
│   │   │   │   ├── service.yml      ← systemd unit template, enable+start
│   │   │   │   └── healthcheck.yml  ← Poll /api/health until db=connected
│   │   │   ├── handlers/main.yml    ← Restart cinevote-backend (on code/config change)
│   │   │   └── templates/
│   │   │       ├── backend.env.j2              ← Runtime environment file
│   │   │       └── cinevote-backend.service.j2 ← systemd unit
│   │   │
│   │   ├── frontend/                ← Nginx + React SPA tier
│   │   │   ├── defaults/main.yml    ← Nginx conf path, webroot, nginx user
│   │   │   ├── tasks/
│   │   │   │   ├── main.yml         ← Orchestrates sub-tasks in order
│   │   │   │   ├── install.yml      ← Nginx, webroot dir, firewall, SELinux boolean
│   │   │   │   ├── build.yml        ← npm ci + npm run build (delegated to localhost)
│   │   │   │   ├── deploy.yml       ← rsync dist/, Nginx config template, validation
│   │   │   │   └── healthcheck.yml  ← Poll /health, assert JSON status=ok
│   │   │   ├── handlers/main.yml    ← Reload/restart nginx
│   │   │   └── templates/
│   │   │       └── nginx.conf.j2    ← /health + /api/ proxy + /socket.io/ proxy
│   │   │
│   │   └── logging/                 ← EXTRA3: central rsyslog logging
│   │       ├── defaults/main.yml    ← log_server_ip, rsyslog_port, cinevote_log_dir
│   │       ├── tasks/
│   │       │   ├── main.yml         ← installs rsyslog; branches server vs client
│   │       │   ├── server.yml       ← frontend: TCP receiver config + firewall rules
│   │       │   └── client.yml       ← backend + storage: TCP forwarding config
│   │       ├── handlers/main.yml    ← Restart rsyslog (on config change)
│   │       └── templates/
│   │           ├── cinevote-server.conf.j2  ← imtcp receiver, per-host DynaFile
│   │           └── cinevote-forward.conf.j2 ← @@log_server_ip:514 (TCP forward)
│   │
│   └── vault/
│       └── README.md                ← How to encrypt vault for production
│
├── backend/                         ← Node.js + Express API source
│   ├── src/
│   │   ├── app.ts                   ← Express app, CORS, route registration
│   │   ├── index.ts                 ← Server entry point (Express + Socket.io)
│   │   ├── routes/                  ← API endpoints (/api/health, /api/auth, ...)
│   │   ├── services/                ← Business logic (auth, state-machine, TMDB, ...)
│   │   ├── middleware/              ← request-logger, error-handler, security
│   │   ├── config/                  ← Environment config
│   │   └── types/                   ← TypeScript interfaces
│   └── package.json                 ← cinevote-backend; depends on @cinevote/storage
│
├── frontend/                        ← React + TypeScript SPA
│   ├── src/
│   │   ├── App.tsx                  ← Root component + React Router
│   │   ├── pages/                   ← Route-level page components
│   │   ├── components/              ← Shared UI components
│   │   ├── services/
│   │   │   ├── api.ts               ← Axios client (baseURL: VITE_API_BASE_URL || '/api')
│   │   │   └── socket.ts            ← Socket.io client ('' = same origin in production)
│   │   └── contexts/                ← AuthContext
│   ├── dist/                        ← Built output (created by npm run build)
│   └── package.json                 ← cinevote-frontend; built by Ansible on control machine
│
├── storage/                         ← PostgreSQL schema + TypeScript query layer
│   ├── migrations/
│   │   ├── 001_init.sql             ← Core schema (groups, members, rounds, ...)
│   │   ├── 002_add_state_transition_log.sql
│   │   ├── 003_add_version_column.sql
│   │   ├── 004_replace_ratings_table.sql
│   │   ├── 005_add_max_members.sql
│   │   ├── 006_add_users.sql
│   │   ├── 007_remove_display_name.sql
│   │   ├── 008_add_watched_at.sql
│   │   ├── 009_fix_state_log_cascade.sql
│   │   └── 010_add_cancelled_watched_enum.sql
│   └── package.json                 ← @cinevote/storage (file: dep in backend)
│
├── local-deploy/                    ← Vagrant VM definitions only
│   ├── Vagrantfile                  ← 3 VMs: frontend/backend/storage (AlmaLinux 9)
│   ├── playbook.yml                 ← Stub redirecting to ansible/ directory
│   ├── inventory.ini                ← Legacy flat inventory (superseded by ansible/)
│   ├── ansible.cfg                  ← Legacy Ansible config (superseded by ansible/)
│   ├── clean_known_hosts.sh         ← SSH key cleanup after VM recreate
│   └── nuke_all_vagrant.sh          ← Destroy all Vagrant environments
│
├── provisioning/                    ← AWS extra (optional)
│   ├── provision_pe2_nat_bastion.sh ← Create EC2 infra (VPC, subnets, NAT gateway)
│   ├── teardown_pe2_nat_bastion.sh  ← Destroy AWS infra
│   └── PE2_PROVISIONING_QUICK_START.md
│
├── PROJECT_README.md                ← Deployment guide (this repo)
├── PROJECT_STRUCTURE.md             ← Repo structure explanation (this file)
└── README.md                        ← Assignment specification
```

---

## Ansible Role Responsibilities

### `common`
Applied to every VM. Installs baseline packages (`curl`, `git`, `rsync`,
`firewalld`, `policycoreutils-python-utils`), sets timezone, and ensures
`firewalld` is running.

### `storage`
Manages the PostgreSQL 14 tier on the storage VM (`10.10.0.30`):
- Adds the official PGDG repository and installs `postgresql14-server`
- Initializes the data cluster (idempotent: skips if `PG_VERSION` exists)
- Deploys `pg_hba.conf` from a Jinja2 template (peer for local, md5 for
  backend IP)
- Creates the `cinevote` database user (gated on `SELECT 1 FROM pg_roles`)
- Creates the `cinevote` database (gated on `SELECT 1 FROM pg_database`)
- Runs SQL migrations from `storage/migrations/*.sql` in sorted order;
  tracks applied versions in a `schema_migrations` table — safe to re-run
- Opens port 5432 in firewalld only for `10.10.0.20/32` (backend VM)

### `backend`
Manages the Node.js API on the backend VM (`10.10.0.20`):
- Adds the NodeSource Node.js 20 repository and installs `nodejs`
- Creates the `cinevote` system user and application directories
- Rsyncs `storage/` and `backend/` from the control machine (checksum-based,
  skips unchanged files)
- Runs `npm install` and `tsc` only when source files change (handler pattern)
- Renders `.env` from `backend.env.j2` with Vault-injected secrets
- Installs and enables the `cinevote-backend` systemd service
- Polls `/api/health` until `db: connected` before declaring success
- Adds port 3000 to SELinux `http_port_t`; opens firewall only for
  `10.10.0.10/32` (frontend VM)

### `frontend`
Manages the Nginx SPA server on the frontend VM (`10.10.0.10`):
- Installs Nginx; creates `/usr/share/nginx/cinevote` webroot
- Builds the React SPA with `npm ci && npm run build` **on the control machine**
  (delegated `localhost` task) — the frontend uses `/api` as the default
  `baseURL` and `''` for Socket.io, so no env vars needed at build time
- Rsyncs `frontend/dist/` to the webroot (checksum-based)
- Deploys `nginx.conf.j2` with reverse-proxy rules for `/api/` and
  `/socket.io/`
- Sets the `httpd_can_network_connect` SELinux boolean so Nginx can reach
  the backend
- Opens port 8080 in firewalld (public, for browser access)
