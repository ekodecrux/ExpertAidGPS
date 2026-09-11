# Project TODO

- [ ] Obtain and verify access to the latest `ekodecrux/ExpertAidGPS` GitHub repository
- [x] Audit all Android manifest, plugin, and GPS code paths for background-location access
- [x] Add an in-app prominent disclosure before any location permission or GPS request
- [x] Require explicit user consent before location tracking begins; added an in-app privacy-policy page and disclosure link
- [x] Prevent driver GPS tracking from starting before disclosure consent
- [ ] Build, inspect the release APK/AAB for permissions and version metadata (web bundle and source manifest verified; Android SDK unavailable in sandbox)
- [ ] Run TypeScript and Android validation checks (web build passes; existing repository TypeScript errors and missing Android SDK remain)
- [x] Document Play Console declaration and resubmission steps in PLAY_CONSOLE_LOCATION_RESUBMISSION.md

