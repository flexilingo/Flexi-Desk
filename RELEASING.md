# Release Process

This document describes how to build, sign, and publish a new FlexiDesk release.

## Overview

| Step | Who | What |
| :--- | :---: | :--- |
| 1. Prepare changes | Dev | Code, `cargo check`, commit, push |
| 2. Bump version | Dev | Update `tauri.conf.json`, commit, push |
| 3. Create GitHub release | Dev | `gh release create vX.X.X` — triggers CI |
| 4. Build macOS locally | Dev (local Mac) | Signed + notarized universal DMG |
| 5. Upload macOS DMG | Dev | `gh release upload` |
| 6. CI builds Linux & Windows | GitHub Actions | Auto-triggered by the release tag |

---

## Step 1 — Prepare Changes

```bash
# Make your changes, then verify Rust compiles
cd src-tauri && cargo check

# Commit and push
git add <files>
git commit -m "feat: ..."
git push
```

## Step 2 — Bump Version

Edit `src-tauri/tauri.conf.json`:

```json
{
  "version": "0.X.Y"
}
```

```bash
git add src-tauri/tauri.conf.json
git commit -m "chore: bump version to 0.X.Y"
git push
```

## Step 3 — Create GitHub Release

```bash
gh release create vX.X.X \
  --title "vX.X.X — Short Title Here" \
  --notes "$(cat <<'EOF'
## What's New in vX.X.X

### Category
- Change 1
- Change 2

## Bug Fixes
- Fix 1
EOF
)"
```

> Creating the release also creates the tag on GitHub, which **automatically triggers**
> the CI `Release` workflow to build Linux and Windows installers.

## Step 4 — Build macOS Locally (Signed + Notarized)

Requires the **Developer ID Application** certificate in your Keychain.
Check available identities:

```bash
security find-identity -v -p codesigning
```

Then build:

```bash
cd /path/to/flexi-lingo-desk

APPLE_SIGNING_IDENTITY="Developer ID Application: Fatemeh Fakharan (3397B77V2Z)" \
  pnpm tauri build --target universal-apple-darwin
```

This produces a **universal binary** (Intel + Apple Silicon) that is:
- Code signed with the Developer ID certificate
- Notarized by Apple (handled automatically by Tauri)
- Stapled

Output path:
```
src-tauri/target/universal-apple-darwin/release/bundle/dmg/FlexiDesk_X.X.X_universal.dmg
```

## Step 5 — Upload macOS DMG to Release

```bash
gh release upload vX.X.X \
  "src-tauri/target/universal-apple-darwin/release/bundle/dmg/FlexiDesk_X.X.X_universal.dmg" \
  --clobber
```

## Step 6 — Verify Release Assets

```bash
gh release view vX.X.X --json assets --jq '.assets[].name'
```

Expected output:

```
FlexiDesk_X.X.X_universal.dmg          ← macOS (local, signed + notarized)
FlexiDesk_X.X.X_x64-setup.exe          ← Windows (CI)
FlexiDesk_X.X.X_x64_en-US.msi          ← Windows (CI)
FlexiDesk_X.X.X_amd64.AppImage         ← Linux (CI)
FlexiDesk_X.X.X_amd64.deb              ← Linux (CI)
FlexiDesk-X.X.X-1.x86_64.rpm           ← Linux (CI)
```

---

## Notes

- **Version format**: `MAJOR.MINOR.PATCH` — bump PATCH for fixes, MINOR for features.
- **macOS signing identity**: `Developer ID Application: Fatemeh Fakharan (3397B77V2Z)` — requires Keychain access on the build machine.
- **Notarization**: handled automatically by Tauri when `APPLE_SIGNING_IDENTITY` is set. No separate `xcrun notarytool` step needed.
- **CI**: Linux and Windows are built by `.github/workflows/release.yml` which triggers on any `v*` tag push.
- **macOS is NOT built by CI** — always build and upload macOS locally to ensure proper signing.
