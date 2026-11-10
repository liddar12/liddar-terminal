# Owner authentication setup

This patch is prepared against main `6f4af5112c4a43247428f1ad64cd9ebdb5fa9602`. It has not been pushed, merged or deployed. It protects terminal data and paid research requests; it does not authorize brokerage orders or make the bot autonomous.

## Configure the intended project

1. Select the reviewed Supabase project. The connected account currently cannot access the prior learning project; do not use the unrelated AYSO project as a substitute.
2. Enable Supabase email/password Auth and disable public signups. Create the owner's verified Auth account using Supabase's administration flow. The owner chooses/receives the password through a private account setup process. Do not put it in a source file, environment variable, chat, or frontend form default.
3. Copy the owner's immutable Auth **user UUID** to the server setting `TERMINAL_OWNER_USER_ID`. An email address is not the authorization identifier. Other accounts, even with valid Supabase sessions, receive HTTP 403.
4. Configure the following variables on the intended terminal project. Build-time and server URLs must point to the same Supabase project. Keep preview/staging data isolated from production.

| Setting | Where it is used | Exposure |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Browser sign-in | Public project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser sign-in | Public `sb_publishable_` key, or legacy anon JWT |
| `SUPABASE_URL` | Server Auth verification and store | Server configuration |
| `SUPABASE_PUBLISHABLE_KEY` | Server `/auth/v1/user` verification | Public key used on server |
| `TERMINAL_OWNER_USER_ID` | Server owner allowlist | Server configuration |
| `SUPABASE_SECRET_KEY` | Server prediction store | Secret; only after schema/auth checks |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy fallback for store | Secret; omit when using the modern key |
| `ANTHROPIC_API_KEY` | Server research proxy | Secret; only after auth checks |
| `CLAUDE_MODEL` | Optional server-selected model | Server configuration |

Vite serializes `VITE_` variables into public JavaScript. The build rejects undocumented `VITE_` variables, secret keys in the public-key field, and invalid project URLs. It intentionally supports standard `https://<project-ref>.supabase.co` origins only. Custom domains/local Supabase require a separately reviewed allowlist change. Empty configuration builds a locked setup screen; partially configured or unsafe public settings fail the build.

5. Use **Node 22** for the Vercel project and CI. The pinned Supabase JS 2.119.0 package requires Node >=22; this repository pins the deployment engine to 22.x.
6. First deploy the sign-in settings without database/research secrets. Check anonymous requests to `/api/session`, `/api/predictions`, `/api/scores`, `/api/log-prediction` and `/api/claude` receive 401; a valid other-account token receives 403. An owner can verify their session but storage/research requests return 503 while secrets are absent.
7. Apply the reviewed schema to the correct isolated store, verify browser-role denial, then add the server database and research secrets and redeploy. Test an owner login, append/read a disposable test prediction, check scores, and sign out. Do not use a real forecast or broker order as a connectivity test.

Vercel project boundaries matter: use the intended terminal project only. The handoff protects the original `liddar-terminal` Vercel project and `liddar-terminal.vercel.app`; no part of this local patch changes either project or any domain.

## Request and session behavior

The browser uses the official Supabase password-sign-in client. The client keeps access/refresh tokens in tab-scoped session storage and refreshes sessions while the tab is active. There is no signup, trading key, shared frontend password, or service key in the browser. Sign-out clears this tab's local session and asks Supabase to revoke that session; if the provider is unreachable, a previously issued access token may remain valid until its normal expiry. Close the tab to remove its local session.

The app mounts its private panels only after `/api/session` confirms the owner. Every database route and paid Claude request independently calls Supabase Auth's `/auth/v1/user`, then checks the verified user UUID. The server never trusts a decoded client JWT, client-provided email, or UI state. Missing configuration, expired tokens and Auth outages fail closed. Authorization headers are restricted to relative local API paths, redirects are rejected, and authenticated responses are marked private/no-store. Mutating requests are never automatically retried by the transport.

`/api/breadth` and `/api/quotes` remain public market-data endpoints. They contain no private journal access or paid model credentials. The app still requires sign-in before displaying its panels. The paid model is selected by the server and request token/size bounds are enforced; aggregate provider spend limits must still be configured separately.

The database secret is used only after owner authorization. Opaque `sb_secret_` keys use the `apikey` header without pretending to be a bearer JWT. Legacy service-role JWTs remain supported. Upstream provider/database errors are not reflected into the browser or logs.

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

The Node tests cover wrong-owner, missing/expired/malformed token and upstream failure behavior; API authorization before store/provider work; key/header handling; public-build secret rejection; local-only bearer transport; record validation; and the existing scanner behavior.

The browser test exercises the real React sign-in UI and real server API handlers against deterministic **mock Supabase Auth/database responses**: anonymous denial, wrong-owner sign-in, owner login, private scores, reload, sign-out and empty session storage. It never contacts a live account, database or paid provider. To use an installed system Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to its absolute executable path. Hosted Auth and real key provisioning remain separate deployment checks.

Official references: [Supabase password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [Auth user verification](https://supabase.com/docs/reference/javascript/auth-getuser), [API-key security](https://supabase.com/docs/guides/getting-started/api-keys), [Data API security](https://supabase.com/docs/guides/api/securing-your-api).
