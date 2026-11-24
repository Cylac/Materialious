# M0 architecture decision record and gate

Decision date: 2026-11-18
Status: **M0 source and architecture gate satisfied for proceeding to M1 preparation.**
Implementation status: **No application code written; no runtime tests or deployments performed.**
Reviewed release: upstream **1.18.33**, source commit `982ac6f5c04c989fcae3521a3b619a055946753d`.
Based on [reassessment](./UPSTREAM-1.18.33-REASSESSMENT.md), [design contract](./M0-DESIGN-CONTRACT.md), [source review](./M0-SOURCE-REVIEW.md), [security and migration review](./M0-SECURITY-AND-MIGRATION-REVIEW.md), [threat model](./THREAT-MODEL.md), and [test plan](./TEST-PLAN.md).

## Technical go / no-go

**GO to M1, the isolated unmodified Materialious Full baseline.**

**NO-GO to M2 custom OIDC implementation, family rollout or ORION deployment** until the M1 baseline criteria, migration safety and security characterization have been tested. This is a technical readiness assessment, not permission to modify a host or production resources.

The early M0 feasibility question is resolved: an optional, provider-neutral, **web-first** authorization code + S256 PKCE OIDC integration looks viable **provided that authentication stays independent from client decryption**. This is a source-supported architecture hypothesis, not an implemented or integration-tested claim.

## Selected technical direction for the isolated prototype

1. **Local authentication remains intact.** OIDC is opt-in and disabled by default.
2. **Provider-neutral identity binding.** Exact, trusted (`iss`, `sub`) maps to immutable internal `User.id`; never join on email, display name or group names. Automatic linking of pre-existing accounts is prohibited.
3. **Web first.** Full web is the initial OIDC target. Capacitor mobile/desktop and Quick Connect need independent security design and tests before claiming support.
4. **Client-controlled encryption.** New OIDC users choose a separate unlock passphrase. The browser generates and unwraps their own random master key. The passphrase and raw master key are not sent to the Materialious server.
5. **Recovery.** For M2, demonstrate the locked/unlocked model with disposable data and clearly disclose that forgotten unlock credentials cause data loss. Before any family-facing M4 pilot, provide and test an **offline recovery-secret envelope** or explicitly revise scope with a reviewed alternative; do not silently add server key escrow.
6. **New OIDC-only user state.** Two-stage pending enrollment followed by atomic creation of `User` and unique `OidcIdentity`. The current non-null local credential columns require an explicit, tested schema migration. Default automatic OIDC provisioning remains off except in controlled test settings.
7. **Revocable sessions.** OIDC uses distinct opaque, server-side session state, not upstream signed user-ID bearer tokens. Trial settings are 2-hour idle and 12-hour absolute lifetimes, subject to usability and IdP revocation review before release. Reject contradictory legacy/OIDC identities rather than selecting one silently.
8. **Web security.** One-time state, PKCE and nonce, fixed issuer metadata, verified ID token, exact redirect, explicit CSRF protection on cookie-authenticated mutating JSON routes, secure host-only cookie, and session-bound account status checks.
9. **Memory-only OIDC key by default.** The new OIDC unlock path does not persist the unwrapped master key to localStorage by default. Existing local accounts keep their semantics during M2; clear cached sensitive data on account switch or logout.
10. **Upstream local TOTP preserved.** It belongs to local credential authentication. The IdP owns OIDC authentication strength. For future local-to-OIDC linking, demand fresh complete local auth (including TOTP if enabled) and a fresh OIDC transaction.
11. **Reuse upstream playlists.** Native per-user private playlists are present in 1.18.33. Avoid custom playlist implementation by default; M1 must verify real behaviour and privacy before declaring success.
12. **Upstream portability.** Keep OIDC routes and new modules narrow and separate. Handle migrations with tested ordered procedures; preserve upstream 2FA and playlist tables. Keep changes on feature branches and in draft PRs until review.

These are **prototype design defaults** selected to proceed responsibly with M1. Values, recovery UX and native support remain test gates before M3 or M4 and are not advertised as production features.

## M0 completion checklist

| Acceptance item | Assessment | Evidence / limit |
| --- | --- | --- |
| Existing local auth and encrypted data flows mapped | **Satisfied** | M0 source review and design contract; rechecked 1.18.33 |
| OIDC identity and session boundaries proposed | **Satisfied for M1 entry** | Issuer/subject binding, server sessions, web-first architecture; not built |
| Encryption unlock and recovery tradeoffs evaluated | **Satisfied for M1 entry** | Separate passphrase, recovery-envelope option, known loss/escrow tradeoff |
| Security threat model and cross-user checks documented | **Satisfied** | Threat model and security/migration review; tests outstanding in M1 |
| Upstream change and family features reviewed | **Satisfied** | Source re-assessment against 1.18.33, playlist and local TOTP |
| Automated / isolated test acceptance plan recorded | **Satisfied as a plan** | TEST-PLAN and M1 baseline runbook; **zero executable checks passed** |
| No production/network/secret changes | **Satisfied for this session** | GitHub documentation and fast-forward-only fork main synchronization |

**M0 research is therefore complete as a design milestone.** All hypotheses remain subject to M1 empirical checks and M2 implementation/regression testing. This document does **not** approve an installation or change current ORION infrastructure.

## Stop conditions and handoff

- Do not deploy or invoke ORION, production Authentik, Cloudflare Tunnel or DNS.
- Do not migrate existing accounts or expose the instance publicly.
- Do not start M2 until the unmodified M1 test environment and baseline acceptance are recorded.
- If M1 demonstrates cross-user data access, non-revocable sessions, broken logout or unsafe schema upgrade, stop and prioritize isolated fixes before OIDC runtime work.
- Keep the original PR in draft until the architecture notes are reviewed; the default branch must remain upstream-compatible.

**Next document:** [M1 isolated baseline runbook](./M1-BASELINE-RUNBOOK.md).
