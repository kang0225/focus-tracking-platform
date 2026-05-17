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
    echo "오류: checkov가 설치되어 있지 않습니다." >&2
    echo "설치 명령: pip install checkov" >&2
    echo "이미 설치했다면 Python 사용자 bin 디렉터리를 PATH에 추가하세요:" >&2
    echo '  export PATH="$HOME/.local/bin:$PATH"' >&2
    exit 127
fi

if [ ! -d "$TERRAFORM_DIR" ]; then
    echo "오류: Terraform 디렉터리를 찾을 수 없습니다: $TERRAFORM_DIR" >&2
    exit 1
fi

echo "Checkov Terraform 검사를 실행합니다: $TERRAFORM_DIR"

"$CHECKOV_CMD" \
    --directory "$TERRAFORM_DIR" \
    --framework terraform \
    --skip-path '/\.terraform/' \
    "$@"
