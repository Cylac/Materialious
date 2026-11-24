# M1 isolated baseline runbook: unmodified Materialious Full 1.18.35

Status: **Isolated local container started, only preliminary smoke and empty-DB backup checks completed. M1 user acceptance NOT complete.**
Prepared: 2026-11-18. Local startup checkpoint: 2026-11-19
Related: [M0 decision record](./M0-DECISION-RECORD.md), [test plan](./TEST-PLAN.md), [1.18.33 upstream review](./UPSTREAM-1.18.33-REASSESSMENT.md).

## Goal and hard boundaries

Test the **unmodified upstream** Materialious Full release 1.18.35, commit `deb7fb133df5efa4e95c3b343677369fdf3ec9fd`, with disposable local users and independent persistent test storage.

This runbook **does not authorize** a host deployment. For any test on ORION, first review running Docker resources, choose a wholly isolated location/network/ports and obtain explicit approval. Do not touch existing containers, proxy, DNS, Authentik, family databases, Cloudflare, production volumes, or the GionetHome tunnel. A separate disposable host or sandbox is preferable.

No external identity provider is needed for M1. The test must prove original Materialious behaviour before custom OIDC code.

## Release and artifact pinning

- The upstream Full Docker build workflow is `.github/workflows/prod-full-web.yml`: it publishes `wardpearce/materialious-full:latest` and `wardpearce/materialious-full:<package-version>`.
- Upstream source `materialious/package.json` at the reviewed SHA declares version `1.18.35`.
- Before use, **verify** that `wardpearce/materialious-full:1.18.35` exists, is associated with the intended upstream build, and capture an immutable platform-specific digest. Publishing a version tag in workflow does not itself establish availability or provenance.
- In a disposable test shell, inspect with `docker buildx imagetools inspect wardpearce/materialious-full:1.18.35` and record the selected digest. Never assume the digest, and do not deploy `latest`.
- If no trustworthy published image is available, create a reproducible isolated build from the pinned upstream source. Do not substitute our unfinished OIDC branch.

## Ready-to-customize isolated Docker Compose example

This is a **future** test template, NOT a command to run on ORION. The image must be set to a verified immutable reference in a local, untracked environment file. The example intentionally does not hardcode any credentials or internal hostname.

```yaml
services:
  materialious-m1:
    image: ${M1_IMAGE_REFERENCE:?Set verified digest reference}
    restart: "no"
    ports:
      - "127.0.0.1:33033:3000"
    environment:
      COOKIE_SECRET: ${M1_COOKIE_SECRET:?Set a unique random secret}
      DATABASE_CONNECTION_URI: "sqlite:///materialious-data/materialious.db"
      PUBLIC_INTERNAL_AUTH: "true"
      PUBLIC_REQUIRE_AUTH: "true"
      PUBLIC_REGISTRATION_ALLOWED: "true"
      PUBLIC_QUICK_CONNECT: "false"
      PUBLIC_CAPTCHA_DISABLED: "true"
      RATE_LIMIT_DISABLED: "false"
      PUBLIC_DOWNLOAD_DISABLED: "true"
      PUBLIC_DANGEROUS_ALLOW_ANY_PROXY: "false"
    volumes:
      - materialious_m1_disposable_data:/materialious-data

volumes:
  materialious_m1_disposable_data:
```

**Safety details:** Port binds to 127.0.0.1 only. No shared production volumes. No production proxy/Cloudflare/DNS and no Authentik provider. Registration and HTTP-only captcha bypass are acceptable **only** inside this private disposable test environment, never as a public configuration. The Compose project name and volume prefixes must be checked for collisions before starting. Store the generated `M1_COOKIE_SECRET` and verified image reference in an ignored local `.env` or an equivalent private secret provider; never commit it.

The upstream Full image and basic SQLite environment syntax are described in `docs/DOCKER-FULL.md`. The above has **not** been run or validated yet.

## M1 test sequence

### Gate 0. Isolation and provenance

- [ ] Confirm test host and available capacity, and record why the planned port/volume/network cannot collide with existing services.
- [ ] Confirm unmodified upstream 1.18.35 source SHA and immutable Docker image digest.
- [ ] Create separate persistent disposable storage and unique random session secret. No real family users or production credentials.
- [ ] Save an inventory of test configuration without secrets, DB engine/version, and actual test start timestamp.
- [ ] Prepare a repeatable teardown/restore procedure restricted to the disposable Compose project and exact named volumes only. Never issue blanket Docker cleanup.

### Gate 1. Baseline application behaviour

- [ ] Launch the isolated Full app, confirm the expected version and inspect logs for database creation/migration errors.
- [ ] Register test user A and user B with distinct long random passwords. Confirm local login, logout and a clean new browser session.
- [ ] Create, update and resume watch history/progress in account A and verify sync on another browser/device. Verify B cannot read A history.
- [ ] Subscribe/unsubscribe to channels, verify live UI state and synced account state.
- [ ] Set and sync preferences across browsers and restart.
- [ ] Create a **native private Materialious playlist**, add two videos, verify ordering, remove one, read from a second browser and delete. Verify B sees none of A's playlists. Do not confuse an Invidious playlist with a Materialious playlist.
- [ ] Record any playback/video source limitations separately from account sync failures.

### Gate 2. Authentication, encryption and security

- [ ] Verify cookie `userid` attributes on login and deletion behaviour on logout, explicitly testing the upstream `/api` versus `/` path mismatch with no Authorization header.
- [ ] Verify signed legacy bearer token persistence and inability to revoke independently of cookie logout. Treat bearer tokens as sensitive and use **disposable credentials only**.
- [ ] Confirm new local TOTP can be set up, verified, required on fresh login and disabled according to documented flows. Verify incorrect/replayed TOTP code rejection.
- [ ] Confirm no master-key plaintext appears in network payloads or sanitized server logs; inspect browser storage and client caches after logout and account switching.
- [ ] Test direct cross-user **subscription** GET, DELETE and global identifier collisions; document actual results, not hypotheses.
- [ ] Test direct cross-user **playlist** GET, DELETE and video add/remove against another user's ID, including ownership checks.
- [ ] Confirm non-admin users cannot access user management APIs and local TOTP cannot silently grant admin rights.
- [ ] Test unsupported unauthenticated requests and any cross-site mutating JSON requests via controlled local test clients; avoid broad vulnerability scanning.
- [ ] Verify account delete requires the intended proof, and inspect whether dependent history, subscription, setting, playlist and TOTP data is properly removed.

### Gate 3. Database durability and upgrade comparison

- [ ] Back up the disposable 1.18.35 DB and restore into a separately named test volume. Confirm encrypted data still unlocks on a fresh client.
- [ ] Optionally prepare a **separate** disposable 1.18.27 baseline DB, back it up, and migrate a *copy* forward to 1.18.33.
- [ ] Inspect new playlist and TOTP tables/columns and ensure existing password salts, encrypted master key and user data are unchanged.
- [ ] Simulate an interrupted migration against a disposable copy, and verify the backup restores. Do not assume version downgrade is supported.

### Gate 4. M1 conclusion

- [ ] Produce a table of PASS/FAIL/NOT TESTED for each gate, with app SHA, image digest, database type and sanitized evidence.
- [ ] Classify upstream baseline defects separately from OIDC integration work. Never report a source hypothesis as a proven exploit without test reproduction.
- [ ] Record whether account history, native private playlists, subscriptions and settings are truly suitable for the family use case.
- [ ] If any user isolation or encryption gate fails, mark M1 blocked and write a minimal scoped remediation plan rather than proceeding to M2.
- [ ] Only after M1 passes, create an isolated feature branch for minimal OIDC web prototype and disposable provider integration.

## Failure and safety policy

If there is any chance of using an existing ORION volume, network, token, hostname or reverse proxy, **stop**. Use a disposable host or review the isolation with the user before starting. Nothing in this runbook should be executed against a production service or real family identity.

If the upstream image, existing local authorization, session cookies or database migration behave unexpectedly, record the exact observation and return to source review before implementing a workaround. Preserve the original working setup and keep the OIDC feature PR open and draft.

## M1 preliminary local execution checkpoint, 2026-11-19

The owner authorized an **isolated local** deployment as the foundation for a future private family service. An operator-controlled Docker host is now running **unmodified upstream 1.18.35**, with published OCI index digest `sha256:9ad5e04634809a44aa48eb25ab828e5ebd2659870bff836c5b89257a6b3ee46c`. The container uses a dedicated network, a loopback-only HTTP port, disposable SQLite storage, a nonroot runtime UID and a generated local secret. **No real household information, hostnames, IPs, paths or secrets are recorded in this public repository.**

Executed preliminary checks:

- Container `healthy`, restart count 0 after startup, configuration reported version 1.18.35 and internal authentication/require-auth enabled.
- Anonymous `GET /api/config` returned 200, while `/api/user/me`, `/api/user/history`, `/api/user/playlists`, `/api/user/isLoggedIn` and `/api/admin/users` returned 401.
- **Anonymous `GET /api/user/subscriptions` returned HTTP 500**, not 401. The upstream route calls `getUser(locals.userId)` without an explicit auth guard. Treat as a baseline error-handling concern, not proof of cross-user access.
- An empty SQLite database was backed up through Node 26's SQLite backup API and restored to an isolated copy. The restored copy passed integrity check; it contained nine tables and no users. This is **not** a user-data recovery test.

Not run: account creation, dual-user isolation, login/logout browser testing, Quick Connect, TOTP, playlists, encrypted data synchronization, streaming/video proxy testing, full backup recovery and schema upgrade tests. **M1 acceptance is not passed and M2 must not start.**

The private infrastructure repository tracks operational configuration and publication controls. Public DNS, Access, tunnels, real family accounts and production services are unaffected. Additional public publishing changes require a separately reviewed security and rollback plan.

## M1 security validation checkpoint, 2026-11-24

An isolated, unmodified Full 1.18.35 deployment remains running for the M1 baseline. A single disposable account demonstrated registration, remote search and playback, watch history, apparent resume, and encrypted private playlist persistence across a fresh browser session. These manual outcomes **do not** satisfy full M1 acceptance, especially multi-user isolation, session logout and restored-account decryption.

The source review identified missing per-user authorization checks on subscription operations, plus the logout cookie path mismatch. A controlled disposable-database ownership probe confirmed the missing account predicate at the database level, but no live cross-account HTTP exploit was attempted.

A separate **draft** fork change, [M1 account boundaries PR #2](https://github.com/Cylac/Materialious/pull/2), scopes the existing subscription operations, rejects anonymous calls and aligns logout cookie deletion. **Six focused tests pass on the patched source and fail on unmodified upstream 1.18.36.** The tests are local module regression checks, not an end-to-end browser test or a successful GitHub Actions job. The independent M1 runtime is still unmodified, and draft PR #2 is neither merged nor deployed.

A backup of the one-account disposable SQLite database was restored into a separate file and passed structural integrity and foreign-key checks. Actual decryption/unlock on a restored application is still untested. Private operational details and snapshots remain outside this public fork.

**M1 remains blocked for multi-user expansion or M2 OIDC work** until reviewed fixes are fully validated, the legacy session policy is characterized, backup recovery is demonstrated with the encrypted client key, and account isolation tests are completed.
