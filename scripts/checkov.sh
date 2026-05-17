#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TERRAFORM_DIR="${CHECKOV_TERRAFORM_DIR:-terraform}"

if [[ "$TERRAFORM_DIR" != /* ]]; then
    TERRAFORM_DIR="${REPO_ROOT}/${TERRAFORM_DIR}"
fi

if command -v checkov >/dev/null 2>&1; then
    CHECKOV_CMD="$(command -v checkov)"
else
    PYTHON_USER_BASE="$(python3 -m site --user-base 2>/dev/null || true)"
    CHECKOV_CMD="${PYTHON_USER_BASE}/bin/checkov"
fi

if [ ! -x "$CHECKOV_CMD" ]; then
    echo "Error: checkov is not installed." >&2
    echo "Install it with: pip install checkov" >&2
    echo "If it is already installed, add the Python user bin directory to PATH:" >&2
    echo '  export PATH="$HOME/.local/bin:$PATH"' >&2
    exit 127
fi

if [ ! -d "$TERRAFORM_DIR" ]; then
    echo "Error: Terraform directory not found: $TERRAFORM_DIR" >&2
    exit 1
fi

echo "Running Checkov Terraform scan: $TERRAFORM_DIR"

"$CHECKOV_CMD" \
    --directory "$TERRAFORM_DIR" \
    --framework terraform \
    --skip-path '/\.terraform/' \
    "$@"
