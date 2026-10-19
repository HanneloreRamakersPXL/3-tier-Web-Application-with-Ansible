#!/usr/bin/env bash
set -Eeuo pipefail

STATE_FILE="${STATE_FILE:-pe2_state.env}"

[[ -f "${STATE_FILE}" ]] || {
  echo "ERROR: State file not found: ${STATE_FILE}"
  echo "Run this script from the repository root, not from inside provisioning/."
  exit 1
}

# shellcheck disable=SC1090
source "${STATE_FILE}"

[[ -n "${REGION:-}" ]] || {
  echo "ERROR: REGION missing in state file"
  exit 1
}

log() {
  echo
  echo "==> $*"
}

safe() {
  "$@" >/dev/null 2>&1 || true
}

log "Loaded state from ${STATE_FILE}"
echo "Region:      ${REGION}"
echo "Project tag: ${PROJECT_TAG:-unknown}"
echo
read -r -p "Destroy all listed resources? [y/N] " CONFIRM
[[ "${CONFIRM}" =~ ^[Yy]$ ]] || exit 1

IDS=()
[[ -n "${FRONTEND_ID:-}" ]] && IDS+=("${FRONTEND_ID}")
[[ -n "${BACKEND_ID:-}"  ]] && IDS+=("${BACKEND_ID}")
[[ -n "${STORAGE_ID:-}"  ]] && IDS+=("${STORAGE_ID}")

if [[ ${#IDS[@]} -gt 0 ]]; then
  log "Terminating instances"
  safe aws ec2 terminate-instances --region "${REGION}" --instance-ids "${IDS[@]}"
  log "Waiting for instances to terminate"
  # Do not use safe() here: a silent timeout leaves instances running and causes
  # all subsequent resource deletions (SGs, route tables, VPC) to fail silently.
  if ! aws ec2 wait instance-terminated --region "${REGION}" --instance-ids "${IDS[@]}" 2>/dev/null; then
    echo "WARNING: Instance termination wait timed out."
    echo "         Verify instances ${IDS[*]} are terminated in the AWS console before retrying."
  fi
fi

if [[ -n "${NAT_GW_ID:-}" ]]; then
  log "Deleting NAT Gateway"
  safe aws ec2 delete-nat-gateway --region "${REGION}" --nat-gateway-id "${NAT_GW_ID}"
  log "Waiting for NAT Gateway to be fully deleted (this can take several minutes)"
  # Do not use safe() here: if the wait is swallowed the EIP release below will
  # fail silently because AWS rejects release-address while the NAT GW is still
  # in 'deleting' state, leaving a dangling EIP consuming quota.
  if ! aws ec2 wait nat-gateway-deleted --region "${REGION}" --nat-gateway-ids "${NAT_GW_ID}" 2>/dev/null; then
    echo "WARNING: NAT Gateway wait timed out. The Elastic IP release may fail."
    echo "         Check the AWS console and release allocation ${EIP_ALLOC_ID:-unknown} manually if needed."
  fi
fi

if [[ -n "${EIP_ALLOC_ID:-}" ]]; then
  log "Releasing Elastic IP"
  safe aws ec2 release-address --region "${REGION}" --allocation-id "${EIP_ALLOC_ID}"
fi

for SG in "${STORAGE_SG_ID:-}" "${BACKEND_SG_ID:-}" "${FRONTEND_SG_ID:-}"; do
  [[ -n "${SG}" ]] || continue
  log "Deleting security group ${SG}"
  safe aws ec2 delete-security-group --region "${REGION}" --group-id "${SG}"
done

for ASSOC in "${PRIVATE_RT_ASSOC_ID:-}" "${PUBLIC_RT_ASSOC_ID:-}"; do
  [[ -n "${ASSOC}" ]] || continue
  log "Disassociating route table ${ASSOC}"
  safe aws ec2 disassociate-route-table --region "${REGION}" --association-id "${ASSOC}"
done

for RT in "${PRIVATE_RT_ID:-}" "${PUBLIC_RT_ID:-}"; do
  [[ -n "${RT}" ]] || continue
  log "Deleting route table ${RT}"
  safe aws ec2 delete-route-table --region "${REGION}" --route-table-id "${RT}"
done

for SUBNET in "${PRIVATE_SUBNET_ID:-}" "${PUBLIC_SUBNET_ID:-}"; do
  [[ -n "${SUBNET}" ]] || continue
  log "Deleting subnet ${SUBNET}"
  safe aws ec2 delete-subnet --region "${REGION}" --subnet-id "${SUBNET}"
done

if [[ -n "${IGW_ID:-}" && -n "${VPC_ID:-}" ]]; then
  log "Detaching and deleting Internet Gateway"
  safe aws ec2 detach-internet-gateway --region "${REGION}" --internet-gateway-id "${IGW_ID}" --vpc-id "${VPC_ID}"
  safe aws ec2 delete-internet-gateway --region "${REGION}" --internet-gateway-id "${IGW_ID}"
fi

if [[ -n "${VPC_ID:-}" ]]; then
  log "Deleting VPC"
  safe aws ec2 delete-vpc --region "${REGION}" --vpc-id "${VPC_ID}"
fi

if [[ -n "${KEY_NAME:-}" ]]; then
  log "Deleting EC2 key pair record"
  safe aws ec2 delete-key-pair --region "${REGION}" --key-name "${KEY_NAME}"
fi

log "Teardown complete"

log "Cleaning up generated files"
for f in "${STATE_FILE}" inventory.ini ansible.cfg provisioned_vars.yml; do
  if [[ -f "${f}" ]]; then
    rm -f "${f}"
    echo "Removed ${f}"
  fi
done
