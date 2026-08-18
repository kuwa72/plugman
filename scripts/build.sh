#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

echo "=== [1/3] Preparing directories ==="
mkdir -p bin dist

echo "=== [2/3] Compiling vst_scanner.exe ==="
if command -v x86_64-w64-mingw32-g++ >/dev/null 2>&1; then
    x86_64-w64-mingw32-g++ vst_scanner.cpp -o bin/vst_scanner.exe -municode -static -O2
    if command -v x86_64-w64-mingw32-strip >/dev/null 2>&1; then
        x86_64-w64-mingw32-strip bin/vst_scanner.exe
    fi
    echo "✓ vst_scanner.exe built successfully"
else
    echo "⚠ x86_64-w64-mingw32-g++ not found, skipping C++ scanner build"
fi

echo "=== [3/3] Packaging Electron application ==="
npm run build:electron

echo "=== Build completed! ==="
echo "Artifact: ${ROOT_DIR}/dist/Plugman-win32-x64/Plugman.exe"

if [[ "${1:-}" == "--zip" ]] || [[ "${ZIP_OUTPUT:-}" == "1" ]]; then
    echo "=== [Extra] Creating ZIP archive ==="
    ZIP_NAME="Plugman-win32-x64.zip"
    if command -v zip >/dev/null 2>&1; then
        (cd dist && zip -r -9 "../${ZIP_NAME}" Plugman-win32-x64)
    elif command -v python3 >/dev/null 2>&1; then
        python3 -c "import shutil, os; shutil.make_archive(os.path.join('${ROOT_DIR}', 'Plugman-win32-x64'), 'zip', os.path.join('${ROOT_DIR}', 'dist'), 'Plugman-win32-x64')"
    else
        echo "⚠ Neither zip nor python3 found, skipping zip creation"
    fi
    if [[ -f "${ROOT_DIR}/${ZIP_NAME}" ]]; then
        echo "✓ Archive created: ${ROOT_DIR}/${ZIP_NAME}"
    fi
fi

