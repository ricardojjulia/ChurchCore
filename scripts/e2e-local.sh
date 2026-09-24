#!/usr/bin/env bash
# Runs the e2e suite locally exactly the way CI does: both local Supabase
# stacks, the same dummy secrets, a production build, and `next start`.
#
#   npm run test:e2e:local                      # whole suite
#   npm run test:e2e:local -- tests/e2e/api-cron.spec.ts --workers=4
#
# Extra arguments go to `playwright test`. Nothing here talks to a hosted
# project: setup-e2e.sh refuses non-local stacks, the exported local values
# override .env.local (real process env wins over .env files in Next.js), and
# the Playwright env guard aborts if any Supabase URL is not local.

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "${ROOT_DIR}"

# Same dummy values as the CI e2e job. Local-only; not real credentials.
export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:4200}"
export NEXT_PUBLIC_DEMO_MODE=true
export NEXT_PUBLIC_DEMO_VERSION=local-e2e
export CRON_SECRET=local-e2e-cron-secret
export UNSUBSCRIBE_SECRET=local-e2e-unsubscribe-secret
export STRIPE_WEBHOOK_SECRET=whsec_local_e2e_stripe
export SENDGRID_WEBHOOK_VERIFICATION_KEY=local-e2e-sendgrid-verification-key
export TWILIO_AUTH_TOKEN=local-e2e-twilio-auth-token
export RESEND_WEBHOOK_SECRET=whsec_local_e2e_resend
# Pastoral fields in the local seed are encrypted with this key, so it must stay
# the same across runs. It's generated once and kept in a gitignored cache file;
# nothing real is ever encrypted with it.
KEY_FILE="${ROOT_DIR}/node_modules/.cache/e2e-pastoral-encryption.key"
if [[ -z "${E2E_PASTORAL_ENCRYPTION_KEY:-}" && ! -s "${KEY_FILE}" ]]; then
  mkdir -p "$(dirname "${KEY_FILE}")"
  openssl rand -base64 32 > "${KEY_FILE}"
fi
export PASTORAL_ENCRYPTION_KEY="${E2E_PASTORAL_ENCRYPTION_KEY:-$(cat "${KEY_FILE}")}"

# Provider API keys stay empty so every provider runs in stub mode, even if a
# developer has real keys in .env.local.
export SENDGRID_API_KEY="" TWILIO_ACCOUNT_SID="" RESEND_API_KEY="" STRIPE_SECRET_KEY="" ANTHROPIC_API_KEY=""
export SENTRY_DSN="" NEXT_PUBLIC_SENTRY_DSN=""

ENV_FILE="$(mktemp)"
trap 'rm -f "${ENV_FILE}"' EXIT
./supabase/scripts/setup-e2e.sh --env-file "${ENV_FILE}"
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
# shellcheck disable=SC1091
source .demo-credentials.local
set +a

npm run build
npm run check:server-reference-manifest
E2E_SERVER=start npx playwright test "$@"
