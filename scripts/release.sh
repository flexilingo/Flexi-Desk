#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# macOS code signing + notarization
# Set these env vars in your shell profile (~/.zshrc):
#   export APPLE_SIGNING_IDENTITY="Developer ID Application: ..."
#   export APPLE_ID="your@email.com"
#   export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"
#   export APPLE_TEAM_ID="XXXXXXXXXX"
for VAR in APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
  if [ -z "${!VAR}" ]; then
    echo -e "${RED}Missing env var: ${VAR}${NC}"
    echo -e "${YELLOW}Set it in ~/.zshrc or export before running this script${NC}"
    exit 1
  fi
done

# Get version argument or prompt
VERSION=$1
if [ -z "$VERSION" ]; then
  CURRENT=$(grep '"version"' package.json | head -1 | sed 's/.*"\([0-9.]*\)".*/\1/')
  echo -e "${YELLOW}Current version: ${CURRENT}${NC}"
  read -p "New version (e.g. 0.5.0): " VERSION
fi

if [ -z "$VERSION" ]; then
  echo -e "${RED}Version required${NC}"
  exit 1
fi

echo -e "${GREEN}=== FlexiDesk Release v${VERSION} ===${NC}"

# Step 1: Update version in all files
echo -e "${YELLOW}[1/7] Updating version to ${VERSION}...${NC}"
sed -i '' "s/\"version\": \"[0-9.]*\"/\"version\": \"${VERSION}\"/" package.json
sed -i '' "s/\"version\": \"[0-9.]*\"/\"version\": \"${VERSION}\"/" src-tauri/tauri.conf.json
sed -i '' "s/^version = \"[0-9.]*\"/version = \"${VERSION}\"/" src-tauri/Cargo.toml

# Step 2: Run tests
echo -e "${YELLOW}[2/7] Running tests...${NC}"
pnpm test || { echo -e "${RED}Tests failed!${NC}"; exit 1; }

# Step 3: Cargo check
echo -e "${YELLOW}[3/7] Checking Rust code...${NC}"
cd src-tauri && cargo check && cd ..

# Step 4: Build signed macOS universal binary
echo -e "${YELLOW}[4/7] Building signed macOS universal binary...${NC}"
pnpm tauri build --target universal-apple-darwin

# Step 5: Upload macOS DMG to release (create draft)
echo -e "${YELLOW}[5/7] Creating GitHub Release with macOS build...${NC}"
DMG_FILE=$(find src-tauri/target/universal-apple-darwin/release/bundle -name "*.dmg" 2>/dev/null | head -1)

RELEASE_NOTES="## FlexiDesk v${VERSION}

### Downloads
- **macOS** (Universal - Intel + Apple Silicon): \`.dmg\` file
- **Windows**: \`.msi\` installer
- **Linux**: \`.deb\` / \`.AppImage\`

### Installation
- **macOS**: Download \`.dmg\`, drag to Applications
- **Windows**: Download \`.msi\`, run installer
- **Linux**: Download \`.deb\` or \`.AppImage\`"

# Step 6: Commit, tag, push (triggers GitHub Actions for Windows + Linux)
echo -e "${YELLOW}[6/7] Committing and pushing (triggers Windows + Linux builds)...${NC}"
git add -A
git commit -m "release: v${VERSION}"
git tag "v${VERSION}"
git push origin main --tags

# Step 7: Create release with macOS DMG attached
echo -e "${YELLOW}[7/7] Uploading macOS DMG to release...${NC}"

# Wait briefly for GitHub Actions to create the release first
sleep 5

# Check if release was created by GitHub Actions
if gh release view "v${VERSION}" &>/dev/null; then
  # Release exists (created by CI), upload macOS DMG to it
  if [ -n "$DMG_FILE" ]; then
    gh release upload "v${VERSION}" "$DMG_FILE" --clobber
    echo -e "${GREEN}macOS DMG uploaded to existing release${NC}"
  fi
  # Update release notes
  gh release edit "v${VERSION}" --notes "$RELEASE_NOTES"
else
  # Release doesn't exist yet, create it with macOS DMG
  if [ -n "$DMG_FILE" ]; then
    gh release create "v${VERSION}" "$DMG_FILE" \
      --title "FlexiDesk v${VERSION}" \
      --notes "$RELEASE_NOTES"
  else
    gh release create "v${VERSION}" \
      --title "FlexiDesk v${VERSION}" \
      --notes "$RELEASE_NOTES"
  fi
fi

echo ""
echo -e "${GREEN}=== Release v${VERSION} ===${NC}"
echo -e "${GREEN}macOS: Uploaded (signed)${NC}"
echo -e "${YELLOW}Windows + Linux: Building via GitHub Actions...${NC}"
echo -e "Check progress: https://github.com/flexilingo/Flexi-Desk/actions"
echo ""
echo -e "${GREEN}=== Done! ===${NC}"
