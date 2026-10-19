# CineVote — Deployment Guide

CineVote is a group movie-voting application deployed across three dedicated
VMs using a fully-automated, idempotent Ansible playbook.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Host machine (developer laptop)                                │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Vagrant (libvirt / KVM)                                   │ │
│  │                                                            │ │
│  │  ┌──────────────────┐   /api/*          ┌───────────────┐ │ │
│  │  │  Frontend VM     │ ──────────────────►│  Backend VM   │ │ │
│  │  │  10.10.0.10:8080 │   /socket.io/*    │  10.10.0.20   │ │ │
│  │  │  Nginx + React   │ ──────────────────►│  :3000        │ │ │
│  │  └──────────────────┘                   │  Node.js      │ │ │
│  │          ▲                               └───────┬───────┘ │ │
│  │     port-forward                                 │  pg     │ │
│  │    host:8080 → guest                             ▼         │ │
│  │                                         ┌───────────────┐ │ │
│  │                                         │  Storage VM   │ │ │
│  │                                         │  10.10.0.30   │ │ │
│  │                                         │  :5432        │ │ │
│  │                                         │  PostgreSQL14 │ │ │
│  │                                         └───────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

| Tier     | IP           | Port | Stack              | Role         |
|----------|--------------|------|--------------------|--------------|
| Frontend | 10.10.0.10   | 8080 | Nginx + React SPA  | `frontend`   |
| Backend  | 10.10.0.20   | 3000 | Node.js + Express  | `backend`    |
| Storage  | 10.10.0.30   | 5432 | PostgreSQL 14      | `storage`    |

The frontend Nginx acts as a **reverse proxy**: it serves the pre-built React
SPA and transparently forwards `/api/*` and `/socket.io/*` requests to the
backend. The browser never makes cross-origin requests.

---

## Prerequisites

### On your developer machine

| Tool            | Version    | Notes                          |
|-----------------|------------|--------------------------------|
| Vagrant         | ≥ 2.3      | `vagrant --version`            |
| libvirt + KVM   | any        | `vagrant plugin install vagrant-libvirt` |
| Ansible         | ≥ 2.14     | `ansible --version`            |
| Node.js         | ≥ 18       | Required to build frontend     |
| npm             | ≥ 9        | Bundled with Node.js           |

### Vagrant insecure key

The inventory uses `~/.vagrant.d/insecure_private_key`. Vagrant places it
there automatically. If it's missing:

```bash
vagrant ssh-config   # lists the key path used per VM
```

---

## Quickstart — Full Deployment

```bash
# 1. Start the three VMs
cd local-deploy
vagrant up

# 2. Install Ansible collections (first time only)
cd ../ansible
ansible-galaxy collection install -r requirements.yml

# 3. Create the vault password file (first time only, gitignored)
echo "cinevote-local" > .vault_pass

# 4. Deploy everything with one command
ansible-playbook -i inventories/local/hosts.yml site.yml
```

After a successful run you will see a health summary:

```
TASK [Display deployment summary]
ok: [storage] =>
  msg:
    - ════════════════════════════════════════════════════════
    - "        CineVote — Deployment Health Report             "
    - "  Frontend : http://10.10.0.10:8080"
    - "  Backend  : http://10.10.0.20:3000"
    - "  Storage  : 10.10.0.30:5432"
    - "  DB       : connected"
    - "  API ver  : 1.0.0"
    - "  Uptime   : 3s"
    - ════════════════════════════════════════════════════════
```

Open the app at **http://10.10.0.10:8080** (port-forwarded from the frontend VM).

---

## Targeted Tier Redeploys

All plays are tagged. Redeploy only the changed tier without touching the others:

```bash
# Redeploy storage (PostgreSQL config + migrations)
ansible-playbook -i inventories/local/hosts.yml site.yml --tags storage

# Redeploy backend (Node.js code + .env + service)
ansible-playbook -i inventories/local/hosts.yml site.yml --tags backend

# Redeploy frontend (rebuild React + sync dist/ + Nginx config)
ansible-playbook -i inventories/local/hosts.yml site.yml --tags frontend
```

---

## Health Checks

Run health checks at any time without redeploying:

```bash
ansible-playbook -i inventories/local/hosts.yml site.yml --tags health
```

Manual checks:

```bash
# Backend API health (returns JSON with db status)
curl http://10.10.0.20:3000/api/health

# Detailed pool stats
curl http://10.10.0.20:3000/api/health/detailed

# Frontend (expect HTML)
curl -I http://10.10.0.10:8080/

# Storage (direct psql from storage VM)
vagrant ssh storage -c "psql -U cinevote -d cinevote -c 'SELECT COUNT(*) FROM schema_migrations;'"

# Service logs
vagrant ssh backend  -c "sudo journalctl -u cinevote-backend -n 50"
vagrant ssh frontend -c "sudo journalctl -u nginx -n 20"
```

---

## Persisted State Proof

Database data is stored on the storage VM's persistent disk
(`/var/lib/pgsql/14/data/`). To verify data survives a backend redeploy:

```bash
# 1. Create a group via the app, note the invite code.

# 2. Redeploy only the backend tier:
ansible-playbook -i inventories/local/hosts.yml site.yml --tags backend

# 3. Rejoin with the same invite code — data is intact.

# 4. Confirm with a direct DB query:
vagrant ssh storage -c "psql -U cinevote -d cinevote -c 'SELECT name, invite_code FROM groups;'"
```

---

## Secrets & Vault

Secrets (DB password, JWT secret, HMAC secret, TMDB API key) are stored
**encrypted** with Ansible Vault in:

```
ansible/inventories/local/group_vars/all/vault.yml
```

The local-development vault password is `cinevote-local`.

Before running the playbook, create the password file (it is gitignored):

```bash
echo "cinevote-local" > ansible/.vault_pass
```

`ansible/ansible.cfg` already points at `.vault_pass` via `vault_password_file`,
so no extra flags are needed:

```bash
ansible-playbook -i inventories/local/hosts.yml site.yml
```

If you prefer to be prompted instead:

```bash
ansible-playbook -i inventories/local/hosts.yml site.yml --ask-vault-pass
```

To re-encrypt with a new password for production:

```bash
ansible-vault rekey inventories/local/group_vars/all/vault.yml
```

See `ansible/vault/README.md` for details.

---

## Use of `command` and `shell` Modules

The Ansible `command` and `shell` modules are used only where no suitable
built-in or collection module exists. Each use is justified below.

| Role | Module | Reason |
|------|--------|--------|
| `storage` | `command: psql …` | `community.postgresql` requires `psycopg2` installed on the managed host, adding an unacceptable runtime dependency. Raw `psql` achieves the same result without it. Used for: user/database existence checks, `CREATE USER/DATABASE`, `GRANT`, migration execution, health queries. |
| `storage` | `command: postgresql-14-setup initdb` | No Ansible module wraps the RHEL-specific `initdb` helper. |
| `storage` | `command: dnf module disable …` | Disabling a DNF module stream has no dedicated Ansible module; `ansible.builtin.dnf` does not expose module stream management. |
| `backend` | `shell: curl … \| bash` (NodeSource setup) | NodeSource's official installation method is a shell script. No Ansible module installs the NodeSource repository on RHEL/AlmaLinux 9. |
| `backend` | `command: npm install / npm run build` | No Ansible module wraps npm. `community.general.npm` does not support workspaces or the `--include=dev` flag needed here. |
| `backend` | `shell: find … \| sha256sum` | Computing a rolling checksum of a directory tree requires shell pipes; no equivalent Ansible module exists. |
| `backend` | `command: journalctl …` | Capturing journal output for diagnostics on failure; no Ansible module reads the systemd journal. |
| `frontend` | `command: npm ci / npm run build` | Same justification as backend npm commands. |
| `frontend` | `shell: find … \| sha256sum` | Same justification as backend hash computation. |
| `frontend` | `command: nginx -t` | `nginx -t` validates the Nginx config on the managed host; the `nginx` Ansible module does not expose a validate-only mode. |

---

## Vagrant VM Management

```bash
# Start all VMs
vagrant up

# Stop without destroying
vagrant halt

# Destroy and recreate (data loss!)
vagrant destroy -f && vagrant up

# SSH into a VM
vagrant ssh frontend
vagrant ssh backend
vagrant ssh storage

# Clean SSH known_hosts if you recreate VMs
bash local-deploy/clean_known_hosts.sh
```

---

## Idempotency

Running the playbook a second time (without code changes) produces **zero
unnecessary changes**:

- `rsync` compares checksums — unchanged files are skipped
- `npm install` + `tsc` only run when source files changed
- DB user/database creation is gated on `SELECT 1 FROM pg_roles/pg_database`
- Migrations are tracked in `schema_migrations` — already-applied versions
  are skipped
- `systemd` service, Nginx, PostgreSQL only restart when config/code changed
  (via handlers)

---

## Environment Variables (Backend)

All backend env vars are rendered by Ansible from:
`roles/backend/templates/backend.env.j2`

| Variable         | Source          | Description                    |
|------------------|-----------------|--------------------------------|
| `PORT`           | `backend_port`  | Express listen port (3000)     |
| `DB_HOST`        | `storage_ip`    | PostgreSQL host                |
| `DB_NAME`        | `db_name`       | Database name                  |
| `DB_USER`        | `db_user`       | DB username                    |
| `DB_PASSWORD`    | `vault_db_password` | DB password (Vault)        |
| `CORS_ORIGIN`    | `cors_origin`   | Allowed frontend origin        |
| `JWT_SECRET`     | `vault_jwt_secret`  | JWT signing key (Vault)    |
| `HMAC_SECRET`    | `vault_hmac_secret` | HMAC key (Vault)           |
| `TMDB_API_KEY`   | `vault_tmdb_api_key`| TMDB API key (Vault)       |

---

## Central Logging (EXTRA3)

All three tiers forward service logs to a central rsyslog receiver on the **frontend VM** (`10.10.0.10`).

| Host | Role | Log destination |
|------|------|-----------------|
| frontend | receiver + writer | `/var/log/cinevote/<hostname>.log` (local) |
| backend | forwarder | → frontend:514 TCP |
| storage | forwarder | → frontend:514 TCP |

Logs are written to per-host files under `/var/log/cinevote/` on the frontend. The source machine is identifiable from both the filename and the syslog HOSTNAME field inside each entry.

### View central logs during demo

```bash
# Watch all collected logs in real time
vagrant ssh frontend -c "sudo tail -f /var/log/cinevote/*.log"

# Watch only backend logs
vagrant ssh frontend -c "sudo tail -f /var/log/cinevote/backend.pxldemo.local.log"

# Watch only storage (PostgreSQL) logs
vagrant ssh frontend -c "sudo tail -f /var/log/cinevote/storage.pxldemo.local.log"

# Watch only frontend (Nginx) logs
vagrant ssh frontend -c "sudo tail -f /var/log/cinevote/frontend.pxldemo.local.log"
```

### Trigger a visible log event

```bash
# Generate a backend log entry (API request)
curl http://10.10.0.20:3000/api/health

# Generate a storage log entry (restart PostgreSQL — appears within seconds)
vagrant ssh storage -c "sudo systemctl restart postgresql-14"

# Confirm the event appeared in the central log
vagrant ssh frontend -c "sudo grep 'postgresql' /var/log/cinevote/storage.pxldemo.local.log | tail -5"
```

### Redeploy logging only

```bash
ansible-playbook -i inventories/local/hosts.yml site.yml --tags logging
```

---

## Extras Implemented

| Extra | Description |
|-------|-------------|
| EXTRA1 | Token-based authentication (JWT + bcrypt, protected routes, frontend AuthContext) |
| EXTRA2 | Role-based authorization (admin/member enforced in backend, 403 on denial) |
| EXTRA3 | Central logging via rsyslog — per-host log files on frontend VM |
| EXTRA4 | AWS Academy deployment — same roles and playbook, separate inventory |

---

## AWS Academy Deployment (EXTRA4)

The same `ansible/site.yml` playbook and roles are used for both local Vagrant and AWS deployment. Only the inventory changes.

### AWS Infrastructure

| Tier     | Instance                   | IP                              | Subnet  |
|----------|----------------------------|---------------------------------|---------|
| Frontend | automationi-pe2-…-frontend | *(see `provisioned_vars.yml`)*  | public  |
| Backend  | automationi-pe2-…-backend  | *(see `provisioned_vars.yml`)*  | private |
| Storage  | automationi-pe2-…-storage  | *(see `provisioned_vars.yml`)*  | private |

Backend and storage are in the private subnet, reachable via Ansible only through the frontend as a ProxyJump bastion.

### Prerequisites

- AWS CLI configured (`aws sts get-caller-identity`)
- SSH key at `~/.ssh/id_ed25519`
- Ansible ≥ 2.14

**Set AWS region:**

```bash
aws configure set region us-east-1
```

**Test AWS connection:**

```bash
aws sts get-caller-identity
```

### Provision the infrastructure

```bash
# From repository root
chmod +x provisioning/provision_pe2_nat_bastion.sh provisioning/teardown_pe2_nat_bastion.sh
./provisioning/provision_pe2_nat_bastion.sh
```

Full provisioning guide: `provisioning/PE2_PROVISIONING_QUICK_START.md`

### Step 1 — Fill in IP placeholders

After provisioning, open `provisioned_vars.yml` (generated in the repo root, gitignored)
and copy the three IP values into the four files below.

**File 1 — `ansible/inventories/aws/group_vars/all/vars.yml`**

```yaml
frontend_ip: "REPLACE_WITH_FRONTEND_PUBLIC_IP"   # ← paste frontend_public_ip
backend_ip:  "REPLACE_WITH_BACKEND_PRIVATE_IP"   # ← paste backend_private_ip
storage_ip:  "REPLACE_WITH_STORAGE_PRIVATE_IP"   # ← paste storage_private_ip
```

**File 2 — `ansible/inventories/aws/host_vars/frontend-aws.yml`**

```yaml
ansible_host: "REPLACE_WITH_FRONTEND_PUBLIC_IP"  # ← paste frontend_public_ip
```

**File 3 — `ansible/inventories/aws/host_vars/backend-aws.yml`**

```yaml
ansible_host: "REPLACE_WITH_BACKEND_PRIVATE_IP"  # ← paste backend_private_ip
# also replace the ProxyCommand jump host:
#   -W %h:%p ec2-user@REPLACE_WITH_FRONTEND_PUBLIC_IP
#                      ↑ paste frontend_public_ip here too
```

**File 4 — `ansible/inventories/aws/host_vars/storage-aws.yml`**

```yaml
ansible_host: "REPLACE_WITH_STORAGE_PRIVATE_IP"  # ← paste storage_private_ip
# also replace the ProxyCommand jump host:
#   -W %h:%p ec2-user@REPLACE_WITH_FRONTEND_PUBLIC_IP
#                      ↑ paste frontend_public_ip here too
```

These files are committed with `REPLACE_WITH_*` placeholders so no AWS-generated
IP is ever stored in the repository.

### Step 2 — Create the vault password file

The AWS inventory vault (`inventories/aws/group_vars/all/vault.yml`) is
encrypted with Ansible Vault. Create the password file before deploying
(it is gitignored):

```bash
echo "cinevote-local" > ansible/.vault_pass
```

`ansible/ansible.cfg` already points at `.vault_pass` via `vault_password_file`,
so no extra flags are needed on the playbook command.

If you prefer to be prompted for the password on every run instead:

```bash
ansible-playbook -i inventories/aws/hosts.yml site.yml --ask-vault-pass
ansible-playbook -i inventories/aws/hosts.yml site.yml --vault-password-file=.vault_pass
```

### Step 3 — Deploy with one command

```bash
cd ansible
ansible-playbook -i inventories/aws/hosts.yml site.yml 
```

### Targeted redeploys (AWS)

```bash
ansible-playbook -i inventories/aws/hosts.yml site.yml --tags storage
ansible-playbook -i inventories/aws/hosts.yml site.yml --tags backend
ansible-playbook -i inventories/aws/hosts.yml site.yml --tags frontend
```

### Health checks (AWS)

```bash
# Backend health (JSON with db status)
curl http://<FRONTEND_PUBLIC_IP>/api/health

# Frontend health
curl http://<FRONTEND_PUBLIC_IP>/health

# Full Ansible health verification
ansible-playbook -i inventories/aws/hosts.yml site.yml --tags health
```

The app is accessible at **http://\<FRONTEND_PUBLIC_IP\>** (port 80).
The public IP is written to `provisioned_vars.yml` after provisioning.

### Tear down

```bash
# From repository root
./provisioning/teardown_pe2_nat_bastion.sh
```
