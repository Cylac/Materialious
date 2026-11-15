# M0 design contract: account lifecycle, sessions and encryption

Status: **Proposed for review. No implementation or tests run.**
Date: 2026-11-15.
Evidence: [M0 source review](./M0-SOURCE-REVIEW.md), Materialious Full source at fork baseline fc971b90c1fd61c81c28dfa1a0aee9367697eeab.
This document records the proposed initial integration contract. It is **not** a declaration that M0 is complete.

## Scope and non-goals

- Target only the Materialious Full web edition first, with a trusted server-side OIDC client.
- Preserve existing local login and existing encrypted user content.
- Default OIDC disabled. No local-account conversion or automatic linking in the initial proof of concept.
- Keep Authentik as the first disposable test provider, but use OpenID Connect discovery and generic protocol claims.
- Do not add native mobile OIDC, provider-initiated logout, server-managed master keys, native personal playlists or production deployment to the M2 protocol prototype.
- Nothing in this document authorizes changes to ORION or existing identity infrastructure.

## ADR 001: Separate identity authentication from client-side data unlock

**Proposed decision:** OIDC authenticates the user. A distinct user-selected **data unlock passphrase** decrypts the existing per-user random master key inside the browser.

- Use the existing libsodium wrapping and data-encryption primitives unless security review demands a change.
- Provision the random master key client-side; store only an encrypted envelope, nonce and KDF salt server-side.
- Never use the OIDC subject, client secret, access token or ID token as encryption-key material.
- Do not send the raw master key or passphrase to the backend.
- For a new device, an OIDC session alone does **not** unlock viewing history, subscriptions or settings.
- Existing local accounts keep their current password-derived envelope until an authenticated user explicitly chooses to link or migrate.
- Existing web clients persist the raw master key by default. The new OIDC flow should initially avoid persistent raw-key storage and instead use memory-only unlock state; changing this is a scoped code task and must not silently alter legacy login semantics.
- Client-side encryption does not protect against a malicious JavaScript bundle served by a compromised origin. State this limitation accurately.

**Recovery proposal:** Use a separately generated, high-entropy, one-time-displayed recovery secret that wraps the **same** master key under a separate encryption envelope. Server stores only the encrypted recovery envelope. The user stores the recovery secret offline. Recovery requires both access to the correct account and the recovery secret. After successfully decrypting, the browser can rewrap the existing master key under a new passphrase without re-encrypting every item.

No unencrypted or server-escrowed recovery key. A forgotten passphrase **and** lost recovery secret means encrypted data may be irrecoverable, even if the user can sign in with Authentik. Backup/restore must include both encrypted envelopes and all encrypted content. Recovery is a design proposal, not yet implemented.

**Gate:** M2 must demonstrate new-account passphrase unlock and wrong-passphrase isolation. M3 must test recovery before an M4 family pilot.

## ADR 002: Two-stage OIDC account onboarding

**Proposed decision:** An unknown verified OIDC identity enters **pending onboarding**, not a fully provisioned local account, until the browser submits valid encrypted master-key material. Creation and identity linking commit atomically.

1. Server validates the provider callback and stable pair (exact issuer identifier, exact subject). Claims such as email or preferred username are display-only.
2. If an active mapped identity exists, the server may create a short-lived local application session subject to policy. The client remains **locked** until a correct data passphrase is provided.
3. If no mapping exists and auto-provisioning is explicitly enabled, create a short-lived, server-held **pending enrollment** context. It is not a regular application session and grants no user-content access.
4. Browser collects a distinct unlock passphrase, generates a random master key, wraps it with a password-derived key, and optionally prepares the separate recovery envelope. Validate envelope structure and KDF constraints. The server cannot validate the passphrase itself.
5. A single database transaction creates the internal User record and the OIDC identity link with a unique (issuer, subject) constraint. A rejected or abandoned enrollment must never create an unlocked account. Retry after a network error must be idempotent.
6. Create a regular OIDC session **only after** the account and identity record exist. The client can unlock with its passphrase and read its own encrypted content.

**Default policy:** OIDC auto-provisioning off. M2 may explicitly enable it for disposable identities. When OIDC registration is disabled, a valid but unknown issuer/subject must not silently create an account. Local registration and OIDC provisioning must be separate controls.

**Account columns proposed:** Preserve internal immutable user UUID and existing username for compatibility. Add a local-login-enabled marker defaulting to enabled for existing rows. Permit null password hash/salt only for explicitly OIDC-only rows. The local login path must reject accounts without active local credentials, before any timing-safe comparison. Do not populate OIDC-only rows with shared dummy credentials. Retain the non-null encryption envelope fields for fully provisioned accounts. Derive any compatibility username from a random server-generated identifier, not email or a provider-controlled claim, and ensure collision handling.

**Identity table proposed:** one immutable link row per verified (issuer, subject), referencing User.id with a database uniqueness constraint, explicit disabled status and timestamps. For initial M2, one provider and one identity per OIDC-only user. Future multiple-provider links require a separate reviewed feature.

**Existing local account link policy:** Disabled in M2. A later opt-in linking action must require fresh proof of the **already unlocked local account**, a fresh OIDC authentication in the same bounded operation, a uniqueness check and user-visible confirmation. Email equality, identical display names and existing usernames are insufficient proof.

**Database caveat:** Current Sequelize setup uses sequelize.sync() followed by a small manual migration. Explicit, transactional and idempotent migration code will be needed to alter the password columns and create new tables, with especially careful SQLite tests. Do not rely on a development auto-sync to safely alter a live database.

## ADR 003: Separate, revocable OIDC sessions

**Proposed decision:** For full web OIDC, use a server-side opaque session **distinct** from the existing signed-user-ID cookie and legacy bearer token.

- Issue random session handles with sufficient entropy, persist only their hashes server-side, and rotate handles after authentication and other session transitions.
- Use a host-only cookie, for example __Host-materialious-oidc, with Secure, HttpOnly, Path=/ and SameSite=Lax, and an appropriate short expiry. Do not publish application session tokens to browser localStorage.
- Check session validity, expiry, revocation, user status and identity status on **each** protected request. Use idle and absolute expiry; the exact policy and cleanup mechanism must be chosen and tested.
- Use explicit CSRF protection for **mutating requests authenticated by cookie**, including Origin/Referer validation and a synchronizer-token or equivalent defence where applicable. SameSite alone is insufficient; do not confuse OIDC callback state with application mutation CSRF.
- Never reuse a provider access token as a Materialious API bearer token. For M2, avoid storing IdP refresh tokens entirely unless a concrete requirement emerges.
- On local logout, revoke the local server session and clear the cookie. Separately decide whether a provider-wide logout is desirable; an IdP browser session can remain active.
- **Important:** IdP account suspension does not automatically invalidate an already-issued local session unless a back-channel notification, introspection or local revocation check is implemented. M2 uses short bounded local sessions and explicit local disable/revoke; document the maximum delay. Do not claim immediate IdP revocation.
- For provider outage, existing valid sessions may continue until their documented lifetime. New authentication fails closed. A missing provider must never trigger local authentication bypass.

**Mixed-authentication concern:** The current hooks resolve a legacy signed cookie before a legacy Authorization header. While both systems coexist, a request carrying a legacy credential for user A and an OIDC cookie for user B **must not** accidentally authorize as either identity. Explicitly define conflict rejection and legacy session compatibility, and test it. Retain the local-login route and legacy behavior except where a separate security correction is reviewed.

**Authorization boundary:** Change auth resolution in a small, testable server module and project the resolved immutable internal User.id plus auth method into event.locals. Every protected API operation must check that resolved identity. Never trust a caller-supplied user ID or unverified proxy identity header.

**Native clients and Quick Connect:** Outside initial M2 web scope. Native browsers have a distinct OAuth security model. Existing Quick Connect transfers both the old bearer token and the raw master key; it must not be treated as automatically compatible with revocable OIDC sessions.

## ADR 004: Three explicit browser states

| State | Valid server session? | Raw master key available? | Allowed |
| --- | --- | --- | --- |
| Signed out | No | No | Public routes and sign-in |
| OIDC authenticated, locked | Yes | No | Minimal identity, unlock and logout interfaces; no plaintext private account data |
| OIDC authenticated, unlocked | Yes | Yes, in client memory | Per-user encrypted data operations |

- At startup, an OIDC session is established independently of browser key state.
- A valid session must not be inferred from a persisted raw key.
- After sign-out, account switch, session expiry or user disable, revoke/clear authentication state, erase in-memory key and sensitive caches, and prevent later asynchronous actions from repopulating previous-user state.
- Evaluate shared IndexedDB and persisted Svelte stores as separate leakage channels. Existing local Dexie data is not inherently keyed by account.
- For initial proof of concept, fail closed and require fresh unlock rather than reusing potentially stale decrypted keys.
- Changing from OIDC to a local account, or vice versa, requires deliberate state clearing and tests.

## ADR 005: Provider neutrality and least-privilege configuration

- Require a server-configured **exact** issuer URL, discovery document from that issuer over HTTPS, fixed client identifier, fixed registered callback and an approved signing algorithm policy.
- Never dynamically discover an issuer from untrusted query parameters or accept arbitrary metadata/JWKS/token URLs, which can create SSRF and issuer substitution risks.
- Use authorization code flow with S256 PKCE, one-time browser-bound state, nonce, exact redirect URI, audience/client ID, issuer, signature/key verification, expiry, issued-at and applicable authorized-party validation. Enforce library-supported token validation, not manual JWT decoding.
- Multiple configured issuers in the future require explicit mix-up defences (such as issuer response identification or distinct callback routes). Do not generalize a single-provider proof-of-concept into unbounded discovery.
- Group claims should support optional **admission policy** only and fail closed if required and missing. They do not directly confer Materialious admin privileges.
- Existing Materialious admin authorization uses configured usernames; prevent provider-controlled usernames from becoming an indirect route to administrator status. A server-generated compatibility username is not a security role.

## ADR 006: Separate product gap for native personal playlists

Existing Materialious YouTube backend returns no personal playlist collection and its playlist write functions are no-ops in this mode. Therefore OIDC does **not** satisfy the complete intended family experience by itself.

Decision proposal: do not widen the M2 protocol prototype with playlist implementation. Keep per-user native playlist persistence, privacy, schema, API and encrypted synchronization as an explicit **release blocker** before declaring the family-facing M4 feature set complete, unless a separately approved equivalent is verified.

## Planned module boundaries and smallest changes

New, isolated server modules (proposed):

- src/lib/server/oidc/config.ts: fixed trusted issuer/client/callback settings.
- src/lib/server/oidc/flow.ts: discovery, authorization request, callback and token validation using a maintained OIDC library.
- src/lib/server/oidc/identity.ts: immutable subject mapping and admission/provisioning rules.
- src/lib/server/oidc/session.ts: opaque session creation, validation, revocation and expiry.
- src/lib/server/oidc/enrollment.ts: atomic pending-enrollment completion and encrypted-envelope verification.
- src/routes/api/oidc/...: fixed start, callback, status, enrollment, unlock-envelope and logout routes.
- src/lib/api/backend/oidc.ts: browser-facing OIDC initiation/status/enrollment helpers; key derivation and decrypting remain client-side.

Likely minimal upstream touch points: hooks.server.ts, server/database.ts, server/user.ts, client login route, app layout/state guards, backend request helper, account logout/caches, user authorization endpoints. No replacement of the existing account backend.

The actual module layout, package selection and migration mechanism are deferred to implementation review. Avoid needless files and code changes until M1 baseline passes.

## M0 review questions still open

1. What is the absolute and idle lifetime for OIDC sessions? Decide how suspended identities are revoked and what guarantee is realistic when the IdP is offline.
2. Should unlocked OIDC master keys be memory-only by default (recommended), with an explicit opt-in remember-device mode considered later?
3. What UX is appropriate for a nonrecoverable account and when should the proposed offline recovery secret be mandatory?
4. Confirm the verified OIDC-only schema can be migrated and restored across SQLite, PostgreSQL and MySQL without breaking existing accounts.
5. Specify the exact CSRF strategy for all cookie-authenticated mutations, including legacy cookie compatibility and shared browser conflict handling.
6. Record acceptance tests for the existing user-scoping issues and decide whether security hardening is required before any OIDC-enabled disposable prototype.
7. Explicitly confirm the M2 web-only scope, local password compatibility and no automated account linking.

M0 remains **in progress** until decisions and the threat model have been reviewed against these gates.

## Standards and secure-design references

- OIDC Core 1.0: https://openid.net/specs/openid-connect-core-1_0.html
- OAuth 2.0 Security BCP, RFC 9700: https://www.rfc-editor.org/rfc/rfc9700
- OAuth for Browser-Based Applications, RFC 10017: https://www.rfc-editor.org/rfc/rfc10017
- OAuth for Native Apps, RFC 8252: https://www.rfc-editor.org/rfc/rfc8252
- PKCE, RFC 7636: https://www.rfc-editor.org/rfc/rfc7636
