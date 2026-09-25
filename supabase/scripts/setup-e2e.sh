#!/usr/bin/env bash
# Prepares the local environment the e2e suite runs against (docs/testing.md):
# both Supabase stacks (tenant and control plane), demo users, sarah registered
# as a platform admin in the control plane, and pastoral fields encrypted.
#
# Everything is local. The script refuses to run if either stack reports a
# non-local API URL.
#
#   ./supabase/scripts/setup-e2e.sh [--reset] [--env-file <path>]
#
#   --reset       re-apply migrations and seed on both stacks (CI always passes it)
#   --env-file    append the app env (VAR=value lines) to <path>. CI passes
#                 $GITHUB_ENV; locally the Playwright config derives the same
#                 values itself, so this is optional.
#
# Pastoral fields in supabase/seed.sql are plaintext; the backfill encrypts them
# with PASTORAL_ENCRYPTION_KEY, or locally with the key kept in
# .e2e-pastoral-key.local (created on first run).
#
# Prerequisites: Docker, npx supabase, psql, python3, openssl, curl; ports
# 4200-4205 (tenant) and 4211-4213 (control plane) free.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
RESET=false
ENV_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reset) RESET=true; shift ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

cd "${ROOT_DIR}"

# Resolve the pastoral key before any slow work. Local runs keep one key in a
# gitignored repo-root file so it survives `npm ci`; the seed's pastoral fields
# are encrypted with it, and a different key would make them unreadable.
KEY_FILE="${ROOT_DIR}/.e2e-pastoral-key.local"
if [[ -z "${PASTORAL_ENCRYPTION_KEY:-}" ]]; then
  if [[ ! -s "${KEY_FILE}" ]]; then
    openssl rand -base64 32 > "${KEY_FILE}"
    echo "Created ${KEY_FILE} (test-only pastoral key for local e2e data)."
  fi
  PASTORAL_ENCRYPTION_KEY="$(cat "${KEY_FILE}")"
fi
export PASTORAL_ENCRYPTION_KEY

# The control-plane project keeps config.toml, migrations and seed.sql directly
# under supabase/control-plane/, but the CLI expects <workdir>/supabase/. Link
# them into a gitignored workdir so `--workdir` picks up the real config (ports
# 4211/4212) instead of the CLI defaults.
CONTROL_PLANE_WORKDIR="${ROOT_DIR}/node_modules/.cache/supabase-control-plane"
mkdir -p "${CONTROL_PLANE_WORKDIR}/supabase"
for item in config.toml migrations seed.sql; do
  ln -sfn "${ROOT_DIR}/supabase/control-plane/${item}" "${CONTROL_PLANE_WORKDIR}/supabase/${item}"
done

status_value() {
  # status_value <KEY> [--workdir dir]
  local key="$1"; shift
  local output
  if ! output="$(npx supabase status -o env "$@" 2>&1)"; then
    echo "npx supabase status $* failed:" >&2
    echo "${output}" >&2
    exit 1
  fi
  printf '%s\n' "${output}" | sed -n "s/^${key}=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p"
}

require_local() {
  local name="$1" value="$2"
  case "${value}" in
    http://127.0.0.1:*|http://localhost:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
    *) echo "Refusing to continue: ${name} is not local." >&2; exit 1 ;;
  esac
}

echo "==> Tenant stack"
npx supabase start >/dev/null
if [[ "${RESET}" == "true" ]]; then npx supabase db reset; fi

echo "==> Control-plane stack"
npx supabase start --workdir "${CONTROL_PLANE_WORKDIR}" >/dev/null
if [[ "${RESET}" == "true" ]]; then npx supabase db reset --workdir "${CONTROL_PLANE_WORKDIR}"; fi

TENANT_API_URL="$(status_value API_URL)"
TENANT_ANON_KEY="$(status_value ANON_KEY)"
TENANT_SERVICE_KEY="$(status_value SERVICE_ROLE_KEY)"
TENANT_DB="$(status_value DB_URL)"
# Address the control plane as localhost (the tenant stack is 127.0.0.1) so the
# two get different @supabase/ssr cookie names (sb-localhost-… vs sb-127-…),
# as two hosted projects would. Sharing one name made the app send every tenant
# session to the control-plane auth server too.
CP_API_URL="$(status_value API_URL --workdir "${CONTROL_PLANE_WORKDIR}" | sed 's#//127\.0\.0\.1:#//localhost:#')"
CP_ANON_KEY="$(status_value ANON_KEY --workdir "${CONTROL_PLANE_WORKDIR}")"
CP_SERVICE_KEY="$(status_value SERVICE_ROLE_KEY --workdir "${CONTROL_PLANE_WORKDIR}")"
CP_DB="$(status_value DB_URL --workdir "${CONTROL_PLANE_WORKDIR}")"

require_local "tenant API_URL" "${TENANT_API_URL}"
require_local "tenant DB_URL" "${TENANT_DB}"
require_local "control-plane API_URL" "${CP_API_URL}"
require_local "control-plane DB_URL" "${CP_DB}"

echo "==> Demo users"
if [[ -f "${ROOT_DIR}/.demo-credentials.local" ]]; then
  # Keep the existing password stable across re-runs.
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/.demo-credentials.local"
  set +a
fi
NEXT_PUBLIC_SUPABASE_URL="${TENANT_API_URL}" SUPABASE_SERVICE_ROLE_KEY="${TENANT_SERVICE_KEY}" \
  "${SCRIPT_DIR}/create-dev-users.sh"

echo "==> Platform admin (control plane)"
# create-dev-users.sh (re)writes the demo password; read it back.
set -a
# shellcheck disable=SC1091
source "${ROOT_DIR}/.demo-credentials.local"
set +a
ADMIN_EMAIL="$(sed -n 's/^CHURCHCORE_OPS_DEMO_ADMIN_EMAIL=\(.*\)$/\1/p' "${ROOT_DIR}/.demo-credentials.local" | tr -d '"')"
ADMIN_USER_ID="$(psql "${TENANT_DB}" -Atc "select id from auth.users where email = '${ADMIN_EMAIL}'")"
if [[ -z "${ADMIN_USER_ID}" ]]; then
  echo "Could not find ${ADMIN_EMAIL} in the tenant auth.users table." >&2
  exit 1
fi
# Signing in toward /control authenticates against the control-plane stack's
# own auth, and platform_admins rows reference its profiles -> auth.users.
# Mirror the admin there under the same user id and demo password. The create
# call reports "already registered" on re-runs; the update keeps the password
# in sync either way.
CP_AUTH_HEADERS=(-H "apikey: ${CP_SERVICE_KEY}" -H "Authorization: Bearer ${CP_SERVICE_KEY}" -H "Content-Type: application/json")
# POST reports 422 when the user already exists (re-runs); the PUT must succeed.
curl -s -o /dev/null -X POST "${CP_API_URL}/auth/v1/admin/users" "${CP_AUTH_HEADERS[@]}" \
  -d "{\"id\": \"${ADMIN_USER_ID}\", \"email\": \"${ADMIN_EMAIL}\", \"password\": \"${CHURCHCORE_OPS_DEV_PASSWORD}\", \"email_confirm\": true}"
curl -sf -o /dev/null -X PUT "${CP_API_URL}/auth/v1/admin/users/${ADMIN_USER_ID}" "${CP_AUTH_HEADERS[@]}" \
  -d "{\"password\": \"${CHURCHCORE_OPS_DEV_PASSWORD}\", \"email_confirm\": true}"
psql "${CP_DB}" -qv ON_ERROR_STOP=1 \
  -c "insert into public.profiles (id, email, full_name) values ('${ADMIN_USER_ID}', '${ADMIN_EMAIL}', 'Platform Admin') on conflict (id) do nothing" \
  -c "insert into public.platform_admins (user_id) values ('${ADMIN_USER_ID}') on conflict do nothing"

echo "==> Pastoral encryption backfill"
TENANT_SUPABASE_URL="${TENANT_API_URL}" TENANT_SUPABASE_SERVICE_ROLE_KEY="${TENANT_SERVICE_KEY}" \
  node "${ROOT_DIR}/scripts/backfill-pastoral-encryption.mjs" --apply

if [[ -n "${ENV_FILE}" ]]; then
  {
    echo "NEXT_PUBLIC_SUPABASE_URL=${TENANT_API_URL}"
    echo "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${TENANT_ANON_KEY}"
    echo "SUPABASE_SERVICE_ROLE_KEY=${TENANT_SERVICE_KEY}"
    echo "TENANT_SUPABASE_URL=${TENANT_API_URL}"
    echo "TENANT_SUPABASE_PUBLISHABLE_KEY=${TENANT_ANON_KEY}"
    echo "TENANT_SUPABASE_SERVICE_ROLE_KEY=${TENANT_SERVICE_KEY}"
    echo "TENANT_DB_URL=${TENANT_DB}"
    echo "CONTROL_PLANE_SUPABASE_URL=${CP_API_URL}"
    echo "CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY=${CP_ANON_KEY}"
    echo "CONTROL_PLANE_SUPABASE_SERVICE_ROLE_KEY=${CP_SERVICE_KEY}"
    echo "CONTROL_PLANE_DB_URL=${CP_DB}"
    echo "PASTORAL_ENCRYPTION_KEY=${PASTORAL_ENCRYPTION_KEY}"
  } >> "${ENV_FILE}"
  echo "==> App env written to ${ENV_FILE}"
fi

echo "e2e environment ready."
