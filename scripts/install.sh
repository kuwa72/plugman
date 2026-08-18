#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

# ビルド済みバイナリの確認
DIST_DIR="${ROOT_DIR}/dist/Plugman-win32-x64"
if [ ! -f "${DIST_DIR}/Plugman.exe" ]; then
    echo "=== Building Plugman first ==="
    bash "${SCRIPT_DIR}/build.sh"
fi

# Windows 側のインストール先
USER_DIR="/mnt/c/Users/ykuwa"
INSTALL_DIR="${USER_DIR}/AppData/Local/Programs/Plugman"
START_MENU_DIR="${USER_DIR}/AppData/Roaming/Microsoft/Windows/Start Menu/Programs"
DESKTOP_DIR="${USER_DIR}/OneDrive/デスクトップ"

echo "=== [1/3] Copying files to ${INSTALL_DIR} ==="
mkdir -p "${INSTALL_DIR}"
# rsync または cp で最新ファイルをコピー
cp -r "${DIST_DIR}"/* "${INSTALL_DIR}/"

echo "✓ Copied application files to ${INSTALL_DIR}"

echo "=== [2/3] Creating Windows shortcuts ==="
TARGET_WIN_EXE="C:\\Users\\ykuwa\\AppData\\Local\\Programs\\Plugman\\Plugman.exe"
TARGET_WIN_DIR="C:\\Users\\ykuwa\\AppData\\Local\\Programs\\Plugman"

# スタートメニュー
if [ -d "${START_MENU_DIR}" ]; then
    python3 "${SCRIPT_DIR}/create_shortcut.py" "${TARGET_WIN_EXE}" "${START_MENU_DIR}/Plugman.lnk" "${TARGET_WIN_DIR}" "Plugman - VST Plugin Manager"
fi

# デスクトップ
if [ -d "${DESKTOP_DIR}" ]; then
    python3 "${SCRIPT_DIR}/create_shortcut.py" "${TARGET_WIN_EXE}" "${DESKTOP_DIR}/Plugman.lnk" "${TARGET_WIN_DIR}" "Plugman - VST Plugin Manager"
fi

echo "=== [3/3] Installation completed successfully! ==="
echo "Install Location: C:\\Users\\ykuwa\\AppData\\Local\\Programs\\Plugman\\Plugman.exe"
echo "Start Menu: ${START_MENU_DIR}/Plugman.lnk"
if [ -d "${DESKTOP_DIR}" ]; then
    echo "Desktop: ${DESKTOP_DIR}/Plugman.lnk"
fi
