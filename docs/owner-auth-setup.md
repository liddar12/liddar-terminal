# Owner authentication setup

This patch is based on main `6f4af5112c4a43247428f1ad64cd9ebdb5fa9602` and is published as [draft PR #13](https://github.com/liddar12/liddar-terminal/pull/13). Code commit `e789921b15bac73ce9fc11eb5a24e632e7f37ecd` passed CI and produced a READY Vercel preview; its hosted `/api/session` returned the expected 503 because owner Auth is not configured. The PR has not been merged or deployed to production. It protects terminal data and paid research requests; it does not authorize brokerage orders or make the bot autonomous.

## Configure the shared SelfLearningAI project

The owner selected the existing SelfLearningAI project (`omavgimpnvrpuxqhfxpf`) for NFL and trading. The additive backend migration creates a separate `trading` schema and `trading_private` access-control schema. Its fixed `public.trade_bot_*` RPCs use the caller's authenticated role and RLS; they do not query the existing NFL tables. The prior fresh-project migration must not be applied to this shared database.

1. Use the existing project's Auth configuration. Do not disable signup or change project-wide Auth settings as part of this terminal setup. Provision or select the owner's verified Supabase Auth user through a private account flow. Never place a password in source, environment variables, chat, or a default form value.
2. Set the immutable Auth user UUID as `TERMINAL_OWNER_USER_ID`. Separately provision that UUID as an enabled `owner` in the migration's `trading_private.principals` allowlist. The application cannot grant itself this entry. Other valid Supabase users remain unauthorized; an account designated `worker` is not a terminal owner. Follow the shared-project migration runbook for the reviewed allowlist operation.
3. Configure both browser/server URL settings for the same reviewed Supabase project, using its publishable key. The server verifies every bearer through `/auth/v1/user`, checks the owner UUID, then retains the bearer in a private server context. `/api/session` returns only the owner's ID/email.
4. Leave `TERMINAL_STORAGE_BACKEND` empty until the migration, database permissions and owner allowlist are verified. Set it to exactly `shared-trading-v1` to enable trading storage. Each storage request checks the status RPC's schema version and owner principal. Missing/incompatible setup has no fallback to the NFL store.

| Setting | Where it is used | Exposure |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser sign-in | Public project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser sign-in | Public `sb_publishable_` key, or legacy anon JWT |
| `SUPABASE_URL` | Server Auth verification and fixed trading RPCs | Server configuration |
| `SUPABASE_PUBLISHABLE_KEY` | Server Auth/RPC API key | Public key used on server |
| `TERMINAL_OWNER_USER_ID` | Server owner allowlist | Server configuration |
| `TERMINAL_STORAGE_BACKEND` | Explicit storage enablement | Server configuration; exactly `shared-trading-v1` |
| `ANTHROPIC_API_KEY` | Server research proxy | Secret; only after owner Auth checks |
| `CLAUDE_MODEL` | Optional server-selected model | Server configuration |

The trading store never reads `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`. It forwards the live-verified owner's bearer with the publishable key, so the database's authenticated-role permissions remain in force. An additional project-wide secret key would not provide a trading-only permission boundary.

Vite normally serializes `VITE_` variables into public JavaScript. This project restricts `envPrefix` to the two public Auth setting names and validates exact names before bundling. The build accepts Vercel's exact documented framework metadata names, such as `VITE_VERCEL_ENV`, but excludes their values from the browser bundle. Unknown `VITE_` names, credential-like `VITE_VERCEL_*` names, secret keys in the public-key field, and invalid project URLs still fail the build. See [Vercel's framework-variable list](https://vercel.com/docs/environment-variables/framework-environment-variables) and [Vite's envPrefix setting](https://vite.dev/config/shared-options.html#envprefix).

The app intentionally supports standard `https://<project-ref>.supabase.co` origins only. Custom domains/local Supabase require a separately reviewed allowlist change. Empty configuration builds a locked setup screen; partially configured or unsafe public settings fail the build.

The metadata allowlist also includes `VITE_VERCEL_REGION`, which is explicitly injected by the [official Vercel build-utils implementation](https://github.com/vercel/vercel/blob/main/packages/build-utils/src/get-prefixed-env-vars.ts). If the platform adds another name, the build stays blocked and reports at most eight rejected names, each limited to 80 uppercase letters, digits and underscores; malformed names are replaced with a placeholder. The diagnostic never reads or logs rejected variable values. Review the platform source before adding an exact new name; do not allow a whole prefix.

The exact name `VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG` is also accepted as an observed platform build input, identified by the names-only diagnostic on deployment `dpl_7ref4rpzSQfGoPmyHbBnfaRhTVFA`. Its value was not inspected or classified as public. Like all accepted platform inputs, it remains excluded from the browser bundle; similarly prefixed or suffixed names remain blocked.

5. Use **Node 22** for Vercel and CI. The pinned Supabase JS 2.119.0 requires Node >=22, and the deployment engine is pinned to 22.x.
6. First deploy sign-in settings with trading storage and paid research disabled. Check anonymous private-route requests receive 401 and another valid user receives 403. Verify the owner's session response contains only ID/email and no bearer or refresh token.
7. Apply and verify the reviewed additive shared-project migration before enabling storage. Test the empty/unlisted-principal state, owner reads/imports, worker-only outcome writes, denied NFL access, and receipt/immutability rules in the database. Set the explicit storage backend flag only after the actual owner is allowlisted.
8. Verify the hosted read-only path: owner login, open Scores, observe the honest empty state or existing results, reload, then sign out. A successful session alone does not verify database access; Scores exercises the scoped RPCs. Real hosted imports are append-only, retained records marked as unverified evidence, so do not create a supposedly disposable import for this sign-in check. The terminal has no outcome-writing, permission-changing, model-promotion or broker-order route. Configure the research provider secret separately after Auth verification.

Vercel project boundaries matter: use the intended terminal project only. The handoff protects the original `liddar-terminal` Vercel project and `liddar-terminal.vercel.app`; no part of this local patch changes either project or any domain.

## Request and session behavior

The browser uses the official Supabase password-sign-in client. The client keeps access/refresh tokens in tab-scoped session storage and refreshes sessions while the tab is active. There is no signup, trading key, shared frontend password, or service key in the browser. Sign-out clears this tab's local session and asks Supabase to revoke that session; if the provider is unreachable, a previously issued access token may remain valid until its normal expiry. Close the tab to remove its local session.

The app mounts its private panels only after `/api/session` confirms the owner. Every database route and paid Claude request independently calls Supabase Auth's `/auth/v1/user`, then checks the verified user UUID. The server never trusts a decoded client JWT, client-provided email, or UI state. Missing configuration, expired tokens and Auth outages fail closed. Authorization headers are restricted to relative local API paths, redirects are rejected, and authenticated responses are marked private/no-store. Mutating requests are never automatically retried by the transport.

Protected Vercel previews can require a hosting access cookie in addition to the application's Supabase bearer. The transport uses `credentials: 'same-origin'` so that authorized preview access survives app API calls. It still rejects external destinations and refuses redirects; it does not forward cookies to Supabase or another origin. The preview cookie grants hosting access only, while every private route still requires the verified owner bearer. Omitting cookies can make password sign-in succeed at Supabase but leave the terminal at `Verification unavailable` because the host blocks `/api/session` before the application handler.

`/api/breadth` and `/api/quotes` remain public market-data endpoints. They contain no private journal access or paid model credentials. The app still requires sign-in before displaying its panels. The paid model is selected by the server and request token/size bounds are enforced; aggregate provider spend limits must still be configured separately.

Trading data calls use only fixed `trade_bot_status`, `trade_bot_append_prediction`, `trade_bot_list_predictions` and `trade_bot_list_resolved` RPC names. A request cannot choose a schema, table or RPC. Task names are limited to `scanner`, `trade_decision`, `price_action_trend`, or a lowercase `trading.` identifier; an omitted filter means all authorized trading tasks, never NFL tasks. The status RPC must report `shared-trading-v1` and an owner principal. Unexpected response shapes or non-trading rows fail visibly.

Scores read keyset pages using a fixed database receipt-time cutoff. This is not a transaction-wide MVCC snapshot: a write stamped before the cutoff but committed later can appear in a later RPC, so reproducible evaluation requires completed ingestion. At most 5,000 resolved records are accepted per score request; larger histories fail visibly instead of presenting truncated data as all-time results. Duplicate pages fail too. Receipt cutoff, cursor, row shape and task checks are covered by tests. No read or write is automatically retried, and upstream provider/database bodies are never reflected in responses or logs.

Client-submitted predictions retain client-asserted event/model fields and receive server metadata `meta._terminal = {owner_user_id, provenance: 'unverified_import'}`. This label is not a verified generation receipt and does not itself implement an evaluation exclusion rule. Downstream promotion logic must explicitly validate/exclude imported records. Owner authentication protects access; it does not prove model performance or data provenance.

Password recovery remains through the owner's controlled Supabase administration/account process. This patch does not implement public recovery or invitation links, MFA, multiple owners, a backend worker credential, order approvals, trade execution, risk limits, or a model-promotion API.

## Validation

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

The Node tests cover wrong-owner, missing/expired/malformed token and upstream failure behavior; live-verified storage-context enforcement; no service-key fallback; RPC/schema/task isolation; private session serialization; fixed-receipt-cutoff pagination and bounded score history; public-build secret rejection; local-only bearer transport; record validation; and the existing scanner behavior. A production-build regression uses synthetic Vercel metadata to verify that deployment builds accept the documented names while their values remain absent from the public bundle.

The browser test exercises the real React sign-in UI and real server API handlers against deterministic **mock Supabase Auth/trading-RPC responses**. Its private APIs also require a fixture hosting-access cookie, independently of owner Auth, so a regression to `credentials: 'omit'` fails the browser flow. It covers missing-preview-access denial, anonymous denial after preview access, wrong-owner sign-in, owner login, private scores, reload, sign-out and empty session storage. The fixture import is held only in disposable process memory; it is not a hosted append-only record. The test never contacts a live account, database or paid provider. To use an installed system Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its absolute executable path. Hosted Auth, owner allowlist provisioning and real database integration remain separate deployment checks. The browser fixture fails on any unexpected direct-table request.

Official references: [Supabase password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [Auth user verification](https://supabase.com/docs/reference/javascript/auth-getuser), [API-key security](https://supabase.com/docs/guides/getting-started/api-keys), [Data API security](https://supabase.com/docs/guides/api/securing-your-api).
