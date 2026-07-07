# Version Management Guide

## Overview
This document explains how to manage app versions and releases for the Expert GPS Tracking app across the web and Android platforms.

## Current Version
- **Web App**: 1.0.0
- **Android App**: 1.0.0
- **versionCode**: 1

## Version Numbering Scheme

### Semantic Versioning (MAJOR.MINOR.PATCH)

```
1.0.0
│ │ └─ PATCH: Bug fixes, minor improvements (1.0.1, 1.0.2)
│ └─── MINOR: New features, backward compatible (1.1.0, 1.2.0)
└───── MAJOR: Breaking changes, major redesign (2.0.0)
```

### Examples
- **1.0.0** → **1.0.1**: Bug fix release
- **1.0.1** → **1.1.0**: New feature added
- **1.1.0** → **2.0.0**: Major redesign or breaking changes

## Android versionCode

The `versionCode` is an integer that must increase with every release.

```
versionCode = MAJOR * 10000 + MINOR * 100 + PATCH
```

### Examples
- Version 1.0.0 → versionCode = 10000
- Version 1.0.1 → versionCode = 10001
- Version 1.1.0 → versionCode = 10100
- Version 2.0.0 → versionCode = 20000

## Release Process

### 1. Prepare Release

#### Update Version Numbers

**File: capacitor.config.ts**
```typescript
const config: CapacitorConfig = {
  appId: 'com.expertgpstracking.app',
  appName: 'Expert GPS Tracking',
  webDir: 'dist',
  version: '1.0.1',  // ← Update this
  // ... rest of config
};
```

**File: android/app/build.gradle**
```gradle
defaultConfig {
    applicationId "com.expertgpstracking.app"
    minSdkVersion rootProject.ext.minSdkVersion
    targetSdkVersion rootProject.ext.targetSdkVersion
    versionCode 10001  // ← Calculate and update this
    versionName "1.0.1"  // ← Update this
    // ... rest of config
}
```

**File: package.json**
```json
{
  "name": "react-example",
  "version": "1.0.1",  // ← Update this
  // ... rest of config
}
```

#### Update Release Notes

**File: CHANGELOG.md** (Create if doesn't exist)
```markdown
# Changelog

## [1.0.1] - 2026-07-07

### Fixed
- Fixed blank page issue for User dashboard
- Fixed notification parsing errors

### Changed
- Improved app performance
- Updated dependencies

### Added
- New admin dashboard features
- Super admin system management

## [1.0.0] - 2026-07-01

### Added
- Initial release
- Driver interface
- User interface
- Admin dashboard
- Super admin dashboard
```

### 2. Build Release

#### Local Build

```bash
# Set environment variables
export KEYSTORE_PASSWORD="your_password"
export KEY_ALIAS="expertgps-key"
export KEY_PASSWORD="your_password"

# Run build script
./build-release.sh

# Output: android/app/build/outputs/bundle/release/app-release.aab
```

#### Automated Build (GitHub Actions)

1. Go to GitHub repository
2. Click "Actions" tab
3. Select "Build for Play Store" workflow
4. Click "Run workflow"
5. Enter version number (e.g., 1.0.1)
6. Click "Run workflow"
7. Wait for build to complete
8. Download AAB from artifacts

### 3. Test Release

#### Test on Device

```bash
# Generate APKs from AAB
java -jar bundletool-all.jar build-apks \
  --bundle=android/app/build/outputs/bundle/release/app-release.aab \
  --output=app.apks \
  --ks=android/expertgps-release-key.jks \
  --ks-pass=pass:your_keystore_password \
  --ks-key-alias=expertgps-key \
  --key-pass=pass:your_key_password

# Install on connected device
java -jar bundletool-all.jar install-apks --apks=app.apks

# Test all features:
# - Driver login and dashboard
# - User login and dashboard
# - Admin login and dashboard
# - Super admin login and dashboard
# - Real-time tracking
# - Notifications
# - Map functionality
```

#### Test Checklist
- [ ] App launches without crashes
- [ ] All roles login successfully
- [ ] Driver dashboard works
- [ ] User dashboard works
- [ ] Admin dashboard works
- [ ] Super admin dashboard works
- [ ] Real-time map tracking works
- [ ] Notifications display correctly
- [ ] No console errors
- [ ] Performance is acceptable

### 4. Submit to Play Store

1. Go to https://play.google.com/console
2. Select your app
3. Go to "Release" → "Production"
4. Click "Create new release"
5. Upload AAB file
6. Add release notes
7. Review and confirm
8. Submit for review

### 5. Monitor Release

#### After Submission
- Monitor crash reports
- Check user reviews
- Respond to feedback
- Watch for issues

#### If Issues Found
1. Fix the issue
2. Increment version (1.0.1 → 1.0.2)
3. Rebuild and submit new release
4. Use staged rollout to limit impact

## Maintenance Releases

### Bug Fix Release (Patch)
```
1.0.0 → 1.0.1

Changes:
- Fix notification parsing bug
- Fix blank page issue
- Improve performance
```

### Feature Release (Minor)
```
1.0.1 → 1.1.0

Changes:
- Add chat feature
- Add analytics dashboard
- Improve UI/UX
```

### Major Release (Major)
```
1.1.0 → 2.0.0

Changes:
- Complete redesign
- New architecture
- Breaking API changes
```

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-07-01 | Initial release | Released |
| 1.0.1 | 2026-07-07 | Bug fixes | Ready |

## Rollout Strategy

### Staged Rollout (Recommended)
```
Day 1: 5% of users
Day 2: 10% of users
Day 3: 25% of users
Day 4: 50% of users
Day 5: 100% of users
```

### Immediate Rollout
- Release to all users at once
- Use only for critical updates
- Higher risk but faster availability

## Rollback Procedure

If critical issues are found after release:

1. **Pause Rollout**
   - Go to Play Store Console
   - Click "Pause rollout"
   - Stops new installations

2. **Investigate Issue**
   - Check crash reports
   - Review error logs
   - Identify root cause

3. **Fix Issue**
   - Make necessary code changes
   - Increment version
   - Rebuild and test

4. **Release Fix**
   - Submit new version
   - Use staged rollout
   - Monitor closely

## Backup & Recovery

### Backup Keystore
```bash
# Create backup of signing key
cp android/expertgps-release-key.jks android/expertgps-release-key.jks.backup

# Store in secure location (NOT in Git)
# Consider using password manager or secure cloud storage
```

### Backup Build Artifacts
```bash
# Create builds directory
mkdir -p builds/$(date +%Y%m%d)

# Copy AAB file
cp android/app/build/outputs/bundle/release/app-release.aab \
   builds/$(date +%Y%m%d)/app-release-1.0.1.aab
```

## Important Notes

⚠️ **CRITICAL**
- Never commit keystore file to Git
- Never share keystore password
- Always backup signing key
- Keep versionCode incrementing
- Test thoroughly before release
- Use staged rollout for safety

## Quick Reference

### Update Version
```bash
# Edit these files:
# 1. capacitor.config.ts (version field)
# 2. android/app/build.gradle (versionCode and versionName)
# 3. package.json (version field)
# 4. CHANGELOG.md (add entry)
```

### Build Release
```bash
./build-release.sh
```

### Upload to Play Store
1. Go to Play Store Console
2. Create new release
3. Upload AAB file
4. Add release notes
5. Submit for review

### Monitor Release
1. Check crash reports
2. Monitor ratings
3. Respond to reviews
4. Watch for issues

---

**Last Updated**: July 7, 2026
**Current Version**: 1.0.0
**Next Version**: 1.0.1 (planned)
