# Project TODO

- [x] Verify the supplied `ekodecrux/ExpertAidGPS` URL; GitHub returned 404, so the available managed project copy was used
- [x] Audit all Android manifest, plugin, and GPS code paths for background-location access
- [x] Add an in-app prominent disclosure before any location permission or GPS request
- [x] Require explicit user consent before location tracking begins; added an in-app privacy-policy page and disclosure link
- [x] Prevent driver GPS tracking from starting before disclosure consent
- [x] Build and inspect the corrected debug APK: versionCode 2/versionName 1.0.1 verified, ACCESS_BACKGROUND_LOCATION absent, and disclosure strings present; signed release still requires the owner’s release keystore
- [x] Run validation checks: production web build passes; corrected debug APK builds and inspects successfully; TypeScript reports three pre-existing repository errors; signed release requires the owner’s keystore
- [x] Document Play Console declaration and resubmission steps in PLAY_CONSOLE_LOCATION_RESUBMISSION.md

