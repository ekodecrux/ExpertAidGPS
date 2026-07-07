#!/bin/bash

# Expert GPS Tracking - Automated Release Build Script
# This script builds the Android App Bundle (AAB) for Google Play Store submission

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$PROJECT_ROOT/android"
BUILD_OUTPUT="$ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"

# Functions
print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Start
print_header "Expert GPS Tracking - Release Build"

# Step 1: Check prerequisites
print_header "Step 1: Checking Prerequisites"

if ! command -v node &> /dev/null; then
    print_error "Node.js not found"
    exit 1
fi
print_success "Node.js found: $(node --version)"

if ! command -v pnpm &> /dev/null; then
    print_error "pnpm not found"
    exit 1
fi
print_success "pnpm found: $(pnpm --version)"

if ! command -v java &> /dev/null; then
    print_error "Java not found"
    exit 1
fi
print_success "Java found: $(java -version 2>&1 | head -1)"

# Step 2: Check environment variables
print_header "Step 2: Checking Signing Credentials"

if [ -z "$KEYSTORE_PASSWORD" ]; then
    print_warning "KEYSTORE_PASSWORD not set"
    read -sp "Enter keystore password: " KEYSTORE_PASSWORD
    echo
fi

if [ -z "$KEY_ALIAS" ]; then
    print_warning "KEY_ALIAS not set"
    read -p "Enter key alias: " KEY_ALIAS
fi

if [ -z "$KEY_PASSWORD" ]; then
    print_warning "KEY_PASSWORD not set"
    read -sp "Enter key password: " KEY_PASSWORD
    echo
fi

# Step 3: Build web app
print_header "Step 3: Building Web App"

cd "$PROJECT_ROOT"
print_warning "Running: pnpm run build"
pnpm run build || {
    print_error "Web build failed"
    exit 1
}
print_success "Web app built successfully"

# Step 4: Sync Capacitor
print_header "Step 4: Syncing Capacitor"

print_warning "Running: npx cap sync android"
npx cap sync android || {
    print_error "Capacitor sync failed"
    exit 1
}
print_success "Capacitor synced successfully"

# Step 5: Build AAB
print_header "Step 5: Building Android App Bundle (AAB)"

cd "$ANDROID_DIR"

# Export signing credentials
export KEYSTORE_PASSWORD
export KEY_ALIAS
export KEY_PASSWORD

print_warning "Running: ./gradlew bundleRelease"
./gradlew bundleRelease || {
    print_error "AAB build failed"
    exit 1
}
print_success "AAB built successfully"

# Step 6: Verify output
print_header "Step 6: Verifying Build Output"

if [ -f "$BUILD_OUTPUT" ]; then
    SIZE=$(du -h "$BUILD_OUTPUT" | cut -f1)
    print_success "AAB file created: $BUILD_OUTPUT"
    print_success "File size: $SIZE"
else
    print_error "AAB file not found at expected location"
    exit 1
fi

# Step 7: Summary
print_header "Build Complete!"

echo ""
echo -e "${GREEN}Your app is ready for Play Store submission!${NC}"
echo ""
echo "Next steps:"
echo "1. Go to https://play.google.com/console"
echo "2. Create a new app or select existing app"
echo "3. Upload the AAB file:"
echo "   $BUILD_OUTPUT"
echo ""
echo "4. Add app store listing:"
echo "   - Screenshots"
echo "   - Description"
echo "   - Privacy policy"
echo "   - Content rating"
echo ""
echo "5. Submit for review"
echo ""
echo "For detailed instructions, see: PLAYSTORE_BUILD_GUIDE.md"
echo ""

# Optional: Create backup
read -p "Create backup of AAB file? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    BACKUP_DIR="$PROJECT_ROOT/builds/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    cp "$BUILD_OUTPUT" "$BACKUP_DIR/"
    print_success "Backup created: $BACKUP_DIR"
fi

print_success "Build script completed successfully!"
