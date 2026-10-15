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

// eSewa form fields
const { url, fields } = await initiatePayment({ method: "esewa", config: esewaConfig, order: { orderId, amountPaisa } });

// Khalti payment page
const { pidx, payment_url } = await initiatePayment({ method: "khalti", config: khaltiConfig, order: { purchaseOrderId, purchaseOrderName, amountPaisa } });
```

See `examples/express.ts` and `examples/nextjs-server-action.ts` (illustrations only — no live calls).
