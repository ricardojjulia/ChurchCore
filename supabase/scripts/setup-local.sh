#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  fi
}

cd "${ROOT_DIR}"

echo "Starting local Supabase..."
npx supabase start

load_env_file "${ROOT_DIR}/.env"
load_env_file "${ROOT_DIR}/.env.local"

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo ""
  echo "ERROR: SUPABASE_SERVICE_ROLE_KEY is missing."
  echo "Populate .env.local using values from:"
  echo "  npx supabase status --output env"
  exit 1
fi

echo ""
echo "Resetting local database..."
npx supabase db reset

echo ""
echo "Creating demo users and seeded data..."
"${SCRIPT_DIR}/create-dev-users.sh"

echo ""
echo "Local setup complete."
echo "If needed, read the generated credentials in:"
echo "  ${ROOT_DIR}/.demo-credentials.local"
