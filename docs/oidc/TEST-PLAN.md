# OIDC test strategy

Status: M0 planning baseline. These tests have not been executed.

## Baseline acceptance (before custom code)

- Two separate Materialious Full accounts can register and sign in.
- User A history, saved playback progress, channel subscriptions and settings do not appear under user B. Inventory personal-playlist behaviour separately: the built-in YouTube backend currently has no native personal-playlist CRUD, so that requirement must **not** be marked as passing without an actual supported implementation.
- Changes persist across browser restarts and another device.
- Password reset and quick connect behavior are characterized.
- Registration disabled mode and any proxy authentication requirements are exercised.
- Backup and restore of the disposable test database and volumes are demonstrated.
- An ordinary public video plays at common resolutions; known playback limitations are recorded separately from authentication bugs.

## OIDC protocol and identity

- Authorization code with PKCE succeeds for a test provider.
- Provider metadata, JWKS, signature, issuer, audience, time and nonce are verified.
- Invalid state, reused state, expired state, replayed code, incorrect redirect and missing PKCE verifier are rejected.
- Untrusted callback parameters, forged proxy headers and unexpected provider claims cannot authenticate a user.
- A missing group or denied policy yields no local session.
- Identity matching uses issuer plus subject; email rename, display name change and case variants cannot silently link a different account.
- First login provisioning is idempotent. Concurrent logins do not create duplicate local accounts.
- Local existing users cannot be claimed through an email collision.
- Login, logout, session expiry, revocation and suspended accounts act as documented.
- Secrets, codes, cookies and bearer tokens never appear in application logs or public test output.

## Crypto, privacy and user separation

- Authentication is not treated as sufficient to decrypt password wrapped user data.
- With separate unlock passphrase, wrong or missing passphrase never reveals account data.
- With any optional server managed key design, document and test trust boundaries, wrapping, rotation, backup and recovery.
- A restored account can decrypt its history using the supported recovery method.
- User B cannot read, update or delete user A content through API identifiers, direct requests or browser storage.
- Reusing a browser with different accounts clears inappropriate cached identity, encryption key and history state.
- Playlists, subscriptions and watch progress use per user storage on all tested clients.
- Missing provider, denied access and unexpected server restart fail closed.

## Upgrade and rollback

- Pin the baseline upstream commit and image digests.
- Ensure docs and OIDC code can be rebased or merged onto a newer upstream version.
- Run the upstream Svelte typecheck, ESLint and production build.
- Unit tests cover identity mapping, crypto key handling and session utilities.
- Integration tests run disposable app, database and a standards compliant OIDC test provider.
- Browser end to end tests cover login, account switch, playback history and playlists.
- Test backup, migration and restore on copied disposable data before any production rollout.
- Keep previous image and backup available; do not assume schema downgrades are supported.

## Test environments

M0: Source inspection and written architecture only. No remote host access.

M1: Isolated upstream deployment with disposable users, local only.

M2: Fork build and separate OIDC test provider; no live family identity provider.

M3: Controlled staging environment and limited opt in real provider validation after explicit approval.

## Definition of done for M0

1. Existing authentication and encryption data flows mapped to source files.
2. OIDC proof of concept approach approved with clear non goals.
3. User provisioning and identity collision policy documented.
4. Encryption unlock and recovery options evaluated without claiming unsupported one step sign in.
5. Test strategy, rollback and upstream sync plans recorded.
6. No production network, Docker, Cloudflare, Authentik, account or data modifications.

## Tool use policy

Use GitHub for upstream research and code documentation. Use local development tooling or isolated test containers only after checking host capacity and obtaining approval for deployment affecting existing infrastructure. Conserve remote desktop tool calls.


## M0 source review follow-up tests

The evidence and integration proposal are in [M0-SOURCE-REVIEW.md](./M0-SOURCE-REVIEW.md).

- Model an OIDC-only account without requiring a usable local password. Prove existing local accounts still authenticate unchanged after any migration.
- Confirm authentication can succeed while the master key remains locked, and that protected data cannot decrypt until a correct passphrase is supplied.
- Verify revocable local OIDC sessions are not the existing indefinitely verifiable signed user-ID bearer tokens. Exercise sign-out, expiry, IdP outage, session rotation and account switch.
- Test all user-content endpoints against cross-user identifiers, particularly subscription writes/deletes and global primary keys; classify any baseline defects separately from OIDC regressions.
- Verify OIDC user display names, email claims and rename events cannot grant local administrative privileges.
- Demonstrate where the browser, desktop and Android clients persist tokens and raw master keys, and test an explicit clearing policy after logout or switching accounts.
- Verify Quick Connect device pairing cannot bypass the intended OIDC session lifecycle or key-unlock policy.
- Treat native personal playlists as an outstanding product requirement unless independently implemented and tested; OIDC login alone cannot satisfy this requirement.

## Detailed M0 security and lifecycle acceptance cases

See the [M0 design contract](./M0-DESIGN-CONTRACT.md) and [threat model](./THREAT-MODEL.md).

- Two-stage enrollment must not create a usable account from a verified OIDC identity until the encrypted master-key envelope and identity link commit atomically. Retried and concurrent enrollment must be idempotent.
- Previously existing local accounts retain working login and encrypted data after an OIDC-only schema migration. OIDC-only accounts cannot use legacy password authentication.
- Reject simultaneous conflicting legacy and OIDC identities, including a stale signed legacy cookie alongside a different OIDC cookie.
- Session revocation, idle and absolute expiry, user disable and provider outage must behave exactly as documented. IdP suspension is not automatically an immediate revocation guarantee.
- Cookie-authenticated mutations require deliberate CSRF defences; test malicious cross-site POST/DELETE requests and origin mismatches.
- No protected data is decrypted in an authenticated-but-locked OIDC session; wrong unlock passphrase and lost recovery secret have clearly documented results.
- An authenticated but locked browser must not read user A's cached or persisted private data after user B signs in.
- Check every user-content query for user ID scoping, especially subscription GET/DELETE and globally unique identifiers, and classify baseline findings separately from integration regressions.
- Confirm provider-supplied email, username and group values cannot grant another user's account or administrative privileges.
- Demonstrate recovery on disposable encrypted content and backup copies before any family pilot.
- Verify upstream compatibility with a pinned release and executable local/regression tests; do not count these M0 design entries as tests already passed.

## M1 baseline regression cases from final M0 review

Detailed steps and source references: [M0 security and migration review](./M0-SECURITY-AND-MIGRATION-REVIEW.md).

- Inspect browser cookie attributes after local login and after local logout. The source currently writes `userid` with `Path=/api` but deletes with `Path=/`; test that a cookie-authenticated API request is denied after logout when no bearer Authorization header is sent.
- Verify the existing user password hash is treated as a **reusable authentication credential** in security assumptions, with a test using disposable accounts only.
- Test `amSubscribed`, subscription deletion and subscription creation across two user identities, including known/unknown subscription IDs and global primary-key collisions.
- Test that subscription reads resolve the same `UserId` association as writes in SQLite, PostgreSQL and MySQL/MariaDB; a source query uses lowercase `userId` while writes use uppercase `UserId`.
- Test deleting a user and checking for orphaned encrypted records or reused identifiers.
- Check all mutating JSON endpoints against cross-site, missing-origin and cookie-only requests; do not assume built-in form CSRF protection covers every API endpoint.
- Check per-user cache separation in localStorage, IndexedDB, Svelte stores, concurrent fetch results and post-logout state.
- Rehearse OIDC-only nullable password field migration on copied SQLite, PostgreSQL and MySQL/MariaDB baselines as relevant, comparing legacy credential and master-key envelopes exactly, and restore a prior backup after a simulated migration failure.
- Distinguish **unmodified upstream defects** from OIDC regressions. Document any proposed patches on reviewable feature branches, not on `main`.
