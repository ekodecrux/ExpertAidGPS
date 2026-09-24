#!/usr/bin/env bash

# ExpertAidGPS Android release build helper.
#
# Required for a real Google Play upload:
#   KEYSTORE_FILE=/absolute/path/release.jks
#   KEYSTORE_PASSWORD=...
#   KEY_ALIAS=...
#   KEY_PASSWORD=...
#
# If these are omitted, Gradle uses the standard debug keystore so that the
# build can still be validated locally. That fallback is not suitable for Play.

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$PROJECT_ROOT/android"

info() { printf '\033[1;34m[ExpertAidGPS]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[ExpertAidGPS warning]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[ExpertAidGPS error]\033[0m %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || fail "Node.js is required."
command -v npm >/dev/null 2>&1 || fail "npm is required."
command -v java >/dev/null 2>&1 || fail "Java 21 JDK is required. Install a JDK, not only a JRE."

JAVA_MAJOR="$(java -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -1)"
[[ "$JAVA_MAJOR" == "21" ]] || warn "Detected Java $JAVA_MAJOR; Android builds for this project are validated with Java 21."

SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$SDK_DIR" && -f "$ANDROID_DIR/local.properties" ]]; then
  SDK_DIR="$(sed -n 's/^sdk.dir=//p' "$ANDROID_DIR/local.properties" | head -1)"
fi
[[ -n "$SDK_DIR" ]] || fail "Android SDK not configured. Set ANDROID_HOME/ANDROID_SDK_ROOT or create android/local.properties from android/local.properties.template."
[[ -d "$SDK_DIR" ]] || fail "Android SDK directory does not exist: $SDK_DIR"
printf 'sdk.dir=%s\n' "${SDK_DIR//\\/\\\\}" > "$ANDROID_DIR/local.properties"
export ANDROID_HOME="$SDK_DIR"
export ANDROID_SDK_ROOT="$SDK_DIR"

if [[ -z "${KEYSTORE_FILE:-}" && ! -f "$ANDROID_DIR/key.properties" ]]; then
  warn "No release keystore configured; Gradle will use the debug keystore for local validation only."
  warn "For Play upload, set KEYSTORE_FILE, KEYSTORE_PASSWORD, KEY_ALIAS, and KEY_PASSWORD."
else
  info "Release signing configuration detected."
fi

cd "$PROJECT_ROOT"
if [[ ! -d node_modules ]]; then
  info "Installing locked npm dependencies with npm ci"
  npm ci
fi

info "Building web app and syncing Capacitor"
npm run build:mobile

cd "$ANDROID_DIR"
info "Building release AAB"
./gradlew clean bundleRelease --no-daemon

AAB="$ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"
APK="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
[[ -f "$AAB" ]] || fail "AAB was not produced: $AAB"
info "AAB created: $AAB ($(du -h "$AAB" | cut -f1))"

info "Building release APK"
./gradlew assembleRelease --no-daemon
[[ -f "$APK" ]] || fail "APK was not produced: $APK"
info "APK created: $APK ($(du -h "$APK" | cut -f1))"

if [[ -z "${KEYSTORE_FILE:-}" && ! -f "$ANDROID_DIR/key.properties" ]]; then
  warn "This build uses debug signing and must not be uploaded to Google Play."
else
  info "Signed release artifacts are ready for inspection and Play Console upload."
fi
