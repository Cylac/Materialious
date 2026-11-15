# OIDC integration roadmap

Status: Planning and feasibility. No production integration exists.

## Goal

Introduce optional standards based OpenID Connect login to the full backend edition of Materialious, preserving individual users' history, subscriptions, playlists and settings across devices. The design should be provider neutral and usable with identity providers such as Authentik, Keycloak and other compliant implementations.

This document is planning material for an independent community maintained fork, not an upstream feature commitment.

## M0 source review checkpoint, 2026-11-15

A source-level review of the fork at `cf16807d5bf5572d90b3bef4415f65d4362baaf2` is recorded in [M0-SOURCE-REVIEW.md](./M0-SOURCE-REVIEW.md).

- Preliminary assessment: provider-neutral OIDC on Materialious Full web appears viable **with separate client-side data unlock**. It is not implemented, tested or approved for release.
- The existing `User` model has required local-password fields; an explicit OIDC-only account state and tested migration will be necessary.
- Existing auth credentials and the raw master key are persisted in client state. OIDC session revocation, browser account switching and remembered keys need their own design.
- The built-in Materialious account backend does **not** currently implement native personal-playlist storage in YouTube mode. Personal-playlist calls rely on Invidious. This is a separate acceptance gap for the family use case.
- Keep the draft PR open and the project at M0 until the documented design decisions and test prerequisites are addressed.

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
