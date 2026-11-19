#!/usr/bin/env bash
# Deploys (or diffs) the production stage with the settings in
# .env.production, so no deploy can drop the domain or the AI by
# forgetting a variable. Secrets stay in SST (`sst secret set`).
#
#   pnpm deploy:prod         # sst deploy
#   pnpm deploy:prod diff    # sst diff, shows changes without applying them
set -euo pipefail

ENV_FILE=".env.production"
COMMAND="${1:-deploy}"

case "$COMMAND" in
  deploy | diff) ;;
  *)
    echo "Usage: pnpm deploy:prod [deploy|diff]" >&2
    exit 1
    ;;
esac

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.production.example and fill it in." >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a
export AWS_PROFILE="${AWS_PROFILE:-gmj}"

missing=()
for var in PORTFOLIO_DOMAIN PORTFOLIO_BUDGET_EMAIL; do
  [[ -n "${!var:-}" ]] || missing+=("$var")
done
if [[ "${PORTFOLIO_AI_ENABLED:-}" == "true" && -z "${PUBLIC_TURNSTILE_SITE_KEY:-}" ]]; then
  missing+=("PUBLIC_TURNSTILE_SITE_KEY (required when PORTFOLIO_AI_ENABLED=true)")
fi
if ((${#missing[@]})); then
  echo "Missing values in $ENV_FILE:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "Running sst $COMMAND on production (domain: $PORTFOLIO_DOMAIN, AI: ${PORTFOLIO_AI_ENABLED:-false})"
exec pnpm exec sst "$COMMAND" --stage production
