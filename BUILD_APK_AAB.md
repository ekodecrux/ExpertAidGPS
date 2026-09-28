# ExpertAidGPS Android Build Guide

## Prerequisites

Install **Node.js 22**, **Java 21 JDK**, and Android Studio with **Android SDK Platform 36** and the Android SDK Build Tools. Set `ANDROID_HOME` or `ANDROID_SDK_ROOT` to the SDK directory. If the SDK variable is not set, copy `android/local.properties.template` to `android/local.properties` and update `sdk.dir`.

## Reproducible dependency installation

From the repository root, install exactly the versions recorded in `package-lock.json`:

```bash
npm ci
```

Do not commit `node_modules`, APKs, AABs, keystores, `key.properties`, or `local.properties`.

## Local build validation

The helper builds both release-format artifacts:

```bash
./build-release.sh
```

The outputs are:

```text
android/app/build/outputs/bundle/release/app-release.aab
android/app/build/outputs/apk/release/app-release.apk
```

When no release keystore is configured, Gradle uses the standard debug keystore so that the APK/AAB build can be validated. Those artifacts are **not suitable for Google Play upload**.

## Google Play release signing

For a Play-uploadable build, configure a release keystore through `android/app/key.properties` or environment variables. Place the file beside `android/app/build.gradle`. The file must contain:

```properties
storeFile=/absolute/path/to/release-key.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=YOUR_KEY_ALIAS
keyPassword=YOUR_KEY_PASSWORD
```

Alternatively, export:

```bash
export KEYSTORE_FILE=/absolute/path/to/release-key.jks
export KEYSTORE_PASSWORD='YOUR_STORE_PASSWORD'
export KEY_ALIAS='YOUR_KEY_ALIAS'
export KEY_PASSWORD='YOUR_KEY_PASSWORD'
./build-release.sh
```

Never commit the keystore or passwords. Before uploading, inspect the release artifact and confirm the package is `com.expertaid.gpstracking`, version name is `1.0.1`, version code is `2`, and `ACCESS_BACKGROUND_LOCATION` is absent from the merged manifest.

## Manual commands

```bash
npm ci
npm run build:mobile
cd android
./gradlew clean bundleRelease --no-daemon
./gradlew assembleRelease --no-daemon
```

The Android project uses compile/target SDK 36 and Java 17 source compatibility under the Java 21 JDK runtime required by the current Android Gradle toolchain.
