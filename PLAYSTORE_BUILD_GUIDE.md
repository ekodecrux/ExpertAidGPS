# Expert GPS Tracking - Google Play Store Build Guide

## Overview
This guide provides step-by-step instructions to build and publish the Expert GPS Tracking Android app on Google Play Store.

## App Information
- **App Name**: Expert GPS Tracking
- **Package Name**: com.expertgpstracking.app
- **Current Version**: 1.0.0
- **Version Code**: 1
- **Min SDK**: API 24 (Android 7.0)
- **Target SDK**: API 34 (Android 14)
- **Category**: Travel & Local

## Prerequisites

### Required Software
1. **Android Studio** (Latest version)
   - Download: https://developer.android.com/studio
   - Includes Android SDK, Gradle, and build tools

2. **Node.js & npm/pnpm**
   - Already installed in your project

3. **Java Development Kit (JDK)**
   - JDK 11 or higher (JDK 21 recommended)

4. **Git** (for version control)

### Google Play Developer Account
1. Create account at https://play.google.com/console
2. Pay one-time registration fee ($25 USD)
3. Complete merchant profile and tax information

## Step 1: Generate Signing Key

### Create Keystore File
```bash
# Navigate to android directory
cd android

# Generate keystore (do this once and save it securely)
keytool -genkey -v -keystore expertgps-release-key.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias expertgps-key

# You will be prompted for:
# - Keystore password (save this!)
# - Key password (save this!)
# - Your name, organization, city, state, country
```

### Save Keystore Securely
- Store `expertgps-release-key.jks` in a secure location
- **NEVER commit to Git** - add to `.gitignore`
- Create backup copies

## Step 2: Configure Signing in build.gradle

### Update android/app/build.gradle

```gradle
android {
    // ... existing config ...
    
    signingConfigs {
        release {
            storeFile file("../expertgps-release-key.jks")
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias System.getenv("KEY_ALIAS")
            keyPassword System.getenv("KEY_PASSWORD")
        }
    }
    
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

## Step 3: Build AAB (Android App Bundle)

### Using Gradle Command

```bash
# Set environment variables (replace with your actual values)
export KEYSTORE_PASSWORD="your_keystore_password"
export KEY_ALIAS="expertgps-key"
export KEY_PASSWORD="your_key_password"

# Build AAB
cd /path/to/expertaidgps-website
pnpm run build
npx cap sync android

# Navigate to Android directory
cd android

# Build AAB using Gradle
./gradlew bundleRelease

# Output: android/app/build/outputs/bundle/release/app-release.aab
```

### Using Android Studio
1. Open project in Android Studio
2. Go to: Build → Build Bundle(s) / APK(s) → Build Bundle(s)
3. Select "Release" variant
4. Provide signing key credentials
5. AAB file will be generated in `app/build/outputs/bundle/release/`

## Step 4: Test AAB Locally

### Using bundletool
```bash
# Download bundletool
wget https://github.com/google/bundletool/releases/latest/download/bundletool-all.jar

# Generate APKs from AAB
java -jar bundletool-all.jar build-apks \
  --bundle=app/build/outputs/bundle/release/app-release.aab \
  --output=app.apks \
  --ks=../expertgps-release-key.jks \
  --ks-pass=pass:your_keystore_password \
  --ks-key-alias=expertgps-key \
  --key-pass=pass:your_key_password

# Install on connected device
java -jar bundletool-all.jar install-apks --apks=app.apks
```

## Step 5: Prepare Play Store Listing

### Required Assets
1. **App Icon** (512x512 px, PNG)
   - Location: `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`

2. **Feature Graphic** (1024x500 px, PNG/JPEG)
   - Showcase app features

3. **Screenshots** (Minimum 2, Maximum 8)
   - Phone: 1080x1920 px
   - Tablet: 1440x2560 px

4. **App Description** (80 characters max)
   - "Complete fleet management and student tracking system with real-time GPS"

5. **Full Description** (4000 characters max)
   - Detailed features and benefits

6. **Release Notes**
   - "Initial release: Complete fleet management system with Driver, User, Admin, and Super Admin dashboards"

### Privacy Policy
- Create privacy policy at: https://www.privacypolicygenerator.info/
- Host on your website
- Add URL to Play Store listing

## Step 6: Upload to Play Store

1. Go to https://play.google.com/console
2. Create new app
3. Fill in app details (name, category, content rating)
4. Upload AAB file to "Production" track
5. Add store listing information (screenshots, description, etc.)
6. Set pricing (Free/Paid)
7. Configure content rating questionnaire
8. Review and submit for review

### Content Rating Questionnaire
- Answer questions about app content
- Get content rating (usually automatic)
- Takes 5-10 minutes

## Step 7: Review & Rollout

### App Review Process
- Google Play reviews all apps before publishing
- Typically takes 1-3 hours
- Check for policy violations
- May request changes

### Rollout Strategy
1. **Staged Rollout** (Recommended for first release)
   - Start with 5% of users
   - Monitor crash reports and ratings
   - Gradually increase to 100%

2. **Immediate Rollout**
   - Release to all users at once
   - Higher risk but faster availability

## Version Management

### Update App Version

For each new release:

1. **Update version in capacitor.config.ts**
```typescript
version: '1.0.1'  // Increment patch version
```

2. **Update version in android/app/build.gradle**
```gradle
versionCode 2      // Increment by 1 for each release
versionName "1.0.1" // Match capacitor.config.ts
```

3. **Rebuild and upload new AAB**
```bash
pnpm run build
npx cap sync android
cd android
./gradlew bundleRelease
```

### Version Numbering
- Format: MAJOR.MINOR.PATCH
- Example: 1.0.0 → 1.0.1 (patch) → 1.1.0 (minor) → 2.0.0 (major)
- versionCode must always increase (never decrease)

## Build Scripts

### Create build script (build-release.sh)
```bash
#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Expert GPS Tracking - Release Build${NC}"

# Check environment variables
if [ -z "$KEYSTORE_PASSWORD" ] || [ -z "$KEY_ALIAS" ] || [ -z "$KEY_PASSWORD" ]; then
    echo -e "${RED}Error: Missing environment variables${NC}"
    echo "Required: KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD"
    exit 1
fi

# Build web app
echo -e "${YELLOW}Building web app...${NC}"
pnpm run build || { echo -e "${RED}Web build failed${NC}"; exit 1; }

# Sync Capacitor
echo -e "${YELLOW}Syncing Capacitor...${NC}"
npx cap sync android || { echo -e "${RED}Capacitor sync failed${NC}"; exit 1; }

# Build AAB
echo -e "${YELLOW}Building AAB...${NC}"
cd android
./gradlew bundleRelease || { echo -e "${RED}AAB build failed${NC}"; exit 1; }

echo -e "${GREEN}Build successful!${NC}"
echo -e "${GREEN}AAB file: app/build/outputs/bundle/release/app-release.aab${NC}"
```

### Make script executable
```bash
chmod +x build-release.sh
```

### Run build
```bash
export KEYSTORE_PASSWORD="your_password"
export KEY_ALIAS="expertgps-key"
export KEY_PASSWORD="your_password"
./build-release.sh
```

## Play Store Submission Checklist

- [ ] App icon created (512x512 px)
- [ ] Feature graphic created (1024x500 px)
- [ ] Screenshots captured (minimum 2)
- [ ] App description written (80 chars)
- [ ] Full description written (4000 chars max)
- [ ] Privacy policy created and hosted
- [ ] Content rating questionnaire completed
- [ ] AAB file built and tested
- [ ] Version code incremented
- [ ] Release notes prepared
- [ ] Pricing set (Free/Paid)
- [ ] Target countries selected
- [ ] Permissions justified
- [ ] Tested on multiple devices
- [ ] No crashes or major bugs

## Troubleshooting

### Build Fails: "Keystore not found"
```bash
# Ensure keystore file exists
ls -la android/expertgps-release-key.jks

# Check environment variables
echo $KEYSTORE_PASSWORD
echo $KEY_ALIAS
echo $KEY_PASSWORD
```

### Build Fails: "Gradle not found"
```bash
# Use wrapper instead
cd android
./gradlew bundleRelease  # Uses gradlew wrapper
```

### App Rejected: "Permissions not justified"
- Add permission justifications in AndroidManifest.xml comments
- Explain why each permission is needed in app description

### App Rejected: "Privacy policy missing"
- Create privacy policy
- Host on website
- Add URL to Play Store listing

## Support & Resources

- **Android Developer Guide**: https://developer.android.com/guide
- **Play Store Console Help**: https://support.google.com/googleplay/android-developer
- **Capacitor Android Guide**: https://capacitorjs.com/docs/android
- **Gradle Documentation**: https://gradle.org/guides/

## Future Updates

### Release New Version
1. Make code changes
2. Update version numbers (capacitor.config.ts + build.gradle)
3. Increment versionCode by 1
4. Run build script
5. Upload new AAB to Play Store
6. Write release notes
7. Submit for review

### Rollout Strategy for Updates
- Use staged rollout for major updates
- Monitor crash reports
- Respond to user reviews
- Push fixes quickly if issues found

---

**Last Updated**: July 7, 2026
**App Version**: 1.0.0
**Build Status**: Ready for Play Store submission
