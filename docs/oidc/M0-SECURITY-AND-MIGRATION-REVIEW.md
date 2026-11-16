# M0 security boundary and schema migration review

Date: 2026-11-15
Status: **Source review completed; proposed designs and executable tests remain unvalidated.**
Evidence baseline: Materialious Full application code from \`Cylac/Materialious\` at fork main \`fc971b90c1fd61c81c28dfa1a0aee9367697eeab\`; current design branch was \`e745d809798f5f3610796df9e5c8988b31859634\` when this review began. Inspect GitHub heads again before implementation.

This is a **design-only** assessment. No live requests, dependency installs, database migrations, builds, code patches, server access or exploitation tests were performed.

## Executive findings

1. A provider-neutral OIDC **web** flow with a separately unlocked client master key remains feasible in principle.
2. Account provisioning cannot reuse the current \`User\` model unchanged because its \`passwordHash\` and \`passwordSalt\` fields are required. Create an explicit OIDC-only credential state with a controlled, additive migration before first OIDC account.
3. Cookie logout and existing legacy credential semantics require special care. The \`userid\` cookie is written with \`Path=/api\` but deleted with \`Path=/\` (source-level mismatch). The legacy signed user ID is a reusable bearer credential with no server-side expiration or revocation. These are existing concerns, not newly introduced OIDC defects.
4. The server stores a client-derived login password hash which the login endpoint accepts directly. This value is an **authentication-equivalent credential** if disclosed; a database leak can therefore permit someone to authenticate to that account as far as the server is concerned, even if the attacker still cannot decrypt the user's master key without the original secret.
5. Some subscription database reads and mutations lack an explicit \`UserId\` predicate; their global primary key needs a per-user access test. No exploitation has been demonstrated. Separately, the account deletion path needs a data-retention and cascade test.
6. SvelteKit's documented built-in origin checks cover form submissions. Do not assume those checks alone implement the full CSRF policy for cookie-authenticated JSON \`+server\` endpoints.
7. Current YouTube backend mode has no native personal-playlist CRUD. This is a distinct family-release capability gap.

## Source-grounded security observations

| ID | Source | Verified behaviour in code | Risk to test; not a claim of demonstrated exploit |
| --- | --- | --- | --- |
| S01 | \`src/lib/server/misc.ts\`; \`src/routes/api/user/logout/+server.ts\` | The signed \`userid\` cookie is written with \`path: '/api'\`, \`maxAge\` 60 days; logout deletes \`userid\` with \`path: '/'\` | Deletion targets a different cookie path, so browser may retain the original authentication cookie. Test cookie headers and \`isLoggedIn\` after logout. |
| S02 | \`src/lib/server/misc.ts\`; \`src/hooks.server.ts\` | \`generateAuthToken\` signs the user ID without an expiry claim; hooks verify the signed string from cookie or bearer header | Legacy bearer credential remains independently valid after sign-out or cookie expiry until signing key rotation; ensure OIDC uses distinct revocable sessions. |
| S03 | \`src/lib/server/user.ts\`; \`src/routes/api/user/login/+server.ts\` | Database \`passwordHash\` is compared directly to submitted \`passwordHash\` | Database value is reusable as a login proof if stolen; do not call the stored hash harmless in a database disclosure. Client-side content key still requires the unlock secret. |
| S04 | \`src/lib/server/user.ts\`; \`src/lib/server/database.ts\` | \`amSubscribed\` and \`removeSubscription\` select by subscription \`id\` without \`UserId\`. \`Subscriptions.id\` is a global primary key. | Confirm cross-user requests cannot report or delete another account's records. Compare \`subscriptionRssUpdated\`, which includes \`UserId\`. |
| S05 | \`src/lib/server/user.ts\`; \`src/routes/api/user/delete/+server.ts\` | \`User.delete()\` destroys a user row; associated history/subscription/settings cleanup is not explicit there | Test foreign key constraints, orphan retention, OIDC identity/session cleanup and deletion semantics before supporting OIDC account deletion. |
| S06 | \`src/lib/stores/backend.ts\`; \`src/lib/stores/storage.ts\` | On web, token and unwrapped master key are persisted by the normal storage adapter | OIDC path should avoid persistently saving raw master key by default; verify no stale credentials or plaintext caches survive cross-user switching. |
| S07 | \`src/routes/api/user/passwordReset/+server.ts\`; \`src/routes/api/user/[userId]/public/+server.ts\`; \`src/routes/api/user/me/+server.ts\` | Password-reset and public-salt endpoints assume local account fields exist | OIDC-only accounts need explicit guards and an independent key rewrap/recovery path; reject null salts rather than failing unpredictably. |
| S08 | \`src/lib/shared/index.ts\`; \`src/routes/api/admin/users/+server.ts\` | Admin rights are checked against configured local usernames | Generate compatibility usernames that cannot be hijacked via OIDC display claims; explicitly prevent OIDC provisioning from accidentally granting an admin role. |
| S09 | \`src/routes/api/user/history/+server.ts\` | History updates and reads generally use \`UserId\`; collection DELETE lacks an explicit \`locals.userId\` guard | Verify unauthorized DELETE fails predictably; avoid assuming an undefined identity is safe in every Sequelize query. |
| S10 | \`src/lib/api/backend/quickconnect.ts\` | Encrypted pairing payload includes legacy bearer token and raw master key | Keep Quick Connect disabled for OIDC-only accounts until device enrollment and session revocation are designed and tested. |

| S11 | `src/lib/server/user.ts`; `src/lib/server/database.ts` | Subscription reads use `where: { userId: this.data.id }` while creation, RSS updates and associations use `UserId` | Confirm the actual database column name and query behaviour in SQLite, PostgreSQL and MySQL/MariaDB. Identifier casing may produce a dialect-specific subscription read failure. |

**Why cookie path matters:** HTTP cookie deletion requires the same name, path and domain identity as the original cookie. The mismatch above is an observable source defect and requires an isolated browser regression test, not immediate production intervention.

**Important boundary:** A database credential disclosure may permit server-side login and encrypted record deletion without revealing the encrypted plaintext. These are different attack consequences and must be tested separately.

## Recommended schema design for the first OIDC-only account

Preserve the current internal \`User.id\` value as the sole application data owner. Do not change the identity used by history, subscriptions and key/value settings. Scope any new data, including future playlists, to this same ID.

### User changes, additive and backward-compatible

- Keep existing \`id\`, \`username\`, \`created\`, \`decryptionKeySalt\`, \`masterKeyCipher\`, \`masterKeyNonce\`.
- Add \`localAuthEnabled BOOLEAN NOT NULL DEFAULT true\`. Existing rows remain local-account-capable.
- Change \`passwordHash\` and \`passwordSalt\` to **nullable** only in a controlled migration. For OIDC-only rows, both must be null, with \`localAuthEnabled=false\`; for legacy rows, retain existing data unchanged.
- Do not reuse dummy passwords, OIDC tokens or OIDC subjects as password hashes.
- Guard the existing password login, public-salt API and password-reset API by credential state, with safe consistent failure handling and no timing-safe comparison on null values.
- OIDC-only \`username\` is generated server-side from an unguessable random ID, within existing schema constraints. User-provided identity claims are for display only. Existing username-based admin checks must never treat an OIDC-only account as admin by default.

**Further implementation decision:** Choose a supported explicit credential-mode representation and database check/guard for mixed legacy/OIDC rows. All null/not-null combinations must fail closed in application logic; database CHECK constraint portability differs by supported dialect.

### New identity and session entities

| Table | Required fields and constraints | Notes |
| --- | --- | --- |
| \`OidcIdentities\` | \`id\`, exact \`issuer\`, exact \`subject\`, \`UserId\`, status, timestamps; unique (\`issuer\`, \`subject\`) | No email join, preserve case and exact subject identity. For first M2, one verified identity per OIDC account. |
| \`OidcSessions\` | Hash of 256-bit random session handle, \`UserId\`, \`OidcIdentityId\`, creation, last activity, idle expiry, absolute expiry, revoked time | The opaque cookie holds the **raw random handle**, database stores its hash. Rotate and revoke on logout; do not treat provider tokens as app credentials. |
| \`OidcTransactions\` | Hashed state or opaque transaction ID, PKCE verifier, nonce, fixed registered redirect, browser binding, creation and expiry, consumed flag | Store only briefly server-side; one-time atomic consumption; no open redirect return target. |
| \`OidcEnrollments\` | Short-lived pending identifier, verified issuer/subject or a reference to a completed validated callback, browser binding, expiry and consumed flag | Limited to enrollment action; it is **not** an app user session. A single final transaction creates \`User\` and \`OidcIdentities\`. |
| \`UserRecoveryEnvelopes\` (later M3) | \`UserId\`, format/version, encrypted master-key envelope, KDF/nonce metadata, creation and rotation times | Proposed independent offline recovery secret. Not a server-held plaintext key. |

**Race and ownership rules:** Both \`OidcIdentities(issuer, subject)\` and any one-provider-per-user uniqueness policy must be enforced at database level. Finalizing the same enrollment twice cannot create duplicate users or detached identity links. Creating the User and identity pair must be atomic and independently recoverable from failures.

### Migration sequence to evaluate in disposable databases

1. Copy and checksum the **entire** disposable database and relevant encryption envelopes. Pin the unmodified baseline commit and database dialect/version. Preserve the pre-migration image and restorable backup.
2. On the copy, record the existing Users schema, primary keys, indexes, foreign keys and row counts, and create a migration journal/version marker; refuse to apply the same migration twice.
3. Apply an explicit, ordered migration: add local-auth mode with safe default; make local credential fields nullable; create identity/session/enrollment tables, indexes and foreign keys. Use dialect-specific handling and appropriate transaction boundaries.
4. For SQLite, test **foreign-key retention, indexes, associations and rollback** particularly carefully: Sequelize \`changeColumn\` can rebuild the table through a backup table. PostgreSQL and MySQL must each be tested separately; success in SQLite alone is not evidence of portability.
5. Verify old user rows are byte-for-byte equivalent for their password salts, password hashes and encrypted master-key envelopes. Existing local login and data decryption must still work. OIDC-only records must not authenticate locally.
6. Verify restart, partial failure, concurrent provisioning, unique-constraint conflicts and backup/restore. A failed migration must leave a usable previous database backup. Do not assume SQL schema downgrades are automatic or safe.
7. Only after these checks should the same migration be considered for isolated M2 data. Never test against ORION or production accounts during M0/M1.

**Baseline concern:** \`src/hooks.server.ts\` currently runs \`sequelize.sync()\` before \`runSequelizeMigrations()\`. Do not rely on default sync to perform the required nullable-column alteration. Design migrations to run deterministically with restart/error handling, and consider the potential for concurrent application instances.

## Proposed session and CSRF contract for isolated M2

The following values are **candidate test defaults only**, not a final family convenience policy:

- 32 random bytes per opaque local application session handle. Store only a cryptographic hash in the database; do not log handles.
- Short bounded OIDC sessions for initial verification: **2 hours idle, 12 hours absolute**. Both limits enforced server-side, regardless of client state, with explicit session rotation and revocation. Revisit these values with user experience testing.
- Use a host-only \`__Host-\` cookie with \`Secure\`, \`HttpOnly\`, \`Path=/\`, \`SameSite=Lax\`, and no \`Domain\` attribute. Use HTTPS for integration tests; any local HTTP exception must be isolated and documented, not copied to production.
- Match OIDC login state to the **browser transaction**, and enforce a single active user identity per protected request. To avoid legacy fallback after OIDC logout, reject *any* ambiguous mixture of legacy and OIDC credentials until a carefully tested transition policy exists.
- For unsafe methods authenticated by cookies, require a deliberate origin policy and a session-bound CSRF defence for API/JSON as well as HTML forms. Confirm SvelteKit's actual default behaviour on the pinned version and behind the chosen test proxy.
- Clearly distinguish an IdP logout, local Materialious session logout, device lock, and revocation. A disabled IdP account is not automatically sufficient to terminate a previously issued local Materialious session.
- Do not expose provider refresh/access tokens to the browser or persist them for M2 without a separately reviewed need.
- Account switch and sign out must discard sensitive in-memory and persistent state in all client stores, drop in-flight responses for the previous user, and prevent cross-user history, preferences or playlist cache reuse.

### Example required tests

| Scenario | Expected result |
| --- | --- |
| Login then logout from a clean browser | Path-matched cookie clears; \`/api/user/isLoggedIn\` requires fresh login when no Authorization header remains |
| Reuse saved signed legacy bearer token after logout | Demonstrates existing baseline limitation; OIDC must **not** inherit it |
| User A presents user B's subscription ID in GET or DELETE | No B subscription status leakage or deletion |
| Database credential hash submitted as login proof | Characterize baseline behaviour using disposable data, then record remediation policy |
| Two simultaneous new accounts with same issuer and subject | One committed user and identity mapping, no orphans or duplicates |
| Existing local account after schema change | Same password unlocks same master key and the same content |
| OIDC-only account reaches local-login/reset/public-salt endpoints | No accidental login, no null exception, no sensitive field leak |
| Valid OIDC cookie mixed with legacy signed cookie or bearer header | Request rejected rather than selecting a different identity |
| Cross-site JSON POST or unsafe request with missing Origin/CSRF token | Rejected unless another explicit, verified CSRF defence applies |
| OIDC sign-in succeeds but no passphrase | Authenticated and locked; no plaintext user content |
| App session revoked while unlocked browser stays open | Next protected request denied; keys and cached state cleared safely |
| User deletes own account | All relevant linked identities, sessions, encrypted records and key envelopes are removed according to policy |
| IdP unreachable while session is valid | Local session follows documented remaining lifetime; new sign-in fails closed |

## M0 acceptance and recommendation

**Architecture direction:** Go for an **isolated unmodified M1 baseline** when the team is comfortable with the documented M0 decisions. Do not treat a design-only risk finding as proof of an actual defect until reproduced.

**Not yet authorized:** Starting the M2 OIDC prototype, deploying containers to ORION, changing production Authentik, enabling Cloudflare resources, merging a draft PR, or modifying upstream runtime code.

**Outstanding before M0 signoff:** Choose the session default and IdP revocation policy, confirm memory-only unlocked OIDC key, accept irreversible data loss without an independent recovery secret, agree that existing accounts will not be linked automatically, and decide how baseline security findings will be triaged. Then formally record the M0 go/no-go and move to M1, **unmodified full-backend tests first**.

## External references checked

- MDN, HTTP cookie deletion requires same name/path/domain: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies
- Sequelize v6 Query Interface, SQLite changes may recreate tables: https://sequelize.org/docs/v6/other-topics/query-interface/
- SvelteKit configuration and CSRF origin rules: https://svelte.dev/docs/kit/%40sveltejs-kit-vite
- OWASP CSRF Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- OWASP Session Management: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OAuth 2.0 Security Best Current Practice, RFC 9700: https://www.rfc-editor.org/rfc/rfc9700
- OAuth for Browser-Based Applications, RFC 10017: https://www.rfc-editor.org/rfc/rfc10017
