# Complete Step-by-Step Guide: Play Store Submission

## Overview
This guide walks you through 3 main steps to get your app ready for Google Play Store submission.

---

## STEP 1: Generate Signing Key (One-Time Setup)

### What is a Signing Key?
A signing key is a certificate that proves you are the legitimate owner of the app. Google Play requires all apps to be signed with a key.

### ⚠️ IMPORTANT
- You only do this ONCE
- Save the key file and passwords securely
- NEVER share or lose this key
- Without it, you cannot update your app on Play Store

### Instructions

#### 1.1 Open Terminal/Command Prompt

**Windows:**
- Press `Win + R`
- Type `cmd` and press Enter

**Mac/Linux:**
- Open Terminal application

#### 1.2 Navigate to Project Directory

```bash
cd /path/to/expertaidgps-website/android
```

**Example paths:**
- **Windows**: `C:\Users\YourName\expertaidgps-website\android`
- **Mac**: `/Users/YourName/expertaidgps-website/android`
- **Linux**: `/home/username/expertaidgps-website/android`

#### 1.3 Generate Keystore File

Run this command (copy and paste exactly):

```bash
keytool -genkey -v -keystore expertgps-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias expertgps-key
```

#### 1.4 Answer the Prompts

You will see prompts like this:

```
Enter keystore password: 
```

**Create a strong password** (example: `MySecure@Pass123`)
- Write it down in a secure place
- You'll need it later

```
Re-enter new password:
```

**Type the same password again**

```
What is your first and last name?
```

**Enter your name** (example: `John Doe`)

```
What is the name of your organizational unit?
```

**Enter your company/organization** (example: `ExpertAid Technologies`)

```
What is the name of your organization?
```

**Enter organization name again** (example: `ExpertAid Technologies`)

```
What is the name of your City or Locality?
```

**Enter your city** (example: `Hyderabad`)

```
What is the name of your State or Province?
```

**Enter your state** (example: `Telangana`)

```
What is the two-letter country code for this unit?
```

**Enter country code** (example: `IN` for India)

```
Is CN=John Doe, OU=ExpertAid Technologies, O=ExpertAid Technologies, L=Hyderabad, ST=Telangana, C=IN correct?
```

**Type `yes` and press Enter**

```
Enter key password for <expertgps-key>
```

**Create another password** (can be same as keystore password, or different)
- Write it down

```
Re-enter new password:
```

**Type the same password again**

#### 1.5 Verify Key Was Created

After completion, you should see:

```
Storing keystore to: expertgps-release-key.jks
```

**Verify the file exists:**

```bash
ls -la expertgps-release-key.jks
```

You should see output like:

```
-rw-r--r--  1 user  staff  2560 Jul  7 14:00 expertgps-release-key.jks
```

#### 1.6 Save Your Passwords

**Create a secure document** (NOT in your project folder):

```
App: Expert GPS Tracking
Package: com.expertgpstracking.app

Keystore File: expertgps-release-key.jks
Keystore Password: MySecure@Pass123
Key Alias: expertgps-key
Key Password: MySecure@Pass123
```

**Store this in:**
- Password manager (1Password, LastPass, Bitwarden)
- Encrypted file on your computer
- Secure cloud storage (NOT Google Drive/Dropbox)

### ✅ Step 1 Complete!

You now have your signing key ready.

---

## STEP 2: Build First AAB File

### What is an AAB?
AAB (Android App Bundle) is the format Google Play requires for app submissions. It's smaller and more efficient than APK.

### Prerequisites
- Java Development Kit (JDK) installed
- Node.js and pnpm installed
- Android SDK installed (via Android Studio)

### Instructions

#### 2.1 Check Prerequisites

**Check Java:**
```bash
java -version
```

Should show: `openjdk version "21"` or similar

**Check Node:**
```bash
node --version
```

Should show: `v22.x.x` or similar

**Check pnpm:**
```bash
pnpm --version
```

Should show: `9.x.x` or similar

#### 2.2 Navigate to Project

```bash
cd /path/to/expertaidgps-website
```

#### 2.3 Set Environment Variables

**These tell the build system where your signing key is and what passwords to use.**

**Windows (Command Prompt):**
```cmd
set KEYSTORE_PASSWORD=MySecure@Pass123
set KEY_ALIAS=expertgps-key
set KEY_PASSWORD=MySecure@Pass123
```

**Windows (PowerShell):**
```powershell
$env:KEYSTORE_PASSWORD="MySecure@Pass123"
$env:KEY_ALIAS="expertgps-key"
$env:KEY_PASSWORD="MySecure@Pass123"
```

**Mac/Linux (Bash):**
```bash
export KEYSTORE_PASSWORD="MySecure@Pass123"
export KEY_ALIAS="expertgps-key"
export KEY_PASSWORD="MySecure@Pass123"
```

#### 2.4 Run Build Script

**Windows:**
```bash
.\build-release.sh
```

**Mac/Linux:**
```bash
./build-release.sh
```

#### 2.5 Wait for Build to Complete

The build will take 5-10 minutes. You'll see output like:

```
========================================
Expert GPS Tracking - Release Build
========================================

✓ Node.js found: v22.13.0
✓ pnpm found: 9.1.0
✓ Java found: openjdk version "21.0.10"

Step 3: Building Web App...
✓ Web app built successfully

Step 4: Syncing Capacitor...
✓ Capacitor synced successfully

Step 5: Building Android App Bundle (AAB)...
✓ AAB built successfully

Step 6: Verifying Build Output...
✓ AAB file created: /path/to/expertaidgps-website/android/app/build/outputs/bundle/release/app-release.aab
✓ File size: 45.2M

Build Complete!
```

#### 2.6 Locate Your AAB File

The AAB file is here:

```
expertaidgps-website/android/app/build/outputs/bundle/release/app-release.aab
```

**Verify it exists:**

```bash
ls -lh android/app/build/outputs/bundle/release/app-release.aab
```

Should show something like:

```
-rw-r--r--  1 user  staff  45.2M Jul  7 14:15 app-release.aab
```

### ✅ Step 2 Complete!

You now have your AAB file ready for testing and submission.

---

## STEP 3: Set Up GitHub Secrets (For Automated Builds)

### What are GitHub Secrets?
GitHub Secrets are encrypted environment variables stored securely on GitHub. They allow automated builds without exposing sensitive information.

### Why Do This?
- Automated builds on every code change
- Easy version updates
- No need to build locally each time
- Secure credential storage

### Prerequisites
- GitHub account with your repository
- Admin access to the repository

### Instructions

#### 3.1 Go to GitHub Repository Settings

1. Open GitHub: https://github.com
2. Go to your repository: `ekodecrux/ExpertAidGPS`
3. Click **Settings** tab
4. Click **Secrets and variables** → **Actions** (left sidebar)

#### 3.2 Add First Secret: KEYSTORE_BASE64

**Convert your keystore file to Base64:**

**Windows (PowerShell):**
```powershell
$keystore = [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\expertaidgps-website\android\expertgps-release-key.jks"))
Set-Clipboard -Value $keystore
```

**Mac/Linux:**
```bash
cat android/expertgps-release-key.jks | base64 | pbcopy
```

Or save to file:
```bash
cat android/expertgps-release-key.jks | base64 > keystore.base64
cat keystore.base64
```

**On GitHub:**
1. Click **New repository secret**
2. Name: `KEYSTORE_BASE64`
3. Value: Paste the Base64 string you copied
4. Click **Add secret**

#### 3.3 Add Second Secret: KEYSTORE_PASSWORD

1. Click **New repository secret**
2. Name: `KEYSTORE_PASSWORD`
3. Value: `MySecure@Pass123` (your keystore password)
4. Click **Add secret**

#### 3.4 Add Third Secret: KEY_ALIAS

1. Click **New repository secret**
2. Name: `KEY_ALIAS`
3. Value: `expertgps-key`
4. Click **Add secret**

#### 3.5 Add Fourth Secret: KEY_PASSWORD

1. Click **New repository secret**
2. Name: `KEY_PASSWORD`
3. Value: `MySecure@Pass123` (your key password)
4. Click **Add secret**

#### 3.6 Add Fifth Secret: PLAY_STORE_SERVICE_ACCOUNT

**This is needed for automatic Play Store uploads.**

1. Go to Google Play Console: https://play.google.com/console
2. Go to **Settings** → **API access**
3. Create a new service account (follow Google's instructions)
4. Download the JSON file
5. Open the JSON file with a text editor
6. Copy all the content

**On GitHub:**
1. Click **New repository secret**
2. Name: `PLAY_STORE_SERVICE_ACCOUNT`
3. Value: Paste the entire JSON content
4. Click **Add secret**

#### 3.7 Verify All Secrets Are Added

You should see 5 secrets:
- ✅ KEYSTORE_BASE64
- ✅ KEYSTORE_PASSWORD
- ✅ KEY_ALIAS
- ✅ KEY_PASSWORD
- ✅ PLAY_STORE_SERVICE_ACCOUNT

### ✅ Step 3 Complete!

You now have automated builds set up!

---

## How to Use GitHub Actions for Future Builds

### Build a New Version Automatically

1. Go to GitHub: https://github.com/ekodecrux/ExpertAidGPS
2. Click **Actions** tab
3. Click **Build for Play Store** workflow
4. Click **Run workflow** button
5. Enter version number (e.g., `1.0.1`)
6. Click **Run workflow**
7. Wait for build to complete (5-10 minutes)
8. Download AAB from artifacts

### No Manual Build Needed!

After this setup, you can:
- Update code
- Push to GitHub
- GitHub automatically builds AAB
- Download and submit to Play Store

---

## Summary

| Step | What | Time | Result |
|------|------|------|--------|
| 1 | Generate Signing Key | 5 min | `expertgps-release-key.jks` file |
| 2 | Build AAB | 10 min | `app-release.aab` file (45MB) |
| 3 | Set GitHub Secrets | 10 min | Automated builds enabled |

---

## Next: Submit to Play Store

Once you have your AAB file from Step 2:

1. Go to https://play.google.com/console
2. Create new app or select existing
3. Upload AAB file
4. Add screenshots and description
5. Submit for review

See `PLAYSTORE_BUILD_GUIDE.md` for detailed Play Store submission instructions.

---

## Troubleshooting

### Problem: "keytool command not found"
**Solution:** Java is not installed properly
```bash
# Install Java
# Windows: Download from oracle.com
# Mac: brew install openjdk@21
# Linux: sudo apt-get install openjdk-21-jdk
```

### Problem: "Build failed: Gradle not found"
**Solution:** Android SDK not installed
```bash
# Download Android Studio from developer.android.com
# It includes all required tools
```

### Problem: "Environment variables not set"
**Solution:** Close and reopen terminal after setting variables
```bash
# Verify variables are set
echo $KEYSTORE_PASSWORD  # Should show your password
```

### Problem: "AAB file not created"
**Solution:** Check build output for errors
```bash
# Look for error messages in the output
# Common issues: wrong passwords, missing Java, disk space
```

---

## Security Best Practices

✅ **DO:**
- Store keystore file securely (NOT in Git)
- Use strong passwords (12+ characters)
- Backup keystore file in secure location
- Use GitHub Secrets for sensitive data
- Rotate passwords periodically

❌ **DON'T:**
- Commit keystore file to Git
- Share keystore password
- Use simple passwords
- Store passwords in code
- Lose or delete keystore file

---

## Questions?

Refer to:
- `PLAYSTORE_BUILD_GUIDE.md` - Detailed Play Store submission
- `VERSION_MANAGEMENT.md` - Version numbering and releases
- `android/build-config.json` - App configuration

---

**Last Updated:** July 7, 2026
**Status:** Ready for implementation
