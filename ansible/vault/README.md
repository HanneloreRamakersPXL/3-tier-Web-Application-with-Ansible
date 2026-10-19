# Ansible Vault — Secret Management

The actual secrets are stored in:

```
ansible/inventories/local/group_vars/all/vault.yml
```

## Local development (current state)

`vault.yml` is **NOT encrypted** for local Vagrant convenience.
The file contains safe, local-only credentials that are not used in any
production environment.

## Encrypting for production

```bash
# Encrypt the vault file (prompts for a passphrase)
ansible-vault encrypt inventories/local/group_vars/all/vault.yml

# Deploy with vault passphrase
ansible-playbook -i inventories/local/hosts.yml site.yml --ask-vault-pass

# Or store the passphrase in a file (add .vault_pass to .gitignore!)
echo "your-passphrase-here" > .vault_pass
chmod 600 .vault_pass
ansible-playbook -i inventories/local/hosts.yml site.yml --vault-password-file .vault_pass
```

## Editing an encrypted vault file

```bash
ansible-vault edit inventories/local/group_vars/all/vault.yml
```

## Vault variables

| Variable            | Purpose                                |
|---------------------|----------------------------------------|
| `vault_db_password` | PostgreSQL password for cinevote user  |
| `vault_jwt_secret`  | JWT signing secret (≥32 chars)         |
| `vault_hmac_secret` | HMAC signing secret for admin codes    |
| `vault_tmdb_api_key`| The Movie Database API key             |

All vault variables are referenced in `group_vars/all/vars.yml` via:
```yaml
db_password: "{{ vault_db_password }}"
```
