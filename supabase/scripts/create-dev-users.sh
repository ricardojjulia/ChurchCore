#!/usr/bin/env bash
# ============================================================
# create-dev-users.sh
# Creates local development auth users via the Supabase Admin API,
# then reseeds the database.
#
# Usage: ./supabase/scripts/create-dev-users.sh
#
# Run this AFTER: npx supabase db reset
# (db reset wipes auth.users; this script recreates them and seeds)
# ============================================================

set -e

SUPABASE_URL="http://127.0.0.1:54321"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
DEFAULT_PASSWORD="Password123!"

create_user() {
  local email="$1"
  local result
  result=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/admin/users" \
    -H "apikey: ${SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"${email}\", \"password\": \"${DEFAULT_PASSWORD}\", \"email_confirm\": true}")

  local id
  id=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','ERROR: ' + str(d.get('msg', d.get('error', 'unknown')))))" 2>/dev/null || echo "ERROR: parse failed")

  if [[ "$id" == ERROR* ]]; then
    echo "  ⚠  ${email}: ${id}"
  else
    echo "  ✓  ${email} → ${id}"
  fi
}

echo ""
echo "Creating dev auth users..."
create_user "sarah@churchforge.app"
create_user "david@graceharbor.church"

echo ""
echo "Running seed..."
npx supabase db query --file "$(dirname "$0")/../seed.sql" 2>&1 | grep -E "NOTICE|ERROR|error" || true

echo ""
echo "Done. Local dev accounts ready:"
echo "  sarah@churchforge.app    / ${DEFAULT_PASSWORD}  (church-admin + platform-admin)"
echo "  david@graceharbor.church / ${DEFAULT_PASSWORD}  (member)"
echo ""
echo "App:      http://localhost:3000/sign-in"
echo "Studio:   http://127.0.0.1:54323"
echo "Mailpit:  http://127.0.0.1:54324"
