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

Unified server-side TypeScript SDK for Nepal payment gateways: **eSewa (ePay v2)** + **Khalti (ePayment v2)** + **Fonepay (Dynamic QR & Hosted Web)** behind a single, typesafe, zod-discriminated `initiatePayment` / `verifyPayment` surface.

All monetary amounts are strictly **integer paisa** (`1 NPR = 100 paisa`) to eliminate floating-point rounding bugs.

📖 **[Full Documentation & Guides](https://nepay.nepalbivek.com.np/)** (or run `npm run docs:dev` locally)

---

## Features

- 🔒 **Zero Browser Leaks**: Designed exclusively for backend environments (Express, Next.js Server Actions, Remix, Fastify). Secrets are never logged or exposed.
- ⚡ **Single Mental Model**: One `initiatePayment()` and one `verifyPayment()` function discriminated by `method: 'esewa' | 'khalti' | 'fonepay'`.
- 💰 **Paisa-Safe Arithmetic**: All amounts are integer paisa with built-in conversion utilities (`nprToPaisa`, `paisaToRupeesString`, `parseAmountToPaisa`, `fonepayPaisaToAmount`).
- 🛡️ **Mandatory S2S Verification**: Eliminates trust in client redirects. Always verifies status server-to-server before marking orders `completed`.
- 📱 **Dual Fonepay Architecture**: Supports both hosted web redirect checkouts and direct dynamic EMVCo QR code downloads for custom in-app modals.
- 🧪 **Zero-Config Developer Mock**: Instant offline/sandbox simulation for Fonepay (`FONEPAYTEST`) without waiting for bank merchant onboarding.
- 🩺 **Resilient Error Handling**: Gracefully handles eSewa comma-formatted amounts (`"1,000.0"`), GET vs POST callback variances, Khalti HTTP 400 Expired bodies, and temporary gateway maintenance outages (`EsewaRetryableError`).
- 📦 **Dual ESM & CommonJS**: Shipped with complete TypeScript `.d.ts` declaration files.

---

## Install

```bash
npm install @bivekkk/nepay
```

Requires Node >= 18 (global `fetch` and `node:crypto`).

## ⚠️ Server-only warning

**Never expose `secretKey` to the browser.** `EsewaConfig.secretKey`, `KhaltiConfig.secretKey`,
and `FonepayConfig.secretKey` must live in server-only code (Express handlers, Next.js server actions /
route handlers) and be loaded from environment variables. Secrets are never logged by this SDK.

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

## Fonepay (Dynamic QR & Hosted Web)

- Fonepay credentials require formal acquiring bank onboarding in Nepal. To develop and test immediately, `nepay` includes a zero-config mock sandbox simulator (`merchantCode: "FONEPAYTEST"`, `isSandbox: true`).
- **Hosted Web Flow**: Redirect customer to Fonepay's payment page:
  ```ts
  const hosted = await initiatePayment({
    method: "fonepay",
    flow: "hosted",
    config: fonepayConfig,
    order: { orderId: "INV-001", amountPaisa: 10000, remarks1: "Order #001" },
  });
  // redirect to hosted.payment_url
  ```
- **Direct Dynamic QR Flow**: Embed a real-time EMVCo QR directly in your modal (PayBridgeNP-style):
  ```ts
  const qr = await initiatePayment({
    method: "fonepay",
    flow: "qr",
    config: fonepayConfig,
    order: { orderId: "INV-001", amountPaisa: 10000, remarks1: "Order #001" },
  });
  // render qr.qr_message as QR code SVG/canvas
  ```
- **Verification**: Verifies cryptographic HMAC-SHA512 checksums and queries server-to-server (`verificationMerchant` for hosted or `thirdPartyDynamicQrGetStatus` for QR).

## Unified usage

```ts
import { initiatePayment, verifyPayment } from "@bivekkk/nepay";

// eSewa form fields — initiatePayment returns a union, so narrow it:
const esewa = await initiatePayment({ method: "esewa", config: esewaConfig, order: { orderId, amountPaisa } });
if ("fields" in esewa) {
  const { url, fields } = esewa;
}

// Khalti payment page — narrow the khalti branch:
const khalti = await initiatePayment({ method: "khalti", config: khaltiConfig, order: { purchaseOrderId, purchaseOrderName, amountPaisa } });
if ("pidx" in khalti) {
  const { pidx, payment_url } = khalti;
}

// Fonepay hosted redirect — narrow fonepay hosted branch:
const fonepay = await initiatePayment({ method: "fonepay", flow: "hosted", config: fonepayConfig, order: { orderId, amountPaisa } });
if ("payment_url" in fonepay) {
  const { payment_url } = fonepay;
}

// Fonepay dynamic QR — narrow fonepay QR branch:
const fonepayQr = await initiatePayment({ method: "fonepay", flow: "qr", config: fonepayConfig, order: { orderId, amountPaisa } });
if ("qr_message" in fonepayQr) {
  const { qr_message } = fonepayQr;
}
```

## Verify contract: throw vs `failed` (callers MUST try/catch `verifyPayment`)

The providers report verification problems differently — this is intentional,
documented here so callers handle all gateways cleanly:

- **eSewa** — `verifyEsewaPayment` / `verifyPayment({ method: "esewa", ... })` **THROWS** on
  undecodable `data`, an invalid callback signature, and on `product_code` /
  `transaction_uuid` / `total_amount` mismatch. Transport-level status-check outages
  throw `EsewaRetryableError` (retry later). A returned `PaymentResult` therefore
  only ever carries `completed` / `pending` / `failed` for live gateway states.
- **Khalti** — `verifyKhaltiPayment` / `verifyPayment({ method: "khalti", ... })` **RETURNS
  `{ status: "failed" }`** on amount or order-id mismatch (refunds also map to
  `failed`); it **throws only** on transport errors or unparseable lookup bodies.
- **Fonepay** — `verifyFonepayPayment` / `verifyPayment({ method: "fonepay", ... })` **THROWS**
  on HMAC-SHA512 checksum tampering or amount mismatch. Queries S2S `verificationMerchant`
  (for hosted) or `thirdPartyDynamicQrGetStatus` (for QR) and returns normalized `PaymentResult`.

Consequence: always wrap `verifyPayment` in try/catch, regardless of method:

```ts
try {
  const result = await verifyPayment({ method: "esewa", config: esewaConfig, data, expectedOrderId: orderId, expectedAmountPaisa: totalPaisa });
  if (result.status === "completed") {
    // fulfil exactly once (idempotent on orderId)
  }
} catch (err) {
  // Signature mismatch, order/amount mismatch, or transport failure
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

# Fonepay Sandbox / Mock
FONEPAY_MERCHANT_CODE="FONEPAYTEST"
FONEPAY_SECRET_KEY="fonepay_secret_key"
FONEPAY_RETURN_URL="https://example.com/payments/fonepay/callback"
FONEPAY_IS_SANDBOX="true"
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

#### Fonepay (Mock Sandbox)
- **Merchant Code**: `FONEPAYTEST`
- **Secret Key**: `fonepay_secret_key`
- **Sandbox Mode**: `isSandbox: true`
- Built-in zero-config simulator generating valid EMVCo dynamic QR strings (`000201010212...524...5802NP`) and valid signed hosted URLs without requiring acquiring bank contracts.

## Running Tests

- **Unit tests (offline, mocked)**:
  ```bash
  npm test
  ```
- **Live gateway integration tests (hits real eSewa UAT, Khalti sandbox, and Fonepay APIs)**:
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

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines, branch etiquette, and pull request procedures.

## License

MIT © [Bivek](https://nepalbivek.com.np/)



