#!/usr/bin/env bash
# Usage: ./scripts/bump.sh 0.0.3
# Updates version in all config files, commits, and creates a git tag.
set -euo pipefail

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  CURRENT=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*: *"//;s/".*//')
  echo "Current version: $CURRENT"
  echo "Usage: $0 <version>  (e.g., $0 0.0.3)"
  exit 1
fi

# Strip leading 'v' if provided
VERSION="${VERSION#v}"

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

echo "Bumping to v${VERSION}..."

# 1. package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" package.json

# 2. tauri.conf.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" src-tauri/tauri.conf.json

# 3. Cargo.toml (only the package version line near the top)
sed -i '' "s/^version = \"[^\"]*\"/version = \"${VERSION}\"/" src-tauri/Cargo.toml

# 4. Update Cargo.lock
(cd src-tauri && cargo update -p skillshare-app --precise "${VERSION}" 2>/dev/null || cargo generate-lockfile 2>/dev/null || true)

echo "Updated:"
grep '"version"' package.json | head -1
grep '"version"' src-tauri/tauri.conf.json | head -1
grep '^version' src-tauri/Cargo.toml | head -1

# 5. Commit and tag
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: bump version to ${VERSION}"
git tag "v${VERSION}"

echo ""
echo "Done! Run 'git push && git push --tags' to trigger the release."
