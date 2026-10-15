# unified-nepal-payments

Unified server-side SDK for Nepal payments: **eSewa (ePay v2)** + **Khalti (ePayment v2)** behind one
zod-discriminated `initiatePayment` / `verifyPayment` surface. All amounts are **integer paisa**.

## Install

```bash
npm install unified-nepal-payments
```

Requires Node >= 18 (global `fetch`).

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
import { initiatePayment, verifyPayment } from "unified-nepal-payments";

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
