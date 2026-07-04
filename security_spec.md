# Security Specification - Expert GPS Tracking

## Data Invariants
1. **Organization Isolation**: Users can only access data (routes, vehicles, trips, attendance) belonging to their signed-in `orgId`.
2. **Role-Based Command**: Only `org_admin` can create routes/vehicles. Drivers can only update assigned trips.
3. **Super Admin Sovereignty**: The user `ravikumarpendyala9182@gmail.com` is the root authority and can bypass organizational checks for global registry management.
4. **Attendance Integrity**: Attendance records must be linked to a valid trip.
5. **No Self-Promotion**: Users cannot change their own roles or `orgId` once set, except by a higher authority.

## The "Dirty Dozen" Payloads (Anti-Patterns)
1. **The Ghost Organization**: Attempting to create an organization as a standard user.
2. **Role Escalation**: A `driver` attempting to change their role to `org_admin`.
3. **Cross-Tenant Leak**: User A from Org X trying to read trips from Org Y.
4. **ID Poisoning**: Creating a trip with a document ID that is 2MB of junk text.
5. **Orphaned Record**: Creating a trip for a route that does not exist.
6. **Future Spoofing**: Setting `createdAt` to a time in 2030.
7. **Terminal State Bypass**: Updating a trip status from 'completed' back to 'ongoing'.
8. **PII Scraping**: A `passenger` trying to list all user emails in the system.
9. **Shadow Field Injection**: Adding an `isVerified: true` field to a user profile that isn't in the schema.
10. **Driver Hijack**: A driver trying to update a trip they are not assigned to.
11. **Attendance Forgery**: A user marking themselves as `picked` for a trip they aren't part of.
12. **Null Path Attack**: Trying to write to a collection using a null or empty string ID.

## Test Runner (Security Unit Tests)
I will implement `firestore.rules.test.ts` to verify these protections. (Note: In this environment, I'll focus on the rules implementation first as a test runner script might be hard to execute without setup, but I will simulate the logic).
