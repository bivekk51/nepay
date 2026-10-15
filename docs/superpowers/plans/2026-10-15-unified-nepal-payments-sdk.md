# Unified Nepal Payments SDK (eSewa + Khalti) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript SDK with one Zod-discriminated `method: 'esewa' | 'khalti'` initiate + verify surface and normalized `PaymentResult`, working in eSewa UAT and Khalti sandbox.

**Architecture:** Zero-dep core (`node:crypto` + `fetch`) with per-provider modules (`src/esewa.ts`, `src/khalti.ts`) over shared `types` + `money` helpers, unified through `src/index.ts`. All network calls injectable/mocked in tests; no secrets in logs or frontend.

**Tech Stack:** TypeScript, Zod, Vitest, tsup (ESM+CJS), Node 18+

**Spec:** `docs/superpowers/specs/2026-10-15-unified-nepal-payments-design.md`

## Global Constraints

- Secrets never leave server. No signing in browser. No secrets in logs/errors.
- Amounts: integer paisa in SDK public API. Convert to rupees-string (eSewa) at boundary; Khalti stays paisa-int. Normalize comma-formatted eSewa callback amounts before compare.
- Constant-time signature compare for eSewa. Amount/code/id match required before `completed`.
- `transaction_uuid / purchase_order_id` minted fresh per attempt (uuid, `ORDER-<uuid>`). Never reuse after expiry/failure.
- Khalti `return_url` must support GET. eSewa callback must accept GET+POST.
- Configurable `baseUrl` per provider (Khalti alias support).
- ESM+CJS, Node 18+, `node:crypto` + `fetch` only in core. `zod` as dep.
- NPR only. v1 out: FonePay, API layer, MCP, refunds, Intent/Token/legacy flows.

## Review Focus

- Comma-formatted eSewa `total_amount` like `"1,000.0"` must verify on raw strings then compare numerically after comma-strip; naive `===` must not fail a valid payment.
- eSewa callback `data` arriving via GET query vs POST body must both be accepted; accepting only one drops live payments.
- eSewa `failure_url` receiving `PENDING` must not be treated as terminally failed; it must trigger status-check, not fulfil.
- Khalti `amount_breakdown` sum not equal to `amount` must throw before network; sending it gets a 400 `Amount Breakdown mismatch`.
- Khalti `Expired` / `User canceled` returning HTTP 400 with JSON `status` body must be parsed as a status, not thrown as an opaque network error; branching on `res.ok` alone loses the reason.

---

### Task 1: Scaffold + money + shared types

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `src/types.ts`
- Create: `src/money.ts`
- Create: `src/index.ts` (placeholder re-exports, filled in Task 5)
- Test: `tests/money.test.ts`
- Test: `tests/types.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces:
  - `nprToPaisa(npr: number) -> number` in `src/money.ts`
  - `paisaToRupeesString(paisa: number) -> string` in `src/money.ts` (e.g. `12345 -> "123.45"`, no commas, max 2 decimals)
  - `parseAmountToPaisa(raw: string | number) -> number` in `src/money.ts` (strips commas, `"1,000.0" -> 100000`)
  - `PaymentStatus = 'completed' | 'pending' | 'failed' | 'expired' | 'canceled'` in `src/types.ts`
  - `PaymentResult = { status: PaymentStatus, amountPaisa: number, orderId: string, traceId: string | null, raw: unknown }` in `src/types.ts`

- [ ] **Step 1: Write the failing test for paisa helpers**

```ts
// tests/money.test.ts
import { describe, it, expect } from "vitest";
import { nprToPaisa, paisaToRupeesString, parseAmountToPaisa } from "../src/money.js";
describe("money", () => {
  it("converts NPR to paisa without float drift", () => { expect(nprToPaisa(123.45)).toBe(12345); });
  it("formats paisa to rupees string", () => { expect(paisaToRupeesString(12345)).toBe("123.45"); expect(paisaToRupeesString(10000)).toBe("100"); });
  it("parses comma-formatted callback amounts", () => { expect(parseAmountToPaisa("1,000.0")).toBe(100000); expect(parseAmountToPaisa("100")).toBe(10000); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/money.test.ts`
Expected: FAIL with "Cannot find module" / "function not defined"

- [ ] **Step 3: Implement `nprToPaisa(paisa: number)`, `paisaToRupeesString`, `parseAmountToPaisa` in `src/money.ts`**

Use `Math.round(n*100)` inward; outward fixed-2 trimmed; parse strips commas then `Math.round(Number*100)`. Also create `src/types.ts` with `PaymentStatus` + `PaymentResult` and minimal `package.json` (`type: module`, deps `zod`, devDeps `typescript vitest tsup`), `tsconfig.json` (strict, NodeNext ESM, `outDir: dist`), `tsup.config.ts` (entry `src/index.ts`, formats `esm,cjs`, dts on).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/money.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json tsup.config.ts src/types.ts src/money.ts src/index.ts tests/money.test.ts tests/types.test.ts
git commit -m "feat: scaffold sdk with paisa money helpers and shared types"
```

### Task 2: eSewa sign + verify + status-check

**Files:**
- Create: `src/esewa.ts`
- Test: `tests/esewa.test.ts`

**Interfaces:**
- Consumes: `parseAmountToPaisa` from `src/money.ts`, `PaymentResult` from `src/types.ts`
- Produces:
  - `signEpayV2(p: { total_amount: string, transaction_uuid: string, product_code: string }, secret: string) -> string` in `src/esewa.ts`
  - `verifyEpayCallback(dataB64: string, secret: string) -> Promise<{ valid: boolean, data: Record<string,string> | null }>` in `src/esewa.ts`
  - `checkEpayStatus(opts: { env: 'sandbox'|'production', product_code: string, total_amount: string, transaction_uuid: string, baseUrl?: string }) -> Promise<{ status: string, ref_id: string | null, raw: unknown }>` in `src/esewa.ts`
  - `EsewaConfigSchema` (zod: `productCode, secretKey, successUrl: url, failureUrl: url, env`) in `src/esewa.ts`
  - `ESEWA_BASES = { sandbox: { form: 'https://rc-epay.esewa.com.np/api/epay/main/v2/form', status: 'https://rc.esewa.com.np/api/epay/transaction/status/' }, production: { form: 'https://epay.esewa.com.np/api/epay/main/v2/form', status: 'https://esewa.com.np/api/epay/transaction/status/' } }`

- [ ] **Step 1: Write the failing test with the official spec vector**

```ts
// tests/esewa.test.ts (excerpt)
import { describe, it, expect, vi } from "vitest";
import { signEpayV2, verifyEpayCallback } from "../src/esewa.js";
describe("esewa sign", () => {
  it("matches official HMAC vector", () => {
    expect(signEpayV2({ total_amount: "100", transaction_uuid: "11-201-13", product_code: "EPAYTEST" }, "8gBm/:&EnhH.1/q")).toBe("4Ov7pCI1zIOdwtV2BRMUNjz1upIlT/COTxfLhWvVurE=");
  });
  it("accepts comma-formatted amounts after verify", async () => {
    // build a signed payload with total_amount "1,000.0", verify valid === true, parseAmountToPaisa(data.total_amount) === 100000
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/esewa.test.ts`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Implement `signEpayV2`, `verifyEpayCallback`, `checkEpayStatus` in `src/esewa.ts`**

Message exactly `total_amount=...,transaction_uuid=...,product_code=...` (that order, no spaces), `createHmac('sha256', secret).update(msg,'utf8').digest('base64')`. Verify: base64-decode `data`, rebuild message from payload's own `signed_field_names` in its order on raw string values, `timingSafeEqual` compare. Status: `GET {statusBase}?product_code=...&total_amount=...&transaction_uuid=...` with `fetch`, return `{status, ref_id, raw}`; treat `{"code":0,"error_message":"Service is currently unavailable"}` as retryable (throw `EsewaRetryableError`).

- [ ] **Step 4: Run tests including Review Focus comma case**

Run: `npx vitest run tests/esewa.test.ts`
Expected: PASS. Review Focus line 1 pinned here by the comma-amount test.

- [ ] **Step 5: Commit**

```bash
git add src/esewa.ts tests/esewa.test.ts
git commit -m "feat: add esewa v2 sign verify and status check"
```

### Task 3: eSewa initiate fields + callback normalize

**Files:**
- Modify: `src/esewa.ts`
- Test: `tests/esewa.test.ts` (append) or `tests/esewa-initiate.test.ts`

**Interfaces:**
- Consumes: `signEpayV2`, `verifyEpayCallback`, `checkEpayStatus`, `EsewaConfigSchema`, `ESEWA_BASES` from Task 2; `paisaToRupeesString`, `parseAmountToPaisa`
- Produces:
  - `buildEsewaFields(opts: { config: EsewaConfig, orderId: string, amountPaisa: number, taxPaisa?: number, servicePaisa?: number, deliveryPaisa?: number }) -> { url: string, fields: Record<string,string> }` in `src/esewa.ts`
  - `verifyEsewaPayment(opts: { config: EsewaConfig, data: string, expectedOrderId: string, expectedAmountPaisa: number }) -> Promise<PaymentResult>` in `src/esewa.ts` (decodes + sig + code/uuid/amount match + live `checkEpayStatus` requiring `COMPLETE` + `ref_id`; `PENDING` from failure_url stays `pending`, never `failed`)

- [ ] **Step 1: Write the failing test for field building and GET+POST data**

```ts
it("builds v2 fields with total=sum and signed_field_names order", () => {
  const { url, fields } = buildEsewaFields({ config: sandboxCfg, orderId: "11-201-13", amountPaisa: 10000, taxPaisa: 0, servicePaisa: 0, deliveryPaisa: 0 });
  expect(url).toBe("https://rc-epay.esewa.com.np/api/epay/main/v2/form");
  expect(fields.signed_field_names).toBe("total_amount,transaction_uuid,product_code");
  expect(fields.total_amount).toBe("100");
});
it("accepts data from GET query or POST body identically", async () => {
  // same `data` string passed as {query:{data}} vs {body:{data}} both verify
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/esewa.test.ts`
Expected: FAIL with "buildEsewaFields not defined"

- [ ] **Step 3: Implement `buildEsewaFields` + `verifyEsewaPayment` in `src/esewa.ts`**

Validate `amount+tax+service+delivery === total` in paisa before formatting; `transaction_uuid = orderId` (validate `[A-Za-z0-9-]`); `total_amount = paisaToRupeesString(totalPaisa)`; sign with raw strings. `verifyEsewaPayment` accepts `data` from either transport (caller passes the string; document `req.query.data ?? req.body.data`), then sig-check, then `product_code`/`transaction_uuid`/amount equality via `parseAmountToPaisa`, then `checkEpayStatus`; map `COMPLETE->completed` (only with `ref_id`), `PENDING->pending`, `AMBIGUOUS->pending`, `NOT_FOUND/CANCELED/FULL_REFUND/PARTIAL_REFUND->failed` with `traceId = ref_id ?? transaction_code`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/esewa.test.ts`
Expected: PASS. Review Focus lines 2 (GET+POST) and 3 (PENDING not terminal) pinned here.

- [ ] **Step 5: Commit**

```bash
git add src/esewa.ts tests/esewa.test.ts
git commit -m "feat: add esewa initiate fields and verified payment normalize"
```

### Task 4: Khalti initiate + lookup + verify

**Files:**
- Create: `src/khalti.ts`
- Test: `tests/khalti.test.ts`

**Interfaces:**
- Consumes: `PaymentResult` from `src/types.ts` (no dependency on `src/esewa.ts`)
- Produces:
  - `KhaltiConfigSchema` (zod: `secretKey, websiteUrl: url, returnUrl: url, env, baseUrl?: url`) in `src/khalti.ts`
  - `KHALTI_BASES = { sandbox: 'https://dev.khalti.com/api/v2', production: 'https://khalti.com/api/v2' }` in `src/khalti.ts`
  - `initiateKhalti(opts: { config: KhaltiConfig, purchaseOrderId: string, purchaseOrderName: string, amountPaisa: number, customerInfo?: {name?,email?,phone?}, amountBreakdown?: {label,amount}[], extra?: Record<`merchant_${string}`,string> }) -> Promise<{ pidx: string, payment_url: string, expires_at: string, expires_in: number }>` in `src/khalti.ts`
  - `lookupKhalti(opts: { config: KhaltiConfig, pidx: string }) -> Promise<{ pidx, total_amount, status, transaction_id: string|null, fee, refunded, raw: unknown }>` in `src/khalti.ts`
  - `verifyKhaltiPayment(opts: { config: KhaltiConfig, pidx: string, expectedAmountPaisa: number, expectedOrderId?: string }) -> Promise<PaymentResult>` in `src/khalti.ts`

- [ ] **Step 1: Write the failing tests (mocked fetch)**

```ts
// tests/khalti.test.ts (excerpt, fetch mocked per-test)
import { describe, it, expect, vi, afterEach } from "vitest";
describe("khalti", () => {
  it("rejects amount < 1000 paisa before network", async () => { await expect(initiateKhalti({... amountPaisa: 500 })).rejects.toThrow(/integer >= 1000/); });
  it("rejects breakdown sum mismatch before network", async () => { await expect(initiateKhalti({... amountPaisa: 10000, amountBreakdown: [{label:"a", amount: 9000}]} )).rejects.toThrow(/Breakdown mismatch/); });
  it("maps Completed+amount-match to completed, Pending to pending, Expired-400 to expired", async () => { /* mocked lookup bodies */ });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/khalti.test.ts`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Implement `initiateKhalti`, `lookupKhalti`, `verifyKhaltiPayment` in `src/khalti.ts`**

Server-only `fetch` with `Authorization: Key <secret>` + `application/json`, honoring `config.baseUrl ?? KHALTI_BASES[config.env]` for every request. Validate integer paisa `>=1000` and breakdown sum pre-flight. `lookupKhalti` parses JSON body even on HTTP 400 (Expired/User-canceled) and returns `status`. `verifyKhaltiPayment` fulfils only on `status==='Completed'` + `total_amount===expectedAmountPaisa` (+ order binding if provided); maps `Pending/Initiated->pending`, `Expired->expired`, `User canceled->canceled`, `Refunded/Partially Refunded->failed`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/khalti.test.ts`
Expected: PASS. Review Focus lines 4 (breakdown) and 5 (400-body) pinned here.

- [ ] **Step 5: Commit**

```bash
git add src/khalti.ts tests/khalti.test.ts
git commit -m "feat: add khalti initiate lookup and verify"
```

### Task 5: Unified entry + hardening + examples + publish prep

**Files:**
- Modify: `src/index.ts`
- Create: `README.md`
- Create: `examples/express.ts`
- Create: `examples/nextjs-server-action.ts`
- Test: `tests/index.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-4 (exact names above)
- Produces:
  - `pay` unified surface in `src/index.ts`: `initiatePayment(input: { method: 'esewa', config, order } | { method: 'khalti', config, order })` and `verifyPayment(input)` returning `PaymentResult`; zod-discriminated on `method`
  - Public exports: all Task 1-4 functions + schemas + bases
  - `README.md` with install, eSewa UAT creds reference (`EPAYTEST`), Khalti sandbox reference, server-only warning, GET+POST callback snippet, `Completed/COMPLETE`-only fulfil rule

- [ ] **Step 1: Write the failing test for the discriminated union**

```ts
// tests/index.test.ts
import { describe, it, expect } from "vitest";
describe("unified", () => {
  it("rejects unknown method", () => { expect(() => UnifiedInput.parse({ method: "fonepay-qr" })).toThrow(); });
  it("routes esewa vs khalti to their builders (mocked)", async () => { /* mocked fetch, assert esewa returns {url, fields}, khalti returns {pidx, payment_url} */ });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/index.test.ts`
Expected: FAIL with "not defined"

- [ ] **Step 3: Implement unified `initiatePayment` / `verifyPayment` in `src/index.ts`**

Zod union on `method`; each branch delegates to Task 3 / Task 4 functions with no shared signer. Add `README.md` + two minimal examples (Express callback accepting `req.query.data ?? req.body.data` for eSewa and `?pidx=` for Khalti; Next.js server actions keeping `secretKey` server-only). Set `package.json` `exports`, `files: ["dist"]`, `publishConfig`, `scripts: { build: "tsup", test: "vitest run", typecheck: "tsc --noEmit" }`.

- [ ] **Step 4: Run full suite + build + typecheck**

Run: `npx vitest run`
Expected: PASS all. Then run: `npm run build && npm run typecheck`
Expected: PASS, `dist/` ESM+CJS+dts emitted.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/index.test.ts README.md examples/express.ts examples/nextjs-server-action.ts package.json
git commit -m "feat: add unified pay surface examples and publish prep"
```
