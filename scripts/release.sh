#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

VERSION="${1:-}"
if [[ -z "${VERSION}" ]]; then
    VERSION=$(node -p "require('./package.json').version")
fi

TAG="v${VERSION#v}"

echo "=== Preparing Release: ${TAG} ==="

# Check git status
if [[ -n "$(git status --porcelain)" ]]; then
    echo "Changes detected. Committing changes..."
    git add .
    git commit -m "chore: release ${TAG}"
fi

# Check if tag already exists
if git rev-parse "${TAG}" >/dev/null 2>&1; then
    echo "Tag ${TAG} already exists locally."
    read -p "Do you want to delete and recreate tag ${TAG}? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git tag -d "${TAG}"
    else
        echo "Aborted."
        exit 1
    fi
fi

echo "Creating tag ${TAG}..."
git tag -a "${TAG}" -m "Release ${TAG}"

echo "Pushing branch and tag to origin..."
git push origin main
git push origin "${TAG}"

echo "✓ Pushed ${TAG} to origin. GitHub Actions CI/CD will build and create the release automatically!"
echo "Check progress: gh run list --workflow=release.yml"
