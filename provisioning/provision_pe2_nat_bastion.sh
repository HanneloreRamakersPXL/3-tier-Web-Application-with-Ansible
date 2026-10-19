#!/usr/bin/env bash
set -Eeuo pipefail

REGION="${REGION:-$(aws configure get region 2>/dev/null || true)}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.micro}"
PROJECT_TAG="${PROJECT_TAG:-automationi-pe2}"
NAME_PREFIX="${NAME_PREFIX:-${PROJECT_TAG}-$(date +%Y%m%d%H%M%S)}"

if [[ -z "${KEY_PUB:-}" ]]; then
  for _candidate in "$HOME/.ssh/id_ed25519.pub" "$HOME/.ssh/id_rsa.pub" "$HOME/.ssh/id_ecdsa.pub" "$HOME/.ssh/id_dsa.pub"; do
    if [[ -f "${_candidate}" ]]; then
      KEY_PUB="${_candidate}"
      break
    fi
  done
fi
if [[ -z "${KEY_PUB:-}" ]]; then
  echo "ERROR: No SSH public key found in ~/.ssh/. Generate one with:"
  echo "  ssh-keygen -t ed25519 -C \"your_email@example.com\""
  echo "Or set KEY_PUB explicitly:"
  echo "  KEY_PUB=~/.ssh/your_key.pub ./provisioning/provision_pe2_nat_bastion.sh"
  exit 1
fi
KEY_PRIV="${KEY_PRIV:-${KEY_PUB%.pub}}"
KEY_NAME="${KEY_NAME:-${NAME_PREFIX}-key}"

STATE_FILE="${STATE_FILE:-pe2_state.env}"
INVENTORY_FILE="${INVENTORY_FILE:-inventory.ini}"
ANSIBLE_CFG_FILE="${ANSIBLE_CFG_FILE:-ansible.cfg}"
VARS_HINT_FILE="${VARS_HINT_FILE:-provisioned_vars.yml}"

FRONTEND_HTTP_PORT="${FRONTEND_HTTP_PORT:-80}"

VPC_CIDR="${VPC_CIDR:-10.42.0.0/16}"
PUBLIC_SUBNET_CIDR="${PUBLIC_SUBNET_CIDR:-10.42.1.0/24}"
PRIVATE_SUBNET_CIDR="${PRIVATE_SUBNET_CIDR:-10.42.2.0/24}"

if [[ -f "${STATE_FILE}" ]]; then
  echo "ERROR: ${STATE_FILE} already exists."
  echo "An environment may still be running. Run ./provisioning/teardown_pe2_nat_bastion.sh first,"
  echo "or delete ${STATE_FILE} manually if you are certain no AWS resources remain."
  exit 1
fi

AMI_PARAM="/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"

if [[ -z "${SSH_CIDR:-}" ]]; then
  MY_IP="$(curl -fsSL https://checkip.amazonaws.com | tr -d '\r\n' || true)"
  if [[ -z "${MY_IP}" ]]; then
    echo "ERROR: Could not auto-detect your public IP."
    echo "Set SSH_CIDR manually, for example:"
    echo "  SSH_CIDR=203.0.113.10/32 ./provisioning/provision_pe2_nat_bastion.sh"
    exit 1
  fi
  SSH_CIDR="${MY_IP}/32"
fi

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: Required command not found: $1"
    exit 1
  }
}

fail() {
  echo "ERROR: $*" >&2
  echo "If resources were partially created, use: ./provisioning/teardown_pe2_nat_bastion.sh"
  exit 1
}

log() {
  echo
  echo "==> $*"
}

authorize_ingress_safe() {
  aws ec2 authorize-security-group-ingress --region "${REGION}" "$@" >/dev/null 2>&1 || true
}

wait_for_ssh() {
  local host="$1"
  local tries=60
  local delay=5

  log "Waiting for SSH on ${host}"
  for _ in $(seq 1 "${tries}"); do
    if ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 -i "${KEY_PRIV}" ec2-user@"${host}" 'echo ok' >/dev/null 2>&1; then
      echo "SSH ready on ${host}"
      return 0
    fi
    sleep "${delay}"
  done

  fail "SSH did not become ready on ${host}"
}

require_cmd aws
require_cmd ssh
require_cmd curl

[[ -n "${REGION}" ]] || fail "No AWS region configured"
[[ -f "${KEY_PUB}" ]] || fail "Public key not found: ${KEY_PUB}"
[[ -f "${KEY_PRIV}" ]] || fail "Private key not found: ${KEY_PRIV}"

chmod 600 "${KEY_PRIV}"

log "Preflight summary"
echo "Region:           ${REGION}"
echo "Instance type:    ${INSTANCE_TYPE}"
echo "Project tag:      ${PROJECT_TAG}"
echo "Name prefix:      ${NAME_PREFIX}"
echo "SSH public key:   ${KEY_PUB}"
echo "SSH private key:  ${KEY_PRIV}"
echo "SSH allowed CIDR: ${SSH_CIDR}"
echo "VPC CIDR:         ${VPC_CIDR}"
echo "Public subnet:    ${PUBLIC_SUBNET_CIDR}"
echo "Private subnet:   ${PRIVATE_SUBNET_CIDR}"

echo
echo "WARNING:"
echo "- This script creates a NAT Gateway and an Elastic IP."
echo "- NAT Gateway usage may consume AWS Academy quota or lab budget."
echo "- Continue only if your lab permissions allow NAT Gateway creation."
echo
read -r -p "Continue? [y/N] " CONFIRM
[[ "${CONFIRM}" =~ ^[Yy]$ ]] || exit 1

ACCOUNT_ID="$(aws sts get-caller-identity --query 'Account' --output text --region "${REGION}")" || fail "AWS authentication failed"
echo "AWS account: ${ACCOUNT_ID}"

log "Resolving Amazon Linux 2023 AMI"
AMI_ID="$(aws ssm get-parameter --region "${REGION}" --name "${AMI_PARAM}" --query 'Parameter.Value' --output text)"
[[ -n "${AMI_ID}" && "${AMI_ID}" != "None" ]] || fail "Could not resolve AMI from ${AMI_PARAM}"
echo "AMI: ${AMI_ID}"

AZ="$(aws ec2 describe-availability-zones --region "${REGION}" --filters Name=state,Values=available --query 'AvailabilityZones[0].ZoneName' --output text)"
[[ -n "${AZ}" && "${AZ}" != "None" ]] || fail "Could not determine availability zone"
echo "AZ:  ${AZ}"

log "Importing EC2 key pair"
TMP_IMPORT_ERR="$(mktemp)"
set +e
aws ec2 import-key-pair --region "${REGION}" --key-name "${KEY_NAME}" --public-key-material "fileb://${KEY_PUB}" >"${TMP_IMPORT_ERR}" 2>&1
IMPORT_RC=$?
set -e

if [[ ${IMPORT_RC} -ne 0 ]]; then
  if grep -q "InvalidKeyPair.Duplicate" "${TMP_IMPORT_ERR}"; then
    echo "Key pair already exists, reusing: ${KEY_NAME}"
  else
    cat "${TMP_IMPORT_ERR}"
    rm -f "${TMP_IMPORT_ERR}"
    fail "import-key-pair failed"
  fi
fi
rm -f "${TMP_IMPORT_ERR}"
echo "EC2 key pair: ${KEY_NAME}"

log "Creating VPC"
VPC_ID="$(aws ec2 create-vpc --region "${REGION}" --cidr-block "${VPC_CIDR}" --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=${NAME_PREFIX}-vpc},{Key=Project,Value=${PROJECT_TAG}}]" --query 'Vpc.VpcId' --output text)"
[[ -n "${VPC_ID}" && "${VPC_ID}" != "None" ]] || fail "Failed to create VPC"

aws ec2 modify-vpc-attribute --region "${REGION}" --vpc-id "${VPC_ID}" --enable-dns-support '{"Value":true}'
aws ec2 modify-vpc-attribute --region "${REGION}" --vpc-id "${VPC_ID}" --enable-dns-hostnames '{"Value":true}'
echo "VPC: ${VPC_ID}"

log "Creating Internet Gateway"
IGW_ID="$(aws ec2 create-internet-gateway --region "${REGION}" --tag-specifications "ResourceType=internet-gateway,Tags=[{Key=Name,Value=${NAME_PREFIX}-igw},{Key=Project,Value=${PROJECT_TAG}}]" --query 'InternetGateway.InternetGatewayId' --output text)"
aws ec2 attach-internet-gateway --region "${REGION}" --internet-gateway-id "${IGW_ID}" --vpc-id "${VPC_ID}"
echo "IGW: ${IGW_ID}"

log "Creating subnets"
PUBLIC_SUBNET_ID="$(aws ec2 create-subnet --region "${REGION}" --vpc-id "${VPC_ID}" --cidr-block "${PUBLIC_SUBNET_CIDR}" --availability-zone "${AZ}" --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${NAME_PREFIX}-public-subnet},{Key=Project,Value=${PROJECT_TAG}}]" --query 'Subnet.SubnetId' --output text)"
PRIVATE_SUBNET_ID="$(aws ec2 create-subnet --region "${REGION}" --vpc-id "${VPC_ID}" --cidr-block "${PRIVATE_SUBNET_CIDR}" --availability-zone "${AZ}" --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${NAME_PREFIX}-private-subnet},{Key=Project,Value=${PROJECT_TAG}}]" --query 'Subnet.SubnetId' --output text)"

aws ec2 modify-subnet-attribute --region "${REGION}" --subnet-id "${PUBLIC_SUBNET_ID}" --map-public-ip-on-launch
echo "Public subnet:  ${PUBLIC_SUBNET_ID}"
echo "Private subnet: ${PRIVATE_SUBNET_ID}"

log "Creating route tables"
PUBLIC_RT_ID="$(aws ec2 create-route-table --region "${REGION}" --vpc-id "${VPC_ID}" --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=${NAME_PREFIX}-public-rt},{Key=Project,Value=${PROJECT_TAG}}]" --query 'RouteTable.RouteTableId' --output text)"
PRIVATE_RT_ID="$(aws ec2 create-route-table --region "${REGION}" --vpc-id "${VPC_ID}" --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=${NAME_PREFIX}-private-rt},{Key=Project,Value=${PROJECT_TAG}}]" --query 'RouteTable.RouteTableId' --output text)"

aws ec2 create-route --region "${REGION}" --route-table-id "${PUBLIC_RT_ID}" --destination-cidr-block 0.0.0.0/0 --gateway-id "${IGW_ID}" >/dev/null
PUBLIC_RT_ASSOC_ID="$(aws ec2 associate-route-table --region "${REGION}" --route-table-id "${PUBLIC_RT_ID}" --subnet-id "${PUBLIC_SUBNET_ID}" --query 'AssociationId' --output text)"
PRIVATE_RT_ASSOC_ID="$(aws ec2 associate-route-table --region "${REGION}" --route-table-id "${PRIVATE_RT_ID}" --subnet-id "${PRIVATE_SUBNET_ID}" --query 'AssociationId' --output text)"

echo "Public route table:  ${PUBLIC_RT_ID}"
echo "Private route table: ${PRIVATE_RT_ID}"

log "Creating NAT Gateway"
EIP_ALLOC_ID="$(aws ec2 allocate-address --region "${REGION}" --domain vpc --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=${NAME_PREFIX}-nat-eip},{Key=Project,Value=${PROJECT_TAG}}]" --query 'AllocationId' --output text)"
NAT_GW_ID="$(aws ec2 create-nat-gateway --region "${REGION}" --subnet-id "${PUBLIC_SUBNET_ID}" --allocation-id "${EIP_ALLOC_ID}" --tag-specifications "ResourceType=natgateway,Tags=[{Key=Name,Value=${NAME_PREFIX}-natgw},{Key=Project,Value=${PROJECT_TAG}}]" --query 'NatGateway.NatGatewayId' --output text)"

echo "Elastic IP allocation: ${EIP_ALLOC_ID}"
echo "NAT gateway:           ${NAT_GW_ID}"
log "Waiting for NAT gateway to become available"
aws ec2 wait nat-gateway-available --region "${REGION}" --nat-gateway-ids "${NAT_GW_ID}"
aws ec2 create-route --region "${REGION}" --route-table-id "${PRIVATE_RT_ID}" --destination-cidr-block 0.0.0.0/0 --nat-gateway-id "${NAT_GW_ID}" >/dev/null

log "Creating security groups"
create_sg() {
  local name="$1"
  local description="$2"
  aws ec2 create-security-group --region "${REGION}" --group-name "${name}" --description "${description}" --vpc-id "${VPC_ID}" --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=${name}},{Key=Project,Value=${PROJECT_TAG}}]" --query 'GroupId' --output text
}

FRONTEND_SG_ID="$(create_sg "${NAME_PREFIX}-frontend-sg" "Frontend SG for ${PROJECT_TAG}")"
BACKEND_SG_ID="$(create_sg "${NAME_PREFIX}-backend-sg" "Backend SG for ${PROJECT_TAG}")"
STORAGE_SG_ID="$(create_sg "${NAME_PREFIX}-storage-sg" "Storage SG for ${PROJECT_TAG}")"

authorize_ingress_safe --group-id "${FRONTEND_SG_ID}" --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=${SSH_CIDR},Description=SSH from student machine}]"
authorize_ingress_safe --group-id "${FRONTEND_SG_ID}" --ip-permissions "IpProtocol=tcp,FromPort=${FRONTEND_HTTP_PORT},ToPort=${FRONTEND_HTTP_PORT},IpRanges=[{CidrIp=0.0.0.0/0,Description=Public frontend HTTP}]"
authorize_ingress_safe --group-id "${BACKEND_SG_ID}" --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,UserIdGroupPairs=[{GroupId=${FRONTEND_SG_ID},Description=SSH from frontend bastion}]"
authorize_ingress_safe --group-id "${BACKEND_SG_ID}" --ip-permissions "IpProtocol=tcp,FromPort=1,ToPort=65535,UserIdGroupPairs=[{GroupId=${FRONTEND_SG_ID},Description=Frontend to backend}]"
authorize_ingress_safe --group-id "${STORAGE_SG_ID}" --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,UserIdGroupPairs=[{GroupId=${FRONTEND_SG_ID},Description=SSH from frontend bastion}]"
authorize_ingress_safe --group-id "${STORAGE_SG_ID}" --ip-permissions "IpProtocol=tcp,FromPort=1,ToPort=65535,UserIdGroupPairs=[{GroupId=${BACKEND_SG_ID},Description=Backend to storage}]"

echo "Frontend SG: ${FRONTEND_SG_ID}"
echo "Backend SG:  ${BACKEND_SG_ID}"
echo "Storage SG:  ${STORAGE_SG_ID}"

log "Launching EC2 instances"
FRONTEND_ID="$(aws ec2 run-instances --region "${REGION}" --image-id "${AMI_ID}" --instance-type "${INSTANCE_TYPE}" --key-name "${KEY_NAME}" --subnet-id "${PUBLIC_SUBNET_ID}" --security-group-ids "${FRONTEND_SG_ID}" --associate-public-ip-address --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${NAME_PREFIX}-frontend},{Key=Project,Value=${PROJECT_TAG}},{Key=Role,Value=frontend}]" --query 'Instances[0].InstanceId' --output text)"
BACKEND_ID="$(aws ec2 run-instances --region "${REGION}" --image-id "${AMI_ID}" --instance-type "${INSTANCE_TYPE}" --key-name "${KEY_NAME}" --subnet-id "${PRIVATE_SUBNET_ID}" --security-group-ids "${BACKEND_SG_ID}" --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${NAME_PREFIX}-backend},{Key=Project,Value=${PROJECT_TAG}},{Key=Role,Value=backend}]" --query 'Instances[0].InstanceId' --output text)"
STORAGE_ID="$(aws ec2 run-instances --region "${REGION}" --image-id "${AMI_ID}" --instance-type "${INSTANCE_TYPE}" --key-name "${KEY_NAME}" --subnet-id "${PRIVATE_SUBNET_ID}" --security-group-ids "${STORAGE_SG_ID}" --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${NAME_PREFIX}-storage},{Key=Project,Value=${PROJECT_TAG}},{Key=Role,Value=storage}]" --query 'Instances[0].InstanceId' --output text)"

echo "Frontend instance: ${FRONTEND_ID}"
echo "Backend instance:  ${BACKEND_ID}"
echo "Storage instance:  ${STORAGE_ID}"

log "Waiting for instances to enter running state"
aws ec2 wait instance-running --region "${REGION}" --instance-ids "${FRONTEND_ID}" "${BACKEND_ID}" "${STORAGE_ID}"

log "Resolving instance IP addresses"
readarray -t INSTANCE_ROWS < <(aws ec2 describe-instances --region "${REGION}" --instance-ids "${FRONTEND_ID}" "${BACKEND_ID}" "${STORAGE_ID}" --query 'Reservations[].Instances[].[Tags[?Key==`Role`]|[0].Value,InstanceId,PublicIpAddress,PrivateIpAddress]' --output text | sort)

FRONTEND_PUBLIC=""
FRONTEND_PRIVATE=""
BACKEND_PRIVATE=""
STORAGE_PRIVATE=""

for row in "${INSTANCE_ROWS[@]}"; do
  IFS=$'\t' read -r role _iid pub priv <<<"${row}"
  case "${role}" in
    frontend) FRONTEND_PUBLIC="${pub}"; FRONTEND_PRIVATE="${priv}" ;;
    backend)  BACKEND_PRIVATE="${priv}" ;;
    storage)  STORAGE_PRIVATE="${priv}" ;;
  esac
done

[[ -n "${FRONTEND_PUBLIC}" && -n "${FRONTEND_PRIVATE}" && -n "${BACKEND_PRIVATE}" && -n "${STORAGE_PRIVATE}" ]] || fail "Could not resolve instance IP addresses correctly"

wait_for_ssh "${FRONTEND_PUBLIC}"
# Backend and storage are in the private subnet and are reached through the
# frontend as a ProxyJump bastion. Their SSH readiness is verified implicitly
# when Ansible connects through the frontend during deployment.

log "Writing Ansible inventory"
cat > "${INVENTORY_FILE}" <<EOF
[frontend]
frontend-host ansible_host=${FRONTEND_PUBLIC} private_ip=${FRONTEND_PRIVATE}

[backend]
backend-host ansible_host=${BACKEND_PRIVATE}

[storage]
storage-host ansible_host=${STORAGE_PRIVATE}

[all:vars]
ansible_user=ec2-user
ansible_ssh_private_key_file=${KEY_PRIV}
aws_region=${REGION}
project_tag=${PROJECT_TAG}

[frontend:vars]
ansible_ssh_common_args=-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null

[backend:vars]
ansible_ssh_common_args=-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ProxyCommand="ssh -W %h:%p -i ${KEY_PRIV} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ec2-user@${FRONTEND_PUBLIC}"

[storage:vars]
ansible_ssh_common_args=-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ProxyCommand="ssh -W %h:%p -i ${KEY_PRIV} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ec2-user@${FRONTEND_PUBLIC}"
EOF

log "Writing ansible.cfg"
cat > "${ANSIBLE_CFG_FILE}" <<EOF
[defaults]
inventory = ${INVENTORY_FILE}
# host_key_checking is disabled because EC2 instance host keys change on every
# provision. Do not copy this setting to production environments.
host_key_checking = False
interpreter_python = auto_silent
timeout = 30
retry_files_enabled = False

[ssh_connection]
pipelining = True
EOF

log "Writing variable hint file"
cat > "${VARS_HINT_FILE}" <<EOF
# These values were generated by the provisioning script.
# Copy what you need into your Ansible group_vars or host_vars.
aws_region: "${REGION}"

frontend_public_ip: "${FRONTEND_PUBLIC}"
frontend_private_ip: "${FRONTEND_PRIVATE}"
backend_private_ip: "${BACKEND_PRIVATE}"
storage_private_ip: "${STORAGE_PRIVATE}"

frontend_port: ${FRONTEND_HTTP_PORT}
# backend_port: ???   # set to the port your backend application listens on
# storage_port: ???   # set to the port your storage technology uses
#                     # PostgreSQL: 5432  MySQL/MariaDB: 3306  MongoDB: 27017  Redis: 6379
EOF

log "Writing state file"
cat > "${STATE_FILE}" <<EOF
REGION='${REGION}'
PROJECT_TAG='${PROJECT_TAG}'
NAME_PREFIX='${NAME_PREFIX}'
KEY_NAME='${KEY_NAME}'
KEY_PUB='${KEY_PUB}'
KEY_PRIV='${KEY_PRIV}'
VPC_ID='${VPC_ID}'
IGW_ID='${IGW_ID}'
PUBLIC_SUBNET_ID='${PUBLIC_SUBNET_ID}'
PRIVATE_SUBNET_ID='${PRIVATE_SUBNET_ID}'
PUBLIC_RT_ID='${PUBLIC_RT_ID}'
PRIVATE_RT_ID='${PRIVATE_RT_ID}'
PUBLIC_RT_ASSOC_ID='${PUBLIC_RT_ASSOC_ID}'
PRIVATE_RT_ASSOC_ID='${PRIVATE_RT_ASSOC_ID}'
EIP_ALLOC_ID='${EIP_ALLOC_ID}'
NAT_GW_ID='${NAT_GW_ID}'
FRONTEND_SG_ID='${FRONTEND_SG_ID}'
BACKEND_SG_ID='${BACKEND_SG_ID}'
STORAGE_SG_ID='${STORAGE_SG_ID}'
FRONTEND_ID='${FRONTEND_ID}'
BACKEND_ID='${BACKEND_ID}'
STORAGE_ID='${STORAGE_ID}'
FRONTEND_PUBLIC='${FRONTEND_PUBLIC}'
FRONTEND_PRIVATE='${FRONTEND_PRIVATE}'
BACKEND_PRIVATE='${BACKEND_PRIVATE}'
STORAGE_PRIVATE='${STORAGE_PRIVATE}'
EOF

log "Done"
echo "Frontend public IP: ${FRONTEND_PUBLIC}"
echo "Backend private IP: ${BACKEND_PRIVATE}"
echo "Storage private IP: ${STORAGE_PRIVATE}"
echo
echo "Files written:"
echo "  ${INVENTORY_FILE}"
echo "  ${ANSIBLE_CFG_FILE}"
echo "  ${VARS_HINT_FILE}"
echo "  ${STATE_FILE}"
echo
echo "Example commands:"
echo "  ansible all -m ping"
echo "  ssh -i ${KEY_PRIV} ec2-user@${FRONTEND_PUBLIC}"
