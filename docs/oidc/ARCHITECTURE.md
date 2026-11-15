# Proposed OIDC architecture and security decisions

Status: Hypothesis under review. Do not implement or deploy without completing M0.

## Existing backend verified in source

- The full web edition uses SvelteKit with a Node.js backend and Sequelize.
- The account creation endpoint receives a browser derived password hash plus a master key encrypted under a password derived key.
- Login verifies the derived password hash, sets a signed userid cookie, and returns an authentication token with the encrypted master key material.
- The browser decrypts its master key, which is used for encrypted history, subscriptions and settings.
- Server hooks resolve a userid cookie or signed bearer token into a local user identifier.
- A simple OIDC identity claim cannot, by itself, decrypt the existing password protected master key.

Source areas:
- materialious/src/routes/api/user/create/+server.ts
- materialious/src/routes/api/user/login/+server.ts
- materialious/src/hooks.server.ts
- materialious/src/lib/server/user.ts
- materialious/src/lib/server/database.ts
- materialious/src/lib/api/backend/index.ts
- materialious/src/lib/api/backend/history.ts

These are implementation observations, not evidence of completed OIDC support.

## Candidate architecture

1. Authenticated user initiates sign in using an optional OIDC button.
2. Backend creates a short lived, single use state/nonce/PKCE context and redirects to the configured provider.
3. Provider authenticates the user and returns an authorization code to a fixed registered callback URI.
4. Backend exchanges the code and validates issuer, audience, expiry, nonce, signature and related claims using trusted provider metadata.
5. Backend maps a unique (issuer, subject) identity to an internal immutable Materialious user ID.
6. Provisioning or linking occurs only under an explicit, safe policy. No implicit matching by email or display name.
7. Backend issues its own secure, session scoped authentication state; provider tokens are not used as Materialious API tokens.
8. Client unlocks its data encryption master key through the separately selected key management design.

## Encryption decision pending

### Option A: OIDC identity plus a local data unlock passphrase

- Identity provider login does not replace the user's data encryption passphrase.
- Preserve browser side data decryption and meaningful end to end confidentiality.
- Requires second step to unlock account data on a new device.
- Likely lower risk for a first proof of concept.

### Option B: OIDC identity plus server managed per user encryption keys

- Can enable one step sign in with cross device sync.
- Requires secure key wrapping, access policy, key rotation, recovery and a way to segregate users.
- Changes the trust boundary: a compromised server or privileged operator may decrypt data.
- Must be described as encryption at rest, not equivalent to original end to end encryption.
- Consider only as explicit opt in, not as an undisclosed default.

Do not store decryption keys in source, images, logs, environment documentation or the public repository. Never derive a stable encryption key directly from the OIDC subject or access token.

## Data and sessions

- Identity link table should include issuer, subject, user ID, created date and explicit link status with a unique (issuer, subject) index.
- Use provider subject for identity stability; email and username may change.
- Ensure session cookies use secure, httpOnly, appropriate SameSite and scoped paths.
- Separate login sessions from long lived OIDC provider access and refresh tokens.
- Avoid trusting proxy supplied headers unless verified by a deliberately configured trusted component and a protected transport boundary.
- Document session revocation, IdP outage, identity suspension and logout behavior.
- Safely handle existing local accounts and prevent account takeover through auto linking.

## Open technical risks

- The upstream login cookie lasts 60 days and does not itself provide comprehensive centralized session revocation.
- The upstream frontend stores a backend bearer token and decrypted master key in client state. Review its handling before integrating OIDC.
- Quick connect and native platform authentication may differ from web only OIDC.
- Server side database migrations may not be trivially reversible.
- Upstream changes to login, crypto and session code are merge hot spots.
- A reverse proxy can gate entry but cannot replace per user Materialious encryption and identity mapping.

## Initial design choice

M0 recommends validating Option A first, preserving existing client encryption. Do not promise genuine one step SSO until a threat model, prototype and user experience review establish whether Option B is appropriate.

## Production separation

- Build and test using disposable identities and volumes.
- Bind test ports to localhost or a deliberately isolated interface.
- No production Authentik provider, DNS, Cloudflare resources, tunnelling, current container or account modifications in M0.
- Keep deployment secrets and site specific network diagrams in a private operational repo rather than this public fork.
