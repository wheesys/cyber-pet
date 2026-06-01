#!/usr/bin/env bash
# Cyber Pet Release Script
# 用法: ./scripts/release.sh <version>
# 示例: ./scripts/release.sh v0.1.0

set -euo pipefail

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 v0.1.0"
  exit 1
fi

echo "🏗️  Building Cyber Pet $VERSION..."

cd "$(dirname "$0")/../cyber-pet-desktop"

# 1. 运行所有测试
echo "📋 Running tests..."
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings && cd ..
npx vitest --run
npx tsc --noEmit
npx eslint src/ --max-warnings 0

# 2. 构建
echo "🔨 Building release..."
pnpm tauri build --bundles deb

# 3. 收集产物
cd src-tauri/target/release
echo ""
echo "=== Release Artifacts ==="
echo "Binary: $(ls -lh cyber-pet-desktop | awk '{print $5}')"
echo "DEB:    $(ls -lh bundle/deb/cyber-pet-desktop_*_amd64.deb 2>/dev/null | awk '{print $5}')"
echo ""
echo "📦 Release files:"
echo "  - Binary: $(realpath cyber-pet-desktop)"
echo "  - DEB:    $(realpath bundle/deb/cyber-pet-desktop_*_amd64.deb 2>/dev/null || echo 'not built')"
echo ""
echo "✅ Build complete. Upload these files to GitHub Release:"
echo "   gh release create $VERSION \\"
echo "     --title '$VERSION - Cyber Pet MVP' \\"
echo "     --notes-file ../../CHANGELOG.md \\"
echo "     cyber-pet-desktop \\"
echo "     bundle/deb/cyber-pet-desktop_*_amd64.deb"
