# PE2 Local Vagrant Deployment

This directory contains the default infrastructure for the basic requirements. It creates three local Vagrant machines:

- `frontend` - `10.10.0.10`
- `backend` - `10.10.0.20`
- `storage` - `10.10.0.30`

The Vagrant setup only provisions machines. The application itself must be deployed with Ansible.

## Prerequisites

- Vagrant
- the Vagrant provider required by `Vagrantfile` (`libvirt`)
- Ansible

## Start the machines

Run these commands from this directory:

```bash
vagrant up
ansible all -m ping
```

`ansible.cfg` points Ansible at `inventory.ini`, which defines the required `frontend`, `backend`, and `storage` groups.

## Deploy the application

Run your project deployment command from the directory documented in your `PROJECT_README.md`.

Example shape from the repository root:

```bash
ansible-playbook -i local-deploy/inventory.ini ansible/playbook.yml
```

Replace the example with the exact command for your project. The final deployment must still be one Ansible command and must not require manual post-installation steps on the Vagrant machines.

## Clean up

From this directory:

```bash
vagrant destroy -f
```

If SSH host keys become stale after recreating machines, use `clean_known_hosts.sh`.
