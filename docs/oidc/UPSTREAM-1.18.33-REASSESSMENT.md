# Upstream 1.18.33 reassessment and M1 baseline decision

Status: **M0 source review update, not runtime verification**
Reviewed: 2026-11-18
Prior reviewed baseline: 1.18.27 at \`fc971b90c1fd61c81c28dfa1a0aee9367697eeab\`
New reviewed baseline: Materialious \`1.18.33\` at \`982ac6f5c04c989fcae3521a3b619a055946753d\`
Repository: https://github.com/Materialious/Materialious

This document supersedes **only** the earlier current-capability claim that Materialious Full lacks native user playlists. Earlier source review documents remain useful historical observations about 1.18.27 and should be read in that version context. No application code was changed or executed during this review.

## Why this review is necessary

Between the fork's last synced upstream baseline (\`81bab78f728ea6f0ddcc5261bd63036fccbbe1d3\`) and 1.18.33, upstream added 41 commits with changes in authentication, database migrations, personal playlists, TOTP two-factor login, client state and native applications. The Materialious project published stable 1.18.28 through 1.18.33 between November 17 and 18, 2026. These are source-level observations, not release validation.

The fork's \`main\` was **fast-forward synchronized** to \`982ac6f5c04c989fcae3521a3b619a055946753d\` during this checkpoint. The OIDC feature branch and draft PR #1 remain independent and documentation-only.

## Native personal playlists have been added upstream

**Corrected finding:** The current Materialious Full YouTube backend provides native per-account personal playlist support. We no longer need to plan a custom playlist implementation as a default project requirement. We must still test it.

Verified code components:

- \`materialious/src/lib/server/database.ts\`: new \`UserPlaylist\` and \`UserPlaylistVideo\` tables. Playlists belong to a \`User\`, videos belong to playlists. A delete cascade is configured for these new associations.
- \`materialious/src/lib/server/playlists.ts\`: encrypted payload validation and \`ownedPlaylist(userId, playlistId)\` performs a user-scoped lookup.
- \`materialious/src/lib/api/backend/playlist.ts\`: client-side encrypt/decrypt with the Materialious master key, create/delete playlists, add/remove videos and load playlists. IDs are prefixed \`materialious-\`.
- \`materialious/src/routes/api/user/playlists/+server.ts\`: list and create only under \`locals.userId\`.
- \`materialious/src/routes/api/user/playlists/[playlistId]/+server.ts\`: user-scoped GET and DELETE.
- \`materialious/src/routes/api/user/playlists/[playlistId]/videos/+server.ts\`: append after a user-scoped parent update inside a transaction; maintains position and revision.
- \`materialious/src/routes/api/user/playlists/[playlistId]/videos/[indexId]/+server.ts\`: checks ownership of the parent before deleting its video.
- \`materialious/src/lib/api/index.ts\`: integrates native playlists alongside Invidious playlists.

Playlist titles and video identifiers/details use client-side encryption; ordering, duration, view counts, timestamps and ownership metadata remain server-visible. The current Materialious-backed create flow supports **private** playlists; do not promise public or shared playlists through this API.

**Impact on goals:** The family requirement for separate saved playlists is now **implemented in upstream source**. In M1, explicitly verify it with two disposable users, a second device, account switching, browser restarts, and malicious cross-account direct API calls. Only after successful execution should it be called proven.

## Upstream added native local TOTP two-factor authentication

Source paths:

- \`materialious/src/lib/server/twoFactor.ts\`: TOTP secret generation and conditional, time-step-aware verification.
- \`materialious/src/lib/server/migrations.ts\`: adds \`twoFactorSecret\`, \`twoFactorVerified\` and \`twoFactorLastTimeStep\` to existing users.
- \`materialious/src/routes/api/user/login/+server.ts\`: requires the TOTP code after verifying the local login credential when a user's two-factor feature is verified. Returns \`two_factor_required\` rather than signing in if the code is missing.
- \`materialious/src/routes/api/user/2fa/+server.ts\` and \`2fa/verify/+server.ts\`: local enrollment/activation and disable operations.
- \`materialious/src/lib/api/backend/twoFactor.ts\` and \`materialious/src/lib/components/settings/TwoFactor.svelte\`: frontend management.

**Architectural decision proposal:** Existing Materialious local TOTP belongs to **local password authentication**, not directly to OIDC. An OIDC-only account uses its configured identity provider's authentication policy and must not be silently forced into the current local TOTP setup endpoints, which require the Materialious password hash. **No automatic linking** to existing local users. When future linking is enabled, a user with local TOTP must satisfy a **fresh local authentication** policy that includes the required TOTP proof, plus fresh OIDC authentication, before linking is permitted.

Important caveat: existing saved legacy signed bearer credentials and Quick Connect must be tested independently; adding TOTP to new password logins does not automatically revoke preexisting long-lived sessions.

## Existing OIDC obstacles still exist in 1.18.33

1. \`Users.passwordHash\` and \`Users.passwordSalt\` still require non-null values. New OIDC-only account provisioning still needs a carefully designed credential mode and schema migration.
2. The browser still needs a separately derived key to decrypt the account master key. OIDC authentication alone cannot supply it.
3. \`hooks.server.ts\` still reads signed legacy user ID cookies / bearer credentials. A distinct revocable OIDC session and deterministic identity conflict policy remain required.
4. \`src/lib/server/misc.ts\` creates the \`userid\` cookie at \`/api\`, while \`src/routes/api/user/logout/+server.ts\` deletes it at \`/\`. The mismatch remains in current source and requires a disposable regression test.
5. \`src/lib/server/user.ts\` still scopes subscription existence and removal by the global subscription ID without an explicit \`UserId\` predicate. The subscription read method continues to use \`userId\` whereas other association calls use \`UserId\`. The suspected access and dialect issues remain untested.
6. The existing login hash is accepted as a direct authentication proof; disclosure of the stored verifier can enable login to the account, even though it does not by itself unlock encrypted content. The server-side OIDC session must not inherit the same properties.
7. Existing \`User.delete()\` still calls \`UserTable.destroy()\` without explicit cleanup for all existing relations. \`/api/user/delete\` now requires the current password proof and clears the \`/api\` cookie, but cascades, orphan retention and future OIDC identity/session deletion need tests.
8. There is still no OIDC implementation in upstream reviewed source.

## Database migration has changed upstream

Old \`runSequelizeMigrations\` logic was extracted from \`database.ts\` into \`materialious/src/lib/server/migrations.ts\`. \`hooks.server.ts\` invokes \`sequelize.sync()\`, then \`runSequelizeMigrations(sequelize.sequelize)\`.

The new migration adds **local two-factor columns**, and new playlist tables and foreign keys. Do not base the OIDC schema plan on the 1.18.27 database alone.

**M1 tests must include:**
- Existing user with and without TOTP set, sign-in and lockout.
- Schema create, restart, migrate from a disposable **1.18.27** database to 1.18.33, and restore of that disposable database backup. Do not assume downgrade works.
- New per-user playlist tables, cascade deletion, video position ordering, encryption envelope integrity and isolation.
- OIDC migration plan updated to accommodate upstream TOTP and playlist associations. Neither may be dropped or overwritten by a proposed nullable-password column change.

## Prior finding status table

| Previous statement / risk | Status after 1.18.33 inspection |
| --- | --- |
| Native Materialious personal playlists unavailable | **Superseded**. Native private playlists present in upstream source. Test in M1. |
| Master key separate from identity authentication | Still accurate. |
| OIDC-only credential schema needed | Still accurate; now includes TOTP-related account fields. |
| Signed legacy user ID session not revocable | Still accurate at source level. |
| Logout cookie path mismatch | Still present at source level. |
| Subscription per-user scoping concerns | Still present at source level. |
| User-scoped playlist API needed for family use | New API exists; test ownership and cross-user access. |
| Baseline should pin 1.18.27 | **Replaced**. Pin **1.18.33**, commit \`982ac6f5c04c989fcae3521a3b619a055946753d\`, to evaluate the current feature set; additionally retain a disposable 1.18.27 database solely for migration comparison. |

## M1 readiness and proposed execution order

**No host or production deployment authorized by this document.**

1. Verify an isolated test host and disposable storage are available. No ORION production container, shared networks, volume paths, reverse proxy, Authentik or Cloudflare changes. Obtain explicit approval before introducing any test runtime to ORION.
2. Pin the application to release \`1.18.33\` at the commit above and obtain an immutable Docker image digest or build from that source in the isolated environment. Never deploy an unpinned \`latest\` as the M1 baseline.
3. First clean database: local user A and B, encrypted history, watch progress, subscriptions, settings and **native private playlists**.
4. Browser logout and account switching: cookie path mismatch, bearer token persistence, localStorage, IndexedDB, caches and active fetch race conditions.
5. Source-flagged security regression cases: subscriptions global IDs, direct playlist API with cross-user identifiers, local TOTP, account deletion and backup restore.
6. Database migration rehearsal on disposable copies, including 1.18.27 to 1.18.33 changes.
7. Capture sanitized results, exact commit/digest, DB type and configuration, and publish only non-sensitive findings to the OIDC docs. Treat current-source vulnerabilities as unverified until tested.
8. Finish M1 acceptance review **before** any M2 custom OIDC prototype.

## M0 decision position

**Conditional GO for preparing M1 only.** The authentication/encryption feasibility hypothesis is preserved, and upstream now supplies important native family features, making it less necessary to modify non-authentication application code. M0 is **not** marked complete until the documented architecture choices (client unlock/recovery, OIDC-only user mode, session expiry, CSRF and identity conflict handling) have been formally accepted as project decisions.

The initial M2 proof of concept remains web-first, using disposable test identities and a provider-neutral authorization code + PKCE flow with independent client-side key unlock.

## References

- https://github.com/Materialious/Materialious/releases/tag/1.18.33
- https://github.com/Materialious/Materialious/tree/982ac6f5c04c989fcae3521a3b619a055946753d/materialious/src/lib/server
- https://github.com/Materialious/Materialious/blob/982ac6f5c04c989fcae3521a3b619a055946753d/materialious/src/lib/api/backend/playlist.ts
- https://github.com/Materialious/Materialious/blob/982ac6f5c04c989fcae3521a3b619a055946753d/materialious/src/routes/api/user/login/+server.ts
