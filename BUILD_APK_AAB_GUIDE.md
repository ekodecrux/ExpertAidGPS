# ExpertAidGPS - Complete APK & AAB Build Guide

This guide provides step-by-step instructions to build both APK and AAB files for Google Play Store submission.

## Prerequisites

Before you start, ensure you have:
- ✅ JDK 11 or higher installed
- ✅ Android SDK installed (API level 34)
- ✅ Gradle installed
- ✅ `key.properties` file created in `android/` directory
- ✅ JKS keystore file (.jks) created
- ✅ Git repository cloned locally

---

## Step 1: Verify Your Setup

### 1.1 Check key.properties Location
```bash
cd android
ls -la key.properties
```

**Expected output:**
```
-rw-r--r-- 1 user group 200 Jul 8 12:00 key.properties
```

### 1.2 Verify key.properties Content
```bash
cat android/key.properties
```

**Expected format:**
```properties
storeFile=path/to/your/keystore.jks
storePassword=your_store_password
keyAlias=your_key_alias
keyPassword=your_key_password
```

### 1.3 Check JKS Keystore File
```bash
ls -la android/keystore.jks
# or wherever you placed your .jks file
```

### 1.4 Verify Android Configuration
```bash
# Check package name
grep applicationId android/app/build.gradle

# Check version
grep versionCode android/app/build.gradle
grep versionName android/app/build.gradle
```

**Expected output:**
```
applicationId "com.expertaid.gpstracking"
versionCode 1
versionName "1.0.0"
```

---

## Step 2: Build the Web App (Required First)

The Android app wraps the web app, so you must build the web app first.

### 2.1 Install Dependencies
```bash
cd /path/to/expertaidgps-website
npm install
# or if using pnpm
pnpm install
```

### 2.2 Build Web App
```bash
npm run build
# or
pnpm build
```

**Expected output:**
```
✓ built in 45.23s
```

This creates the `dist/` folder with the compiled web app.

---

## Step 3: Sync Capacitor (Mobile Bridge)

Capacitor bridges the web app with native Android code.

### 3.1 Install Capacitor CLI
```bash
npm install -g @capacitor/cli
# or
pnpm add -g @capacitor/cli
```

### 3.2 Sync Web App to Android
```bash
npx cap sync android
```

**Expected output:**
```
✓ Synced web app to Android
✓ Updated native code
```

This copies the web app build to the Android project.

---

## Step 4: Build APK File (For Testing)

### 4.1 Navigate to Android Directory
```bash
cd android
```

### 4.2 Build Debug APK (For Testing)
```bash
./gradlew assembleDebug
```

**Build time:** ~3-5 minutes

**Output location:**
```
android/app/build/outputs/apk/debug/app-debug.apk
```

### 4.3 Build Release APK (For Play Store)
```bash
./gradlew assembleRelease
```

**Build time:** ~5-10 minutes

**Output location:**
```
android/app/build/outputs/apk/release/app-release.apk
```

**Troubleshooting:**
- If build fails with "keystore not found", verify `key.properties` path is correct
- If build fails with "invalid password", check your keystore password in `key.properties`

---

## Step 5: Build AAB File (For Google Play Store)

The AAB (Android App Bundle) is required for Google Play Store submission.

### 5.1 Build Release AAB
```bash
./gradlew bundleRelease
```

**Build time:** ~5-10 minutes

**Output location:**
```
android/app/build/outputs/bundle/release/app-release.aab
```

### 5.2 Verify AAB File
```bash
ls -lh android/app/build/outputs/bundle/release/app-release.aab
```

**Expected output:**
```
-rw-r--r-- 1 user group 25M Jul 8 12:30 app-release.aab
```

---

## Step 6: Using the Automated Build Script

We've provided an automated build script for convenience:

### 6.1 Make Script Executable
```bash
cd /path/to/expertaidgps-website
chmod +x build-release.sh
```

### 6.2 Run Automated Build
```bash
./build-release.sh
```

**This script will:**
1. ✅ Check prerequisites
2. ✅ Build the web app
3. ✅ Sync Capacitor
4. ✅ Build the release AAB
5. ✅ Verify the output
6. ✅ Display the AAB file location

**Expected output:**
```
========================================
Building Expert GPS Tracking App
========================================
✓ Checking prerequisites...
✓ Building web app...
✓ Syncing Capacitor...
✓ Building AAB...
✓ Build successful!
AAB file: android/app/build/outputs/bundle/release/app-release.aab
```

---

## Step 7: Verify Build Outputs

### 7.1 Check APK File
```bash
# For debug APK
ls -lh android/app/build/outputs/apk/debug/app-debug.apk

# For release APK
ls -lh android/app/build/outputs/apk/release/app-release.apk
```

### 7.2 Check AAB File
```bash
ls -lh android/app/build/outputs/bundle/release/app-release.aab
```

### 7.3 Verify APK Contents (Optional)
```bash
# Install APK on connected device for testing
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Step 8: Upload to Google Play Store

### 8.1 Prepare for Play Store
1. Go to [Google Play Console](https://play.google.com/console)
2. Select your app or create a new one
3. Navigate to **Release** → **Production**

### 8.2 Upload AAB File
1. Click **Create new release**
2. Click **Browse files** under "App bundles"
3. Select: `android/app/build/outputs/bundle/release/app-release.aab`
4. Click **Upload**

### 8.3 Fill in Release Details
1. Add release notes
2. Review app details
3. Click **Review release**
4. Click **Start rollout to Production**

---

## Troubleshooting

### Build Fails: "Keystore not found"
```bash
# Verify key.properties path
cat android/key.properties

# Update path if needed
# Example: storeFile=/Users/username/android/my-release-key.jks
```

### Build Fails: "Invalid password"
```bash
# Verify keystore password
keytool -list -v -keystore /path/to/keystore.jks

# Update key.properties with correct password
```

### Build Fails: "Module not found"
```bash
# Clean and rebuild
./gradlew clean
./gradlew bundleRelease
```

### APK Installation Fails
```bash
# Uninstall old version first
adb uninstall com.expertaid.gpstracking

# Then install new APK
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Build Configuration Summary

| Setting | Value |
|---------|-------|
| **Package Name** | `com.expertaid.gpstracking` |
| **App Name** | Expert GPS Tracking |
| **Version Code** | 1 |
| **Version Name** | 1.0.0 |
| **Min SDK** | 24 (Android 7.0) |
| **Target SDK** | 34 (Android 14) |
| **Compile SDK** | 34 |

---

## Next Steps After Building

1. **Test APK:** Install on Android device and test all features
2. **Verify Package Name:** Ensure it matches Firebase (`com.expertaid.gpstracking`)
3. **Check Permissions:** Verify location, camera, and storage permissions work
4. **Test Notifications:** Confirm Firebase push notifications work
5. **Upload AAB:** Submit to Google Play Store
6. **Monitor Release:** Track rollout and user feedback

---

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Android build logs: `android/app/build/outputs/`
3. Check Gradle output for specific error messages
4. Verify Firebase configuration matches your app

---

**Last Updated:** July 8, 2026
**App Version:** 1.0.0
**Package Name:** com.expertaid.gpstracking
