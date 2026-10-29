<p align="center">
  <img src="https://nepay.nepalbivek.com.np/nepay-banner.svg" alt="nepay - unified Nepal payment SDK" width="100%">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@bivekkk/nepay"><img src="https://img.shields.io/npm/v/@bivekkk/nepay.svg" alt="npm version"></a>
  <a href="https://github.com/bivekk51/nepay"><img src="https://img.shields.io/badge/GitHub-nepay-181717.svg?logo=github" alt="GitHub Repository"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="Node.js Version"></a>
  <a href="tsconfig.json"><img src="https://img.shields.io/badge/TypeScript-5.x-blue.svg" alt="TypeScript"></a>
</p>

# nepay

Unified server-side TypeScript SDK for Nepal payment gateways: **eSewa (ePay v2)** + **Khalti (ePayment v2)** behind a single, typesafe, zod-discriminated `initiatePayment` / `verifyPayment` surface.

All monetary amounts are strictly **integer paisa** (`1 NPR = 100 paisa`) to eliminate floating-point rounding bugs.

📖 **[Full Documentation & Guides](https://nepay.nepalbivek.com.np/)** (or run `npm run docs:dev` locally)

---

## Features

- 🔒 **Zero Browser Leaks**: Designed exclusively for backend environments (Express, Next.js Server Actions, Remix, Fastify). Secrets are never logged or exposed.
- ⚡ **Single Mental Model**: One `initiatePayment()` and one `verifyPayment()` function discriminated by `method: 'esewa' | 'khalti'`.
- 💰 **Paisa-Safe Arithmetic**: All amounts are integer paisa with built-in conversion utilities (`nprToPaisa`, `paisaToRupeesString`, `parseAmountToPaisa`).
- 🛡️ **Mandatory S2S Verification**: Eliminates trust in client redirects. Always verifies status server-to-server before marking orders `completed`.
- 🩺 **Resilient Error Handling**: Gracefully handles eSewa comma-formatted amounts (`"1,000.0"`), GET vs POST callback variances, Khalti HTTP 400 Expired bodies, and temporary gateway maintenance outages (`EsewaRetryableError`).
- 📦 **Dual ESM & CommonJS**: Shipped with complete TypeScript `.d.ts` declaration files.

---

## Install

```bash
npm install @bivekkk/nepay
```

Requires Node >= 18 (global `fetch` and `node:crypto`).

## ⚠️ Server-only warning

**Never expose `secretKey` to the browser.** `EsewaConfig.secretKey` and `KhaltiConfig.secretKey`
must live in server-only code (Express handlers, Next.js server actions / route handlers) and be
loaded from environment variables. Secrets are never logged by this SDK.

## eSewa (ePay v2)

- Test with the eSewa UAT merchant product code **`EPAYTEST`** against the sandbox bases in
  `ESEWA_BASES.sandbox` (UAT secret from your eSewa merchant dashboard / eSewa support).
- Flow: `buildEsewaFields` (or `initiatePayment({ method: "esewa", ... })`) → auto-POST form to
  `url` → customer pays → eSewa redirects to `successUrl`/`failureUrl` with base64 `data`.

### eSewa callback: accept GET **and** POST

eSewa sends `data` via GET query in some environments and POST body in others — always read both:

```ts
const data = req.query.data ?? req.body.data;
const result = await verifyPayment({
  method: "esewa",
  config: esewaConfig,
  data,
  expectedOrderId: orderId,
  expectedAmountPaisa: totalPaisa,
});
```

### Fulfil rule: `COMPLETE`-only

Only fulfil an eSewa order when `verifyPayment` returns `status: "completed"` — i.e. the callback
signature verified **and** the server-to-server status check returned `COMPLETE` with a `ref_id`.
`PENDING` / `AMBIGUOUS` → `pending` (retry the status check later); `NOT_FOUND` / `CANCELED` /
refunds → `failed`. Never fulfil on callback signature alone.

## Khalti (ePayment v2)

- Test against the Khalti **sandbox** (`KHALTI_BASES.sandbox`, `https://dev.khalti.com`) with a
  sandbox secret key.
- Flow: `initiateKhalti` (or `initiatePayment({ method: "khalti", ... })`) → redirect customer to
  `payment_url` → customer pays → Khalti redirects to `returnUrl` with `?pidx=` → `lookupKhalti` /
  `verifyKhaltiPayment` server-side.

```ts
// returnUrl handler: pidx arrives as a query param
const pidx = String(req.query.pidx);
const result = await verifyPayment({ method: "khalti", config: khaltiConfig, pidx, expectedAmountPaisa });
```

### Fulfil rule: `Completed`-only

Only fulfil a Khalti order when `verifyPayment` returns `status: "completed"` — i.e. lookup status
`Completed` **and** `total_amount` equals the expected paisa amount (plus order-id binding when
`expectedOrderId` is given). `Pending` / `Initiated` → `pending`; `Expired` → `expired`;
`User canceled` → `canceled`; refunds / amount mismatch → `failed`.

## Unified usage

```ts
import { initiatePayment, verifyPayment } from "@bivekkk/nepay";

// eSewa form fields — initiatePayment returns a union, so narrow it:
const esewa = await initiatePayment({ method: "esewa", config: esewaConfig, order: { orderId, amountPaisa } });
if (!("url" in esewa)) throw new Error("unexpected initiate result");
const { url, fields } = esewa;

// Khalti payment page — narrow the other branch:
const khalti = await initiatePayment({ method: "khalti", config: khaltiConfig, order: { purchaseOrderId, purchaseOrderName, amountPaisa } });
if (!("pidx" in khalti)) throw new Error("unexpected initiate result");
const { pidx, payment_url } = khalti;
```

## Verify contract: throw vs `failed` (callers MUST try/catch `verifyPayment`)

The two providers report verification problems differently — this is intentional,
documented here so callers handle both:

- **eSewa** — `verifyEsewaPayment` / `verifyPayment({ method: "esewa", ... })` **THROWS** on
  undecodable `data`, an invalid callback signature, and on `product_code` /
  `transaction_uuid` / `total_amount` mismatch. Transport-level status-check outages
  throw `EsewaRetryableError` (retry later). A returned `PaymentResult` therefore
  only ever carries `completed` / `pending` / `failed` for live gateway states.
- **Khalti** — `verifyKhaltiPayment` / `verifyPayment({ method: "khalti", ... })` **RETURNS
  `{ status: "failed" }`** on amount or order-id mismatch (refunds also map to
  `failed`); it **throws only** on transport errors or unparseable lookup bodies.

Consequence: always wrap `verifyPayment` in try/catch, regardless of method:

```ts
try {
  const result = await verifyPayment({ method: "esewa", config: esewaConfig, data, expectedOrderId: orderId, expectedAmountPaisa: totalPaisa });
  if (result.status === "completed") {
    // fulfil exactly once (idempotent on orderId)
  }
} catch (err) {
  // eSewa mismatch / invalid signature, or transport failure for either provider
}
```

See `examples/express.ts` and `examples/nextjs-server-action.ts` (illustrations only — no live calls).

## Sandbox Credentials & Environment Setup

Copy `.env.example` to `.env` to configure credentials:

```bash
cp .env.example .env
```

### Environment Variables (.env)

```env
# eSewa Sandbox
ESEWA_PRODUCT_CODE="EPAYTEST"
ESEWA_SECRET_KEY="8gBm/:&EnhH.1/q"
ESEWA_SUCCESS_URL="https://example.com/payments/esewa/callback"
ESEWA_FAILURE_URL="https://example.com/payments/esewa/callback"
ESEWA_ENV="sandbox"

# Khalti Sandbox (obtain from https://test-admin.khalti.com/#/join/merchant)
KHALTI_SECRET_KEY="your-khalti-sandbox-secret-key"
KHALTI_PUBLIC_KEY="your-khalti-sandbox-public-key"
KHALTI_WEBSITE_URL="https://example.com"
KHALTI_RETURN_URL="https://example.com/payments/khalti/return"
KHALTI_ENV="sandbox"
```

### Sandbox Test Credentials

#### eSewa (UAT)
- **Product Code**: `EPAYTEST`
- **Secret Key**: `8gBm/:&EnhH.1/q`
- **Customer Test Wallet**: `9806800001` - `9806800005`
- **Password**: `Nepal@123`
- **MPIN**: `1122`
- **OTP**: `123456`

#### Khalti (Sandbox)
- **Merchant Sandbox Keys**: Create a free merchant test account at [Khalti Test Merchant Admin](https://test-admin.khalti.com/#/join/merchant) and navigate to **Keys** to copy your test Secret Key (`live_secret_key` or `test_secret_key`).
- **Customer Test Wallet**: `9800000000` - `9800000005`
- **MPIN**: `1111`
- **OTP**: `987654`

## Running Tests

- **Unit tests (offline, mocked)**:
  ```bash
  npm test
  ```
- **Live gateway integration tests (hits real eSewa UAT and Khalti sandbox APIs)**:
  ```bash
  npm run test:live
  ```
- **Build & typecheck**:
  ```bash
  npm run build
  npm run typecheck
  ```
- **Documentation site (Astro Starlight)**:
  ```bash
  npm run docs:dev    # Start local docs server at http://localhost:4321
  npm run docs:build  # Build production static documentation
  ```


