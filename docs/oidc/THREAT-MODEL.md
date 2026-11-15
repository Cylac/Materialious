# M0 OIDC threat model and release safety gates

Status: **Draft, not yet validated by execution.**
Date: 2026-11-15.
Related: [source review](./M0-SOURCE-REVIEW.md), [proposed design contract](./M0-DESIGN-CONTRACT.md), [test plan](./TEST-PLAN.md).

## System and trust boundaries

1. **User browser** loads Materialious JavaScript, receives a secure app session cookie and (once unlocked) holds a raw master key in memory. Compromised browser JavaScript can steal data and keys at unlock time.
2. **Materialious Full server** validates OIDC responses and sessions, authorizes by internal UUID and persists encrypted per-user data. It should never see unlock passphrases or raw master keys in the proposed mode.
3. **OIDC provider** proves identity by signed ID token and server-to-server code exchange. It does not possess a Materialious data-unlock key.
4. **Database** stores local account records, exact issuer/subject identity links, hashed session identifiers, key envelopes and encrypted user content. Some metadata remains plaintext.
5. **Reverse proxy / network** provides HTTPS termination and connectivity. It must not be treated as identity proof based solely on client-supplied headers.
6. **Existing device pairing and native clients** use different credential handling and require separate compatibility testing.

## Security objectives

- A provider identity may access only the internal user to which its exact (issuer, subject) link is bound.
- OIDC authentication alone must not decrypt account content.
- An OIDC-only user must not be able to authenticate through the legacy password endpoint.
- A locked or revoked account must not issue a new session.
- Login state and decrypted data must not bleed across browser accounts.
- Existing local accounts must not lose access as OIDC is introduced.
- The deployment operator must not gain raw user decryption keys under the chosen client-controlled model.
- Public commits, CI logs and error reports must never contain real secrets or infrastructure details.

## Risk register

| ID | Threat | Current observation / concern | Required mitigation and test | Priority |
| --- | --- | --- | --- | --- |
| T01 | Account takeover through email-based auto-link | OIDC email and display names can be changed or duplicated | Only bind exact verified issuer + subject; no automatic local-user email matching; adversarial collision tests | Critical |
| T02 | OIDC callback injection, replay, mix-up or forged token | New callback will handle external assertions | Server-side code flow, one-time browser-bound state, nonce, S256 PKCE, trusted issuer/JWKS, exact redirects, audience and time validation, mix-up defence | Critical |
| T03 | Session fixation or stolen long-lived bearer credential | Legacy signed user-ID token lacks intrinsic expiry/revocation | Separate opaque hashed server sessions, bounded expiry, rotation, server revoke checks, no OIDC bearer token in local storage | Critical |
| T04 | Identity collision between legacy cookie/bearer and OIDC session | Legacy hooks favour the signed cookie then bearer | Reject conflicting identities; explicitly test precedence, no hidden fallback | Critical |
| T05 | Cross-user read/write/delete through global IDs | In server/user.ts, amSubscribed and removeSubscription query by subscription ID without UserId; subscription ID is a global primary key | Add UserId predicate for all query paths, verify ownership server-side, test direct cross-user requests, review unique-key design | Critical |
| T06 | Account key exposure in browser persistence | Web stores rawMasterKey and auth token in persistent storage | Prefer memory-only OIDC unlock, secure cookie, clear caches and keys, assess XSS and IndexedDB; run shared-browser tests | High |
| T07 | CSRF on cookie-authenticated state changes | Existing endpoint handlers rely on resolved locals.userId; new cookie sessions expand CSRF exposure | Origin checking plus explicit CSRF design across unsafe routes; verify no cross-site mutation | High |
| T08 | Local account loss from incompatible schema change | Current User password hash/salt and master-key envelope fields are non-null | Explicit migration, unchanged legacy rows, OIDC-only local-login guard, disposable backup/restore tests | Critical |
| T09 | User locked out by lost passphrase or provider outage | Identity token does not unlock the encrypted master key | Independently stored offline recovery secret and wrapped envelope; clear irrecoverability policy; outage tests | High |
| T10 | IdP user suspension mistaken for immediate session revocation | No OIDC provider-side revocation integration yet | Local account-disable support, short max session lifetime, explicit statement that IdP disable alone is not instantaneous | High |
| T11 | Group/name based admin elevation | Existing Materialious admin check is configured local username | Do not authorize admin from provider display claims; test name/claim spoofing | High |
| T12 | Quick Connect bypass of new OIDC controls | Quick Connect moves bearer token and raw master key inside encrypted payload | Keep out of M2, disable for OIDC accounts until reviewed, separate device/session enrollment design | High |
| T13 | Insufficient per-user personal-playlist persistence | Native YouTube mode playlist operations are no-ops or empty | Track as M4 release acceptance gap; no claim of complete family feature coverage | Medium |
| T14 | Malicious provider discovery, SSRF or redirect | Configurable generic OIDC issuer could be attacker controlled | Server-admin configured issuer allowlist, HTTPS, fixed callback and trusted discovery endpoints; reject arbitrary dynamic issuers | High |
| T15 | Side-channel or metadata leaks | Watch progress/time and other operational metadata are stored in plaintext | Document metadata exposure and avoid overstating E2E confidentiality | Medium |
| T16 | Partial enrollment and concurrent subject creation | User model requires key envelope and identity link is separate | Short-lived pending context, transactional provision, exact unique index and retry/idempotency tests | High |
| T17 | Cross-account cached playback and settings | Global client stores and Dexie tables are not intrinsically scoped to the currently authenticated user | Invalidate and scope in-flight requests/cache after account switch, logout and unlock failure | High |

## Security acceptance gates

Before M1: Finish written account, key recovery, session and threat decisions; verify no production assets are used.

Before M2: Use an isolated, unmodified full-backend baseline to characterize subscription ownership, history isolation, client cache behaviour, Quick Connect and existing password reset. Design and prioritize any discovered baseline security fixes rather than assuming OIDC resolves them.

Before the M2 prototype is considered successful: Test exact issuer/subject mapping, no account takeover by email, state/code replay protection, session expiry/revoke, a locked authenticated session, correct passphrase unlock, error handling, same-browser account switching and unchanged local login.

Before M4: Test loss and recovery of encrypted data, admin privileges, supported native device paths, complete per-user playlists or approved alternative, database migration and rollback on disposable copies, full upstream regression and release image provenance.

## Test matrix for concrete adversarial cases

| Case | Setup | Expected result |
| --- | --- | --- |
| A shares B's email claim | Different exact provider subject | Distinct account or explicit policy rejection; never auto-join |
| A sends subscription ID belonging to B | Valid authenticated A session | Read/update/delete denied or no-op without B data modified |
| A's old legacy cookie plus B's new OIDC cookie | Both appear in one request | Conflict rejected, not silently treated as either account |
| Browser signs out of A and signs into B | Same tab, localStorage and IndexedDB retained | B cannot view A's decrypted/cached history or preferences |
| OIDC login succeeds, passphrase wrong | Valid session, corrupted/wrong unlock input | User stays locked; no private plaintext |
| Auth callback reused | Valid then repeat callback/state | Second exchange fails, no duplicate account/session |
| Two callbacks provision same issuer/subject | Concurrent requests | Exactly one committed account identity; second resolves safely or rejects |
| Provider becomes unreachable | Known session vs no session | Existing bounded local session behaves as documented; new auth fails |
| OIDC-only username appears in admin config | Provider name modified | No privilege granted from user-controlled claim |
| Password-reset endpoint called for OIDC-only user | Valid OIDC session, no local password | Cannot bypass rewrap or create local credentials without explicit reviewed flow |
| Quick Connect used on OIDC-only account | Code path reachable | Not supported until an explicit secure compatibility design passes |
| Encryption recovery after restore | Saved offline recovery secret, disposable encrypted DB | Same underlying master key can be recovered and rewrapped |

## Outstanding baseline security observations, not confirmed exploits

- In server/user.ts, subscription existence and deletion queries omit a UserId predicate, unlike its subscription RSS update. This is a source-level authorization concern, not a proven cross-account attack. Database global primary-key design also needs scrutiny.
- The current legacy cookie is issued with a 60-day browser age, while the signed bearer user ID itself is not time bounded or centrally revocable. OIDC must not inherit these properties.
- The current client persists the decrypted master key. Any strong client-side privacy claim must account for this and for the trustworthiness of code delivered by the application origin.
- Existing quick-connect credentials may be moved to other devices. OIDC's revocation design must not accidentally bless or perpetuate legacy credentials.

Only sanitized disposable identities may be used for security testing, and no destructive testing against production is permitted.

## References

- https://openid.net/specs/openid-connect-core-1_0.html
- https://www.rfc-editor.org/rfc/rfc9700
- https://www.rfc-editor.org/rfc/rfc10017
