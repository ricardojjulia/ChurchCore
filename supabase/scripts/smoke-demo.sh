#!/usr/bin/env bash

set -euo pipefail

MODE="${1:-preview}"
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
COOKIE_JAR="$(mktemp)"
HTML_FILE="$(mktemp)"
LOGIN_HEADERS="$(mktemp)"

cleanup() {
  rm -f "${COOKIE_JAR}" "${HTML_FILE}" "${LOGIN_HEADERS}"
}
trap cleanup EXIT

load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  fi
}

check_http_ok() {
  local route="$1"
  local code
  code="$(curl -sS -o /dev/null -w "%{http_code}" "${APP_URL}${route}")"
  if [[ "${code}" != "200" && "${code}" != "307" && "${code}" != "303" ]]; then
    echo "Smoke check failed for ${route}: HTTP ${code}"
    exit 1
  fi
  echo "OK ${route} (${code})"
}

require_contains() {
  local route="$1"
  local needle="$2"
  local response
  response="$(curl -sS -L -b "${COOKIE_JAR}" "${APP_URL}${route}")"
  if [[ "${response}" != *"${needle}"* ]]; then
    echo "Smoke check failed for ${route}: missing expected text '${needle}'"
    exit 1
  fi
  if [[ "${response}" == *"Application error"* ]]; then
    echo "Smoke check failed for ${route}: application error detected"
    exit 1
  fi
  echo "OK ${route}"
}

load_env_file "${ROOT_DIR}/.env"
load_env_file "${ROOT_DIR}/.env.local"
load_env_file "${ROOT_DIR}/.demo-credentials.local"

APP_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
APP_URL="${APP_URL%/}"

echo "Running ${MODE} smoke checks against ${APP_URL}"

case "${MODE}" in
  preview)
    check_http_ok "/"
    check_http_ok "/sign-in"
    check_http_ok "/portal"
    check_http_ok "/plan"
    ;;
  local)
    : "${CHURCHFORGE_DEMO_ADMIN_EMAIL:?Run ./supabase/scripts/create-dev-users.sh first.}"
    : "${CHURCHFORGE_DEV_PASSWORD:?Run ./supabase/scripts/create-dev-users.sh first.}"

    curl -sS -c "${COOKIE_JAR}" "${APP_URL}/sign-in" > "${HTML_FILE}"
    ACTION_ID="$(
      python3 - "${HTML_FILE}" <<'PY'
import re
import sys

html = open(sys.argv[1], encoding="utf-8").read()
match = re.search(r'name="(\$ACTION_ID_[^"]+)"', html)
print(match.group(1) if match else "")
PY
    )"

    if [[ -z "${ACTION_ID}" ]]; then
      echo "Smoke check failed: could not find sign-in server action."
      exit 1
    fi

    curl -sS -i -c "${COOKIE_JAR}" -b "${COOKIE_JAR}" \
      -X POST "${APP_URL}/sign-in" \
      -F "${ACTION_ID}=" \
      -F "redirectTo=/control" \
      -F "email=${CHURCHFORGE_DEMO_ADMIN_EMAIL}" \
      -F "password=${CHURCHFORGE_DEV_PASSWORD}" \
      -F "intent=sign-in" > "${LOGIN_HEADERS}"

    if ! grep -q " 303 " "${LOGIN_HEADERS}"; then
      echo "Smoke check failed: sign-in did not redirect successfully."
      cat "${LOGIN_HEADERS}"
      exit 1
    fi

    APP_CONTEXT="$(
      python3 - <<'PY'
import urllib.parse

value = '{"kind":"church","churchId":"11111111-0000-0000-0000-000000000001","roleId":"church-admin","source":"impersonation"}'
print(urllib.parse.quote(value, safe=''))
PY
    )"
    printf '#HttpOnly_localhost\tFALSE\t/\tFALSE\t0\tchurchforge_app_context\t%s\n' "${APP_CONTEXT}" >> "${COOKIE_JAR}"

    require_contains "/control" "ChurchForge"
    require_contains "/app/church-admin/children/dashboard" "Children"
    require_contains "/app/church-admin/children/services" "Service"
    require_contains "/app/calendar" "Calendar"
    ;;
  *)
    echo "Usage: $0 [preview|local]"
    exit 1
    ;;
esac

echo "Smoke checks passed."
