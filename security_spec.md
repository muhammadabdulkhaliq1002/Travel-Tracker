# Security Spec for Trips and Users

## Data Invariants
1. A Trip cannot exist without a valid `userId` that strictly matches the authenticated user creating it, OR created by an admin.
2. The user must be authenticated.
3. Users can only read and update their own trips, BUT Admins can read and update all trips.
4. `createdAt` must be the exact request timestamp on creation.
5. All IDs must be valid.
6. The `status` field must be one of 'Pending', 'Approved', or 'Rejected'.
7. Only users can create their own profile. Users CANNOT assign themselves the 'admin' role upon creation (must default to 'driver').
8. Only Admins can modify other users' roles or `isActive` status.

## The "Dirty Dozen" Payloads
1. Unauthorized Request: Null `request.auth`
2. Missing required field (e.g. no `vehicleNumber`).
3. Payload with an extra "Ghost Field" (e.g., `isAdmin: true`).
4. Type mismatch: `distanceTravelled` as string instead of number.
5. Size exhaustion: `vehicleNumber` over 100 characters.
6. Spoofing Attack: Creating a trip where `incoming().userId` is a different user's UID.
7. Unverified Email Attack: Authed user but `email_verified` is false.
8. Modifying immortal fields: Attempting to update `createdAt` or `userId`.
9. Skipping `updatedAt` update: Updating normal fields without setting `updatedAt == request.time`.
10. ID Poisoning: Path variable `{tripId}` contains illegal characters or is too long.
11. Blanket Read/List scrape: Querying the entire trips collection without `where("userId", "==", request.auth.uid)`.
12. Denial of Wallet: Pushing massive arrays/maps inside fields (prevented by strict schema keys and type checking).

## The Test Runner
Tests will be in `firestore.rules.test.ts` (Mocked/Elided for brevity, using TDD in rules validation).
