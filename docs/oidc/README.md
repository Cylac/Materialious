# OIDC integration roadmap

Status: **M0 design complete; M1 isolated local baseline running, but acceptance NOT passed.** No OIDC implementation or production integration exists.

## Goal

Introduce optional standards based OpenID Connect login to the full backend edition of Materialious, preserving individual users' history, subscriptions, playlists and settings across devices. The design should be provider neutral and usable with identity providers such as Authentik, Keycloak and other compliant implementations.

This document is planning material for an independent community maintained fork, not an upstream feature commitment.

## M1 isolated startup checkpoint, 2026-11-19

Unmodified upstream **Materialious Full 1.18.35** has started successfully in an isolated local Docker environment, pinned to source `deb7fb133df5efa4e95c3b343677369fdf3ec9fd` and image index digest `sha256:9ad5e04634809a44aa48eb25ab828e5ebd2659870bff836c5b89257a6b3ee46c`.

- Baseline service health, version and anonymous API rejection were checked, and an empty SQLite backup/restore copy passed integrity checking.
- Anonymous subscription listing returned HTTP 500; disposition remains open.
- **No two-user, encrypted data, playlist, login/logout or playback tests have passed.** M1 acceptance is therefore still pending.
- This is a **local-only** test, not authorization for public ingress. Private operational settings and approved hostname are kept outside this public fork.
- See the [M1 baseline runbook](./M1-BASELINE-RUNBOOK.md) for the current test sequence.

## Current upstream checkpoint, 2026-11-18

**Latest reviewed stable version: Materialious 1.18.33, commit `982ac6f5c04c989fcae3521a3b619a055946753d`.** The fork's `main` has been fast-forward synchronized; the OIDC feature branch remains documentation-only.

The [1.18.33 upstream reassessment](./UPSTREAM-1.18.33-REASSESSMENT.md) **supersedes earlier statements that native personal playlists are missing**: upstream now has encrypted, per-user **private** playlists with server-side ownership checks. Functionality and isolation still need an unmodified M1 baseline test. The upstream release also adds local TOTP two-factor authentication and additional database migration logic, which must be preserved and accounted for by future OIDC provisioning.

**M0 technical decision recorded:** [M0 decision record](./M0-DECISION-RECORD.md) concludes **GO to isolated M1 baseline preparation**, with prototype defaults and explicit M2/M4 security gates. [M1 baseline runbook](./M1-BASELINE-RUNBOOK.md) specifies disposable tests. This is **not** approval to deploy on ORION or start custom OIDC code.

## M0 source review checkpoint, 2026-11-15

A source-level review of the fork at `cf16807d5bf5572d90b3bef4415f65d4362baaf2` is recorded in [M0-SOURCE-REVIEW.md](./M0-SOURCE-REVIEW.md).

- Preliminary assessment: provider-neutral OIDC on Materialious Full web appears viable **with separate client-side data unlock**. It is not implemented, tested or approved for release.
- The existing `User` model has required local-password fields; an explicit OIDC-only account state and tested migration will be necessary.
- Existing auth credentials and the raw master key are persisted in client state. OIDC session revocation, browser account switching and remembered keys need their own design.
- **Historical 1.18.27 finding:** Built-in personal playlists were not implemented then. **Superseded by 1.18.33**, which adds native private playlists; M1 must verify them.
- Keep the draft PR open and the project at M0 until the documented design decisions and test prerequisites are addressed.

## M0 design decisions checkpoint, 2026-11-15

- [M0 design contract](./M0-DESIGN-CONTRACT.md) proposes a two-stage OIDC enrollment, separate client-side unlock and recovery, revocable application sessions, and explicit signed-out/locked/unlocked client states.
- [OIDC threat model](./THREAT-MODEL.md) catalogues identity substitution, session and CSRF risks, account migration, persisted key material, and cross-user API access concerns.
- These are **proposed designs**, not implemented behaviour. M0 stays open while the choices and acceptance gates are evaluated.
- Preferred next activity after M0 sign-off is the isolated **unmodified** Materialious Full M1 baseline, not immediate production deployment or Authentik integration on ORION.

## M0 security and migration review checkpoint, 2026-11-15

The [M0 security and migration review](./M0-SECURITY-AND-MIGRATION-REVIEW.md) documents the remaining architecture constraints, additive database migration plan, candidate session settings and source-level baseline security concerns.

- Logout sets and deletes the legacy user cookie under different paths, requiring a disposable browser test before relying on logout semantics.
- Stored local password hashes are reusable authentication proofs if disclosed. This must not be confused with the separate content encryption passphrase.
- Subscription ownership, cross-user caching, account deletion and cookie-authenticated CSRF require explicit tests.
- SQLite column migration may rebuild the Users table. Migration and restore must be validated per supported database dialect.
- Recommended next milestone **after M0 signoff** remains the isolated, **unmodified** M1 baseline. No implementation or infrastructure changes were made during review.

## M0 technical closure and M1 entry

- [M0 architecture decision record](./M0-DECISION-RECORD.md): M0 design/research gate satisfied for M1 entry, with selected prototype constraints and explicit unresolved test risks.
- [M1 isolated baseline runbook](./M1-BASELINE-RUNBOOK.md): prepared, **not executed**, for upstream 1.18.33. Start only after isolation and test host verification; no production infrastructure changes.
- **Current milestone: M1 initial execution.** Local health, anonymous-access and empty-database backup checks completed. Account isolation and functional acceptance remain pending. No OIDC code added. Do not proceed to M2 until M1 acceptance passes.

## Scope and invariants

- Preserve the upstream user and encryption model until a tested design explicitly supersedes it.
- Keep the existing local account login working unless a deliberate, tested configuration disables it.
- Use OIDC authorization code flow with PKCE, validated issuer/audience/signature, state and nonce.
- Establish a stable account link keyed by the provider issuer and subject, not email or username.
- Separate OIDC identity and authorization from Materialious data encryption.
- Ensure separate users never share viewing history, playlists, settings or subscription data.
- Do not accept arbitrary client supplied identity headers as proof of login.
- Make access control and optional group restrictions configurable; default to deny when uncertain.
- Preserve a documented upstream merge and release testing path.
- Avoid modifying or deploying any existing infrastructure during feasibility work.

## Decisions to validate

1. The current full backend's browser session and API bearer token model.
2. How user master keys are created, wrapped, unlocked and rotated.
3. How a user can recover encrypted data when an identity provider is unavailable or an account is relinked.
4. Whether OIDC with a separate user encryption passphrase is suitable for the initial release.
5. Whether a server managed key mode is acceptable as a clearly marked, opt in security tradeoff.
6. Compatibility with native app clients and quick connect, including logout and session revocation.
7. Database migration, backup and downgrade or rollback behaviour.
8. Whether upstream would accept a minimal optional integration despite Materialious issue #1991 being closed as out of scope.

## Milestones

### M0. Feasibility and architecture

- Review full backend login, account creation, session and encryption code.
- Record threat model and architecture decisions.
- Define acceptance tests and upstream update strategy.
- Deliverable: written architecture, test plan, go or no go for a proof of concept.

### M1. Isolated unmodified baseline

- Start a clean, locally accessible Materialious Full test deployment only after infrastructure review.
- Pin the upstream image or commit and retain rollback information.
- Verify separate user accounts, history, subscriptions, playlists, watch progress and device sync.
- Confirm test credentials and data are disposable.

### M2. OIDC proof of concept

- Create a minimal, configurable identity provider integration.
- Verify callback validation, stable user mapping, access policy and logout.
- Keep production accounts and data out of scope.
- Demonstrate a viable encryption unlock model.

### M3. Hardening and migration

- Implement secure provisioning and account linking.
- Validate encryption key protection and recovery.
- Add security regression tests, login throttling, audit logging and backup/restore.
- Test updates from upstream against our changes.

### M4. Candidate release

- Build a reproducible, versioned Docker image with tested configuration examples.
- Document upgrade and rollback procedures.
- Stage a limited family pilot only after approval and successful tests.

## Upstream maintenance

- Keep the fork default branch aligned with upstream main.
- Develop in feature branches and merge only after review.
- Prefer official upstream releases and pinned versions for deployment.
- Use GitHub automation to detect updates and propose branches or pull requests, never unattended production deployment.
- Validate server schema migrations, authentication and encrypted user data before adoption.

## References

- Upstream project: https://github.com/Materialious/Materialious
- Full backend deployment: https://github.com/Materialious/Materialious/blob/main/docs/DOCKER-FULL.md
- Development guide: https://github.com/Materialious/Materialious/blob/main/docs/DEV.md
- Upstream OAuth request (closed as out of scope): https://github.com/Materialious/Materialious/issues/1991
- Licence: AGPL-3.0, follow upstream source and attribution obligations.
