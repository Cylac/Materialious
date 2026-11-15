# OIDC test strategy

Status: M0 planning baseline. These tests have not been executed.

## Baseline acceptance (before custom code)

- Two separate Materialious Full accounts can register and sign in.
- User A history, saved playback progress, channel subscriptions, playlists and settings do not appear under user B.
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
