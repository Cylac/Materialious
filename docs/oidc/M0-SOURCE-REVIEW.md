# M0 source review, integration proposal and feasibility gates

Status: Research and proposed architecture only. Not implemented or tested.
Review date: 2026-11-15.
Reviewed fork: `Cylac/Materialious`, branch `feature/oidc-foundation`, at commit `cf16807d5bf5572d90b3bef4415f65d4362baaf2`.
Upstream and fork `main` both pointed to `fc971b90c1fd61c81c28dfa1a0aee9367697eeab` during this review.
Application version in `materialious/package.json`: `1.18.27`.

This is a read-only source assessment. It does **not** confirm behavior by integration testing, implement OIDC, or approve deployment. Recheck all references against the current GitHub head before beginning implementation.

## 1. What was inspected

| Boundary | Existing implementation | Relevance to OIDC |
| --- | --- | --- |
| Server request identity | [`hooks.server.ts`](../../materialious/src/hooks.server.ts) | Converts a signed `userid` cookie or bearer token to `event.locals.userId`; initializes Sequelize and rate limiting |
| Local account storage | [`server/database.ts`](../../materialious/src/lib/server/database.ts) | `User` records require local-password fields and encrypted master-key fields; history, subscriptions, settings and Quick Connect tables |
| Local identity logic | [`server/user.ts`](../../materialious/src/lib/server/user.ts) | Local account creation, username/password verification, password reset and data access |
| Existing session material | [`server/misc.ts`](../../materialious/src/lib/server/misc.ts) | Signed user-ID bearer tokens and 60-day browser cookies |
| Login, registration and reset APIs | [`api/user/login`](../../materialious/src/routes/api/user/login/+server.ts), [`create`](../../materialious/src/routes/api/user/create/+server.ts), [`passwordReset`](../../materialious/src/routes/api/user/passwordReset/+server.ts) | Separate local password authentication from future OIDC sessions |
| Client key lifecycle | [`api/backend/index.ts`](../../materialious/src/lib/api/backend/index.ts), [`api/backend/encryption.ts`](../../materialious/src/lib/api/backend/encryption.ts) | Password-derived wrapping key, randomly generated master key and authenticated encryption/decryption |
| Client credential persistence | [`stores/backend.ts`](../../materialious/src/lib/stores/backend.ts), [`stores/storage.ts`](../../materialious/src/lib/stores/storage.ts) | Persists bearer token and raw master key; web uses browser local storage, native Android uses secure storage |
| Client login state | [`backend.ts`](../../materialious/src/lib/backend.ts), [`routes/+layout.ts`](../../materialious/src/routes/+layout.ts) | Currently treats availability of the raw master key as the marker of an active Materialious account |
| Data synchronization | [`api/backend/history.ts`](../../materialious/src/lib/api/backend/history.ts), [`api/backend/subscriptions.ts`](../../materialious/src/lib/api/backend/subscriptions.ts), [`api/backend/keyvalue.ts`](../../materialious/src/lib/api/backend/keyvalue.ts) | Encrypted cloud synchronization plus stable per-user keyed IDs |
| API authorization | [`api/user/history`](../../materialious/src/routes/api/user/history/+server.ts), [`server/user.ts`](../../materialious/src/lib/server/user.ts) | Must verify user scoping for **every** read, write and delete endpoint |
| Quick Connect | [`api/backend/quickconnect.ts`](../../materialious/src/lib/api/backend/quickconnect.ts), [`server/quickConnect.ts`](../../materialious/src/lib/server/quickConnect.ts) | Transfers a bearer token and raw master key to a paired device inside a sealed-box ciphertext |
| Personal playlists | [`api/index.ts`](../../materialious/src/lib/api/index.ts), [`api/invidious/playlist.ts`](../../materialious/src/lib/api/invidious/playlist.ts) | Personal-playlist operations currently use Invidious, not the built-in Materialious account database |
| Admin authorization | [`shared/index.ts`](../../materialious/src/lib/shared/index.ts), [`api/admin/users`](../../materialious/src/routes/api/admin/users/+server.ts) | Existing admin authorization uses a configured list of local usernames |

## 2. Existing account and encryption flow

1. **Registration.** The browser generates independent password salts, derives a password login hash and a data-unlock key, creates a random master key, encrypts that master key using libsodium `crypto_secretbox_easy`, then sends only the login hash, salts and wrapped key to the local registration endpoint. The server stores these fields with a random internal user UUID.
2. **Local login.** The browser requests public salts, derives the login hash from the supplied password, and submits it. The server verifies the login hash and returns the stored encrypted master key and an application bearer token while setting an auth cookie. The browser independently derives the data-unlock key and decrypts the master key.
3. **Data use.** The browser encrypts/decrypts the history, subscription and key/value payloads with that master key. Video/channel lookup IDs are generated with a keyed hash. The server stores encrypted payloads but also retains some operational metadata in plaintext, including watch timestamps, length, progress and subscription fetch timestamps; do not call this a completely metadata-free or server-independent privacy guarantee.
4. **Return visits.** Client state persists both the raw master key and application bearer token. This can avoid a new unlock prompt on a previously used device but broadens the consequences of browser storage exposure or malicious client-side JavaScript.
5. **Password change.** Client-side password reset rewraps the **same** master key under a new password-derived key. Existing API requires the current local password hash. It is not an OIDC account recovery API.

A successful OIDC login supplies an authenticated identity, **not** the old account password or data-decryption key. Existing local accounts cannot automatically be decrypted or safely linked from an email match. The browser-delivered JavaScript is also inside the trust boundary: a compromised web origin serving malicious scripts could collect keys when a user unlocks.

## 3. Feasibility recommendation: web-first, provider-neutral OIDC and separate unlock

**Proposed M2 proof-of-concept:** OIDC authorization code with S256 PKCE and a separate client-side data-unlock passphrase. Preserve local passwords and login routes; enable OIDC only when explicitly configured, default off. Develop the OIDC flow on the **full web** build first. Desktop/Android and Quick Connect compatibility are subsequent explicit gates, not implied by a web-only demonstration.

Proposed flow:

1. The user selects optional OIDC sign-in; a server route validates a *configured* OIDC issuer and creates a short-lived, single-use transaction containing state, nonce, PKCE verifier and controlled return target.
2. The browser visits the configured identity provider. On the fixed callback route, the server exchanges the authorization code and validates PKCE, state, nonce, issuer, audience, signature/JWKS, time-bound claims and other applicable ID-token checks. It rejects unknown issuers, unexpected redirect targets, insecure discovery, replay and mismatched transactions.
3. The backend locates an identity link keyed by **(`issuer`, `sub`)** and resolves it to a stable internal Materialious user ID. Never join by email, username or display name. Provisioning must be a separate explicit, transactional policy.
4. The backend creates its **own** opaque, short-lived, revocable application session, with a hashed session identifier stored server-side. A host-only, `Secure`, `HttpOnly`, `SameSite` cookie carries the opaque handle. Use session rotation at authentication and revocation on logout. Do not put provider tokens or plaintext key material into browser storage.
5. Login state becomes **unauthenticated**, **authenticated but locked**, or **authenticated and unlocked**. A user without a decrypted master key can view only the limited account/unlock screen; protected data APIs still require valid authorization and fail closed. Avoid treating lack of a raw key as evidence of a missing OIDC session.
6. On a newly provisioned OIDC account, the user sets a separate data-unlock passphrase. The browser creates and wraps a random master key using the existing cryptographic primitives. Subsequent devices authenticate with OIDC and decrypt the wrapped key with this passphrase.
7. On logout/account switch, revoke the local session, erase in-memory credentials and keys, and explicitly evaluate clearing persisted credentials, user-specific caches, settings and IndexedDB. Require a test proving that user A's plaintext cannot be shown to user B in a shared browser.

**Database design constraint.** The current `User` model requires `passwordHash` and `passwordSalt`. We should introduce an explicit OIDC-only account state and a tested migration that makes local login credentials optional for those accounts; prevent the local-login endpoint from accepting an OIDC-only account. Do not silently use a shared dummy password or pretend an IdP token is a local password. The smallest practical migration is to be established by an isolated database prototype and rollback test.

**Identity tables (proposed, not final schema):**

- `OidcIdentity`: internal link ID, normalized verified issuer, exact subject, internal user ID, creation date, status, unique (`issuer`, `subject`), plus a documented one-to-many policy if multiple IdPs are ever allowed.
- `OidcSession`: random opaque session identifier **hash**, internal user ID, identity link, issue/expiry timestamps, revoked timestamp, optional rotation/version information. Prefer database backed sessions to allow logout and revocation.
- `OidcTransaction`: hashed state identifier, PKCE context, nonce, fixed redirect target, short expiry and one-time consumption; avoid saving secrets in logs.
- Minimal local-account distinction: an explicit supported credential state rather than automatic implicit linking. Carefully test database `sync()` and migrations before introducing new models.

**Existing account linking:** disabled in the initial prototype. When considered, require the user to prove control of the existing **unlocked** local account and freshly authenticate at the OIDC provider within one bounded linking operation. Conflicting or previously linked (`issuer`, `sub`) pairs must fail closed; never link based on email equality.

**Authorization and admin roles:** Maintain internal user identity as the sole owner of data. Do not accept OIDC display names as admin authority; the upstream admin list is username based and needs an explicit privilege review before OIDC provisioning is enabled.

## 4. Can this offer genuine single sign-on?

- **New device, privacy-preserving choice:** OIDC signs the user in, then a separate unlock passphrase recovers the browser's master key. This is **not** a one-step access-to-data experience.
- **Previously unlocked device:** Materialious currently persists the raw key. A returning device may appear to have one-step sign-in, but this is a remembered local secret, not a key derived from OIDC. The exposure and clearing policy requires a decision.
- **Server-managed keys:** May offer one-step access to data, but the server can potentially obtain user decryption keys. This changes confidentiality guarantees. Do not implement this as an invisible default, and do not call it equivalent to the client-controlled key model.
- **Account recovery:** A forgotten independent unlock passphrase cannot be repaired by resetting the IdP password. A recovery-key design or explicit data-loss behaviour must be documented and tested before family adoption.

**Decision for M2:** validate independent client-side unlock first. Do not promise true one-step SSO on new devices. Reevaluate usability and recovery before M3 or M4.

## 5. Security, privacy and upstream compatibility review

| Risk / property | Required action before release |
| --- | --- |
| OIDC code substitution, login CSRF, mix-up or replay | Bind one-time state, nonce and S256 PKCE to a transaction; validate trusted issuer, ID token and exact callback |
| Forged OIDC identity, email collision or subject reassignment | Unique stable (`issuer`, `sub`) mapping, transactional provisioning, explicit link approval |
| Stolen application session, IdP suspension or provider outage | Server-revocable sessions with documented expiry, logout and fail-closed rules; clarify how rapidly revocation is enforced |
| Cross-user data access | Audit **all** user-scoped GET, POST, PATCH and DELETE queries and global identifiers, including subscription mutations; add adversarial tests before OIDC rollout |
| Persisted decrypted key / shared browser | Define a deliberate remember-device policy and account-switch cleanup; protect against XSS and check persisted browser data |
| Admin privilege escalation | Separate internal authorization from user-controlled OIDC names; test that changing identity claims never grants admin rights |
| Quick Connect pairing | Review code lifetime, authorization, sealed credential transfer and old bearer-token revocation; do not reuse indefinite legacy tokens for OIDC |
| Key loss and unsafe rewrapping | Support authenticated rewrap only after actual client-side unlock; design explicit recovery; prohibit silent ciphertext replacement |
| Data and schema changes | Preserve local accounts; back up disposable DB; confirm forward migration and rollback/restore before a release |
| Upstream drift | Keep new OIDC modules/routes and migration logic separate; document narrow changes to `hooks.server.ts`, account model, login UI and client-state handling |

Note: the existing signed bearer token is a signed user ID without an expiry in the token itself. `setAuthCookie` limits the *cookie* to 60 days, not an independently revocable bearer credential. The proposed OIDC session must not reuse this token model. Existing password and session semantics should be preserved for local logins during the prototype, with separate hardening work where warranted.

## 6. Product capability gap: personal playlists

The native Materialious full backend has server-side account storage for encrypted watch history, subscriptions and key/value settings. Its current personal-playlist API functions use **Invidious**; `getPersonalPlaylists()` returns an empty list in the YouTube backend path, and write methods are no-ops there. OIDC will **not** by itself supply per-user native personal playlists.

For a family-facing release, we must either implement a separately scoped per-user playlist store and tested APIs, adopt a deliberately supported alternative with clear limitations, or explicitly narrow the feature promise. This is a **product acceptance gap**, not evidence that OIDC is impossible. Keep unrelated playlist implementation outside the M2 protocol prototype until the architectural choice is made.

## 7. M1 and M2 proof-of-concept acceptance plan

**M1: unmodified isolated baseline**

- Pin full build, upstream SHA and image digest; no ORION production changes.
- Use disposable database/volumes and two disposable users with known distinct passphrases.
- Verify two account logins, synced history/progress, subscriptions, encrypted key/value settings, browser restart, account switching, password reset, logout and Quick Connect.
- **Record the native-playlist limitation**, and do not mark playlist synchronization as passing without an actual working implementation.
- Exercise direct API access across user A/B, suspicious identifiers, admin boundaries and deleting the current account. Preserve only sanitized logs and data.
- Verify backup/restore and repeatability. Record any upstream baseline defects separately from OIDC regressions.

**M2: isolated OIDC web prototype**

- Use a disposable standards-compliant IdP. Register a fixed localhost/staging callback; keep secrets out of the public repo.
- Prove valid OIDC callback, issuer/sub mapping, exactly-one provisioning, no email matching, and repeat sign-in.
- Reject malicious/expired/reused state, nonce, code, mismatched issuer/audience and redirect; verify the callback cannot be abused as an open redirect.
- Verify an OIDC identity can become authenticated **without** being able to decrypt data until a correct separate passphrase unlocks the master key.
- Prove isolation on device A versus B, shared browser account switching, local-password login regression and IdP outage handling.
- Verify local OIDC session revocation and stolen-token rejection. Do not declare native client/Quick Connect compatibility tested by a web-only PoC.
- Exercise new schema migration and restore of a disposable baseline database; verify upstream lint, Svelte typecheck and production build.

## 8. M0 decision gate and remaining questions

**Feasibility assessment:** A provider-neutral OIDC web sign-in with a separate decryption unlock step appears technically viable. The current code requires changes to account provisioning, auth/session resolution and client auth/locked-state handling. This is **not yet a proven implementation**.

M0 remains **in progress** pending these design/acceptance decisions:

1. Confirm the web-first M2 scope and independent unlock passphrase policy, including remember-device behaviour and loss/recovery expectations.
2. Choose a safe, documented OIDC-only account schema/migration with existing local credentials unaffected.
3. Specify session cookie/CSRF policy, IdP suspension semantics and authorization checks across cookie and bearer paths.
4. Close or explicitly track tenant-scoping concerns and define cross-user test cases without exposing user data.
5. Decide how the separate personal-playlist gap will be handled before a family-facing release.
6. Verify M1 baseline results before advancing to an OIDC prototype.

No code, GitHub default-branch merge, infrastructure, DNS, Cloudflare, production IdP, credentials or Docker changes are authorized by this document.

## Standards to reference during implementation

- OpenID Connect Core 1.0: https://openid.net/specs/openid-connect-core-1_0.html
- RFC 9700, OAuth 2.0 Security Best Current Practice: https://www.rfc-editor.org/rfc/rfc9700
- RFC 10017, OAuth 2.0 for Browser-Based Applications: https://www.rfc-editor.org/rfc/rfc10017
- RFC 7636, PKCE: https://www.rfc-editor.org/rfc/rfc7636
- RFC 8252, OAuth 2.0 for Native Apps (when native clients enter scope): https://www.rfc-editor.org/rfc/rfc8252

## Follow-up design artifacts

The [M0 design contract](./M0-DESIGN-CONTRACT.md) refines this preliminary source review with an explicit two-stage provisioning approach, revocable sessions, exact issuer/subject mapping and an offline recovery proposal. The [threat model](./THREAT-MODEL.md) enumerates concrete security and cross-user acceptance tests. Both are proposed and pending validation.

The source-level observations in this document remain tied to the commit reviewed above; implementation work must re-check current upstream and fork code.
