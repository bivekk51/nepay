# Unified Nepal Payments — Design (SDK v1: eSewa + Khalti)

Date: 2026-10-15
Status: draft v2 — v1 scoped to SDK-only eSewa+Khalti per owner 2026-10-15. FonePay/API/MCP deferred to phase 2 (FonePay needs real merchant account, no test creds).
Owner decision log at bottom. Builder calls marked as `BUILDER CALL`.

## 1. Intent and why

You integrate eSewa and Khalti today by reading 2 different docs, implementing 2 different verify dances, and maintaining a pile of payment-only files that break independently. FonePay is out of v1 because it requires a real merchant account with no usable test sandbox.

This v1 hides that behind one mental model:

1. **TypeScript SDK/package (v1)** — `pay({ method, ...methodData })` with Zod validation. One call to initiate, one call to verify, normalized result. eSewa creds and Khalti secret + sales info look the same from the app side.

Phase 2 (deferred): **Your API** (`POST /pay/:method` owning idempotency/verification) and **MCP** for AI use. Do not build them in v1, but do not block them.

Who it's for: TypeScript devs building for Nepal first (you + other TS shops).

Success for v1: a dev can `npm i your-sdk`, initiate eSewa + Khalti in one file each under ~20 lines, verify server-side without trusting redirects, and retry safely without double-charging. Verified in eSewa UAT + Khalti sandbox.

## 2. Goals, non-goals, anti-goals

Goals (v1 SDK-only):
- G1: One Zod-discriminated `method: 'esewa' | 'khalti'` initiate + verify API with normalized `PaymentResult`. SDK must work end-to-end in UAT/sandbox.
- G2: Server-only signing. Zero browser-secret footguns.
- G3: Mandatory server-to-server verification before `completed`. Never trust redirect alone.
- G4: Idempotency guidance at SDK level: fresh `transaction_uuid / purchase_order_id` per attempt, replay-safe verify (same callback twice = same result, no double-fulfil if caller keys by order id).
- G5: Paisa-safe money handling (integer paisa in public API, convert at provider boundary).

Non-goals (v1 out, phase 2):
- FonePay Dynamic QR (needs real merchant account, no test sandbox — deferred until you have live `merchantCode/secretKey/username/password`).
- API layer (`POST /pay/:method`, persistence, jobs) and MCP tools.
- Refunds / settlements dashboard, partial refunds, recurring.
- Legacy flows: eSewa v1 (`scd/pid/transrec`), Khalti legacy widget (`/payment/initiate|confirm|verify` token flow), FonePay redirect flow (`clientapi.../merchantRequest`). Document them, don't implement in v1.
- eSewa Intent / Token flows (mobile deeplink + merchant-inquiry flows) — design so they can be added as new methods later.
- Mobile / React Native SDKs, hosted checkout UI.
- Multi-currency (NPR only).

Anti-goals (failure even if it technically works):
- SDK that accepts secrets in frontend code or logs secrets.
- `verify()` that marks paid on callback query params without lookup/status-check.
- Shared `sign()` that would mix eSewa HMAC-SHA256-base64 with future FonePay HMAC-SHA512-hex. Keep separate signers per method.
- Reusing `transaction_uuid / purchase_order_id` across retries.

## 3. What research found (verified Oct 2026)

Three parallel research passes ran. `websearch` had no backend in that env, so official docs were fetched directly + npm/GitHub READMEs. All facts below are from live fetches; gaps marked.

### 3.1 eSewa ePay v2 (best documented — build first)

Official: `https://developer.esewa.com.np/` -> `/api/pages/Epay`, `/api/pages/Test-credentials`, `/api/pages/Intent`, `/api/pages/Token`.

- Flow: server builds fields + HMAC -> browser `POST https://rc-epay.esewa.com.np/api/epay/main/v2/form` (prod `https://epay.esewa.com.np/...`) -> user pays -> redirect to `success_url?data=<base64 JSON>` or `failure_url` (FAILURE **or PENDING**) -> server decodes, verifies signature, asserts `status==COMPLETE` + code/uuid/amount match -> **must** `GET` status-check before fulfilment.
- Status check: `GET https://rc.esewa.com.np/api/epay/transaction/status/?product_code=EPAYTEST&total_amount=100&transaction_uuid=...` (prod `https://esewa.com.np/...`). Query params, not body.
- Signing: `HMAC-SHA256(secret) over "total_amount={...},transaction_uuid={...},product_code={...}"` (exact order, no spaces) -> standard base64. Test `product_code=EPAYTEST`, secret `8gBm/:&EnhH.1/q`. Response verify rebuilds from its own `signed_field_names` in its order with constant-time compare.
- Required: `amount, tax_amount, product_service_charge, product_delivery_charge, total_amount (= sum), transaction_uuid (unique per attempt, [A-Za-z0-9-] only), product_code, success_url, failure_url, signed_field_names="total_amount,transaction_uuid,product_code", signature`. Optional `properties[name]` max 3.
- Response statuses: `PENDING | COMPLETE | FULL_REFUND | PARTIAL_REFUND | AMBIGUOUS | NOT_FOUND | CANCELED`. Intent statuses differ (`BOOKED | SUCCESS | ...`).
- Units: rupees with max 2 decimals per community SDKs (`@lacspace/esewa`); keep integer paisa internally, format at boundary. Official docs don't state paisa explicitly.
- Test users: `9806800001-9806800005` (new page) or `9711111111/2/3` (old page), pwd `Nepal@123`, MPIN `1122`, OTP `123456`. Session ~15 min expiry.
- Pitfalls: `total_amount` may arrive as `"1,000.0"` — verify signature on raw strings, compare numerically after comma-strip; accept both `req.query.data` and `req.body.data`; never reuse uuid; `failure_url` PENDING is not terminal; secrets server-side only.
- Reference SDKs to study: `esewa-sdk` (zero-dep, most complete), `@lacspace/esewa` (best signing edge cases), `@payments-sdk/esewa`, `@paybridge-np/sdk` (multi-gateway unified shape).

### 3.2 Khalti ePayment / KPG-2 (build second)

Official: `https://docs.khalti.com/khalti-epayment/` (initiate/lookup), `/getting-started/`, `/gotchas/`, `/api/refund/`. Source: `https://github.com/khalti/docs.khalti.com`.

- Flow: backend `POST /epayment/initiate/` -> `{pidx, payment_url, expires_at, expires_in}` -> 302 user to `https://test-pay.khalti.com/?pidx=...` (prod `pay.khalti.com`) -> Khalti redirects to merchant `return_url?pidx=...&status=...&transaction_id=...&amount=...` -> backend **must** `POST /epayment/lookup/ {pidx}` and fulfil only on `status=="Completed"` + amount/order match. **No webhook, no HMAC on callback.** Callback values untrusted except `pidx`.
- Bases: sandbox `https://dev.khalti.com/api/v2/`, prod `https://khalti.com/api/v2/`. `UNCERTAIN` alias `https://a.khalti.com/api/v2/` seen in one guide — support `baseUrl` override. `BUILDER CALL`: default to official bases, allow override.
- Auth: `Authorization: Key <live_secret_key>` (field still called `live_secret_key` even in sandbox from `test-admin.khalti.com`). Never in frontend.
- Amounts: **integer paisa**, min `1000` (Rs 10). `amount_breakdown[].amount` sum must equal `amount` or 400. `purchase_order_id` must be unique per txn (dedupe anchor). `merchant_*` keys echoed back.
- Lookup: `{pidx, total_amount (paisa), status, transaction_id (null unless Completed/Refunded), fee, refunded}`. `Completed` (200) = only success. `Pending/Initiated/Refunded` = 200 hold/reconcile. `Expired/User canceled` = 400 -> fresh initiate + new order id. Branch on body `status`, not just HTTP.
- Sandbox: signup `test-admin.khalti.com/#/join/merchant`, OTP `987654`, test IDs `9800000000-9800000005`, MPIN `1111`, OTP `987654`. Wallet-only in sandbox; eBanking/cards only after approval. Prod starts capped NPR 200/txn until KYC via `merchant@khalti.com`.
- No `Idempotency-Key` header. Idempotency = unique `purchase_order_id` + store `pidx<->order` before redirect; retry-after-expiry = new id + new pidx.
- Pitfalls: calling initiate/lookup from browser = CORS by design; secret in `NEXT_PUBLIC_*` is anti-pattern seen in a guide; refund needs `lookup.transaction_id` not `pidx`.
- Reference SDKs: `khalti-node-sdk` (fullest: initiate/verify/refund/getBanks + error taxonomy), `khalti-epayment` (minimal typesafe shape to clone).

### 3.3 FonePay Dynamic QR (build third — gated + hardest)

Status: **no public official dev portal as of Oct 2026.** Docs GATED (bank/FonePay issues PDF spec v1.1 July 2024 + `login.fonepay.com` portal). Primary source is leaked spec mirror `DexA1948/fonepay-dynamic-qr-demo/API_Details.md` + Aug-2026 PayBridgeNP blog + `fonepay-kit` TS SDK. Do not confuse with FonePay redirect flow (`clientapi.fonepay.com/api/merchantRequest`) — different signing/transport.

- Flow: server `POST thirdPartyDynamicQrDownload (signed)` -> `{qrMessage (EMVCo string, not PNG), thirdpartyQrWebSocketUrl, prn}` -> render QR, open WS for hint -> customer scans with any FonePay-network app -> WS pushes `QRVerified` then `paymentSuccess true/false + traceId` -> server `POST thirdPartyDynamicQrGetStatus (signed, prn)` -> `{paymentStatus: success|failed, fonepayTraceId}` = source of truth. **No browser return URL, no server webhook.** Pattern = WS hint + poll truth.
- Endpoints: UAT `https://uat-new-merchant-api.fonepay.com/api/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrDownload` + `.../thirdPartyDynamicQrGetStatus`. Live `https://merchantapi.fonepay.com/api/...`. WS URL taken verbatim from QR response (`wss://dev-ws...` vs `wss://ws...`).
- Auth: `merchantCode (1-15) + secretKey (HMAC key) + username/password (1-25 each, sent cleartext in JSON body -> HTTPS + server-only)`. Issued at Dynamic-QR onboarding (business + bank account + "Request for Dynamic QR" email/call). Test set `fonepay123 / fonepay / bijayk / password` is `UNCERTAIN` in 2026; UAT reported flaky/dead; one Aug-2026 source says "sandbox FonePay moves real money" (capped) — budget low-value live test. Confirm env in writing with bank.
- Signing: **HMAC-SHA512 hex**. QR create message: `AMOUNT,PRN,MERCHANT-CODE,REMARKS1,REMARKS2` (raw values, comma-joined, no URL-encoding). Status: `PRN,MERCHANT-CODE`. Node `createHmac('sha512',key).update(msg).digest('hex')` (lowercase matches QR examples; redirect flow wants UPPERCASE — keep separate).
- Params: `amount` as string (`"50"`, `"100.50"`), `remarks1` + `remarks2` both mandatory (send `"N/A"` if unused), `prn` unique per attempt ≤25, `dataValidation` = HMAC. WS `transactionStatus` is double-JSON-encoded — `JSON.parse` twice.
- Expiry/pending enum/rate limits/PRN charset beyond ANS are GATED/UNCERTAIN — implement own expiry (poll cap 5-15 min, refresh = new PRN) and confirm with FonePay.
- Reference: `fonepay-kit` (`RoshanShrestha14/fonepayNPM`) — only TS SDK doing QR+HMAC+WS+`pollUntilFinal()`; audit before depending. `DexA1948/fonepay-dynamic-qr-demo` = tester harness. `prashantphuyal/fonepay-dynamic-qr-integration` = React+Supabase Edge pattern.

### 3.4 Cross-provider divergence map (why unified layer earns its keep)

| Concern | eSewa v2 | Khalti ePayment | FonePay Dynamic QR |
|---|---|---|---|
| Transport | browser form POST + redirect back | server JSON POST + redirect + redirect back | server JSON POST, no redirect, QR + WS + poll |
| Auth | product_code + HMAC secret | `Authorization: Key secret` | merchantCode + secretKey + username/password in body |
| Sign algo | HMAC-SHA256 base64, 3 fields | none (bearer lookup) | HMAC-SHA512 hex, 5 fields / 2 fields |
| Amount unit | rupees string (convert from paisa) | integer paisa | string decimal |
| Id key | `transaction_uuid` | `purchase_order_id` | `prn` |
| Provider ref | `transaction_code` / `ref_id` | `pidx` -> `transaction_id (tidx)` | `prn` -> `fonepayTraceId` |
| Verify | decode `data` + sig + `GET` status | `POST` lookup, `Completed` only | WS hint + `POST` GetStatus, `success` only |
| Expiry | ~15 min session | pidx 30 min sandbox / 60 min prod | undocumented — own cap |
| Webhook | none (redirect only) | none (redirect only) | none (WS hint only) |
| Testability | UAT works with published creds | sandbox works, wallet-only | UAT flaky/gated, plan live micro-test |

## 4. Proposed shape (what you already chose + what builder decides)

You chose: TypeScript, Zod discriminated on `method`, SDK-only v1 with `esewa + khalti`. API/MCP/FonePay deferred. Those are fixed.

`BUILDER CALL`: zero-dep core (`node:crypto` + `fetch`), ESM+CJS, `baseUrl` overrides per provider, integer paisa in public API with boundary conversion.

SDK sketch (illustrative, not final API):
```ts
import { z } from "zod";
const EsewaConfig = z.object({ productCode: z.string(), secretKey: z.string(), successUrl: z.string().url(), failureUrl: z.string().url(), env: z.enum(["sandbox","production"]) });
const KhaltiConfig = z.object({ secretKey: z.string(), websiteUrl: z.string().url(), returnUrl: z.string().url(), env: z.enum(["sandbox","production"]) });
// initiate(method, order: { id, amountPaisa, name, customer? }) -> { providerRef, nextAction: {type:'redirect',url}, expiresAt }
// verify(method, callback) -> normalized { status: 'completed'|'pending'|'failed'|'expired'|'canceled', amountPaisa, orderId, traceId, raw }
```
Phase 2 notes (do not build in v1): FonePay QR adds `FonepayConfig` + `nextAction {type:'qr', qrMessage, wsUrl}`; API adds `POST /pay/:method` + attempt store; MCP wraps SDK as tools without echoing secrets.

## 5. Development order (v1 SDK-only, recommended)

Do in this order. Each step is demoable alone. Stop/ship after any step.

1. **SDK core + eSewa** — Zod discriminated types, paisa helpers, `signEpayV2/verifyEpayCallback/checkEpayStatus`, unit tests with official example vector (`total_amount=100,transaction_uuid=11-201-13,product_code=EPAYTEST -> 4Ov7pCI1...`), UAT redirect round-trip. Proves signing/verify/normalization pattern with the only provider that has stable public sandbox.
2. **SDK Khalti** — `initiateEpayment/lookupPayment/verifyCallback` (paisa-only, breakdown sum check, `Completed`-only fulfil, 400-body branching). Sandbox wallet test. Proves second auth shape (bearer, no signing) and forces `PaymentResult` normalization to hold.
3. **Hardening + publish** — error taxonomy, README with Express + Next.js server-action snippets, CI unit tests (no live keys), npm publish.

Phase 2 (deferred, in order when unblocked):
4. **SDK FonePay QR** — needs real merchant `merchantCode/secretKey/username/password`. `createQr/getStatus` + WS helper + `pollUntilFinal`.
5. **API + persistence + idempotency** — thin over SDK.
6. **MCP** — expose SDK (+API when it exists) as tools.

Why this order: eSewa validates crypto + callback + status-check discipline; Khalti validates lookup-only + paisa + no-webhook design; SDK must stabilize before API/MCP wrap it; FonePay would block v1 on merchant onboarding so it moves to phase 2.

## 6. Constraints (v1)

- Secrets never leave server. No signing in browser. No secrets in logs/errors.
- Amounts: integer paisa in SDK public API. Convert to rupees-string (eSewa) at boundary; Khalti stays paisa-int. Normalize comma-formatted eSewa callback amounts before compare.
- Constant-time signature compare for eSewa. Amount/code/id match required before `completed`.
- `transaction_uuid / purchase_order_id` minted fresh per attempt (uuid, `ORDER-<uuid>`). Never reuse after expiry/failure.
- Khalti `return_url` must support GET. eSewa callback must accept GET+POST.
- Configurable `baseUrl` per provider (Khalti alias support).
- ESM+CJS, Node 18+, `node:crypto` + `fetch` only in core. `zod` as dep. `BUILDER CALL`: exact Node/zod versions at plan time.

## 7. What's left to the builder (do not ask unless it changes the plan)

- Exact SDK function names, file layout, error taxonomy.
- Poll/retry guidance for `Pending` (SDK returns status, caller retries lookup).
- Example apps (default: minimal Express + Next.js server-action snippet).

## 8. Owner decisions (log)

1. [DECIDED 2026-10-15] v1 = SDK-only, `esewa + khalti`. FonePay deferred — requires real merchant account, no test sandbox.
2. [DECIDED 2026-10-15] API + MCP deferred to phase 2.
3. [OPEN] Money input: approve integer paisa as single public unit with boundary conversion?
4. [OPEN] Scope lock confirm: v1 = ePay v2 + Khalti ePayment only, deferring refunds/Intent/Token/redirect flows — approve?

## 9. URLs researched (for plan phase)

eSewa: `developer.esewa.com.np/`, `/api/pages/Epay`, `/api/pages/Test-credentials`, `/api/pages/Intent`, `/api/pages/Token`, `merchant.esewa.com.np`, npm `esewa-sdk`, `esewa-pay`, `@lacspace/esewa`, `@payments-sdk/esewa`, `@paybridge-np/sdk`.
Khalti: `docs.khalti.com/`, `/khalti-epayment/`, `/getting-started/`, `/gotchas/`, `/api/refund/`, `github.com/khalti/docs.khalti.com`, `khalti-node-sdk`, `khalti-epayment`, Next.js/Django guides listed in research.
FonePay: `fonepay.com/business`, `/business/app`, `/blogs/fonepay-dynamic-qr-code`, `login.fonepay.com`, `DexA1948/fonepay-dynamic-qr-demo/API_Details.md`, `paybridgenp.com/blog/fonepay-api-integration-nepal`, `RoshanShrestha14/fonepayNPM`, `prashantphuyal/fonepay-dynamic-qr-integration`, `Nepal.Payments.Gateways/docs/FONEPAY-IMPLEMENTATION.md`.

---
*Next: after you approve this doc + answer §8 items 3-4, invoke `writing-plans` to produce the SDK build plan. Then implement in §5 v1 order.*
