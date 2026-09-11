# Google Play Location Re-submission

## Root cause

The rejected APK (`app-release.apk`) declares `android.permission.ACCESS_BACKGROUND_LOCATION` in its compiled manifest. Its bundled JavaScript does not contain a prominent disclosure or consent gate before the first `navigator.geolocation.watchPosition` call. Google Play therefore reports that the app accesses background location without the required prominent disclosure.

Google’s guidance requires a separate in-app disclosure and consent flow for sensitive APIs such as background location, and it requires the disclosure to be presented before the relevant permission or API access. The app must also provide a privacy policy in the app and in the Play listing. See the official guidance at [Google Play prominent disclosure best practices](https://support.google.com/googleplay/android-developer/answer/11150561?hl=en) and [Understanding location in the background permissions](https://support.google.com/googleplay/android-developer/answer/9799150?hl=en).

## Changes in this build

The Android manifest explicitly removes `ACCESS_BACKGROUND_LOCATION` from the merged release manifest. The app retains foreground fine/coarse location only. Driver GPS watchers and the dashboard trip-start path are gated behind an explicit in-app location disclosure. The disclosure explains the data collected, purpose, transmission to the organization’s Expert GPS Tracking account, and the user’s choices. It links to `/privacy-policy`, which is publicly reachable without login. The Android release version is `1.0.1` with `versionCode 2`.

## Play Console steps

1. Upload the new AAB/APK with `versionCode 2` only after verifying the final compiled manifest does not contain `ACCESS_BACKGROUND_LOCATION`.
2. In **App content → Data safety**, declare location collection and sharing accurately for the final implementation. Do not claim background collection if the final manifest and runtime use are foreground-only.
3. Ensure the store listing privacy-policy URL points to the complete public privacy policy, not only the login page.
4. If the final product intentionally requires location while the app is not visible, do not use the foreground-only configuration. Restore the background permission only with a complete background-location implementation, a prominent disclosure before access, the Location Permissions Declaration Form, a demonstration video, and a policy-compliant privacy policy.
5. In the review video, show a clean install, driver login, the in-app disclosure, the Android permission prompt after the user selects “Allow location access,” starting a trip, and the live vehicle update.
6. Remove older releases containing unintended background-location access from active testing tracks where possible; Google reviews active tracks as well as production.

## Local verification

Run `npm run build:mobile`, then build the signed release from Android Studio or a machine with a configured Android SDK. In Android Studio, inspect **Merged Manifest** for the release variant and confirm that `ACCESS_BACKGROUND_LOCATION` is absent. Install the release on a clean device, clear app data, log in as a driver, and verify that the disclosure appears before the Android location prompt.
