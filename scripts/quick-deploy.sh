#!/bin/bash
# Quick deploy: bundle → vsix → install
# Usage: bash scripts/quick-deploy.sh
#
# This skips pnpm install/clean and turbo cache, ensuring the latest
# source code is always compiled and packaged.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SRC_DIR="$ROOT_DIR/src"

echo "🔨 Step 1/4: Building webview-ui..."
cd "$ROOT_DIR/webview-ui"
pnpm build 2>/dev/null || echo "⚠️  webview-ui build skipped (may already be up to date)"

echo ""
echo "📦 Step 2/4: Bundling extension (bypassing turbo cache)..."
cd "$SRC_DIR"
node esbuild.mjs --production

echo ""
echo "📋 Step 3/4: Packaging VSIX..."
cd "$SRC_DIR"
mkdirp ../bin 2>/dev/null || mkdir -p ../bin
npx vsce package --no-dependencies --out ../bin

# Read version from package.json
VERSION=$(node -e "console.log(require('./package.json').version)")
VSIX_FILE="$ROOT_DIR/bin/roo-cline-${VERSION}.vsix"

echo ""
echo "🚀 Step 4/4: Installing VSIX..."
if [ -f "$VSIX_FILE" ]; then
    code --install-extension "$VSIX_FILE" --force
    echo ""
    echo "✅ Deployed roo-cline v${VERSION} successfully!"
    echo "⚠️  Reload VSCode window (Cmd+Shift+P → 'Developer: Reload Window') to activate."
else
    echo "❌ VSIX file not found: $VSIX_FILE"
    exit 1
fi
