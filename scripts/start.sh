#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

EXE_PATH="${ROOT_DIR}/dist/Plugman-win32-x64/Plugman.exe"

if [ ! -f "${EXE_PATH}" ]; then
    echo "Plugman.exe not found. Running build first..."
    bash "${SCRIPT_DIR}/build.sh"
fi

echo "Launching Plugman.exe..."
if command -v cmd.exe >/dev/null 2>&1; then
    WIN_PATH="$(wslpath -w "${EXE_PATH}" 2>/dev/null || echo "${EXE_PATH}")"
    cmd.exe /c start "" "${WIN_PATH}" 2>/dev/null || "${EXE_PATH}"
else
    echo "Executable is at: ${EXE_PATH}"
fi
