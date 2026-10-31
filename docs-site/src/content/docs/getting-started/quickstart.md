---
title: Quick Start — eSewa, Khalti & Fonepay in 5 Minutes
description: Step-by-step quickstart to integrate eSewa ePay v2, Khalti ePayment v2, and Fonepay (Dynamic QR & Hosted Web) in Node.js and TypeScript using @bivekkk/nepay.
---

Accepting online payments across Nepal requires handling three distinct gateway architectures:
- **eSewa (ePay v2)**: Requires an HTML Form POST containing an HMAC-SHA256 digital signature, redirecting the customer's browser, and resolving a base64-encoded callback.
- **Khalti (ePayment v2 / KPG-2)**: Requires a server-side JSON REST request to `/epayment/initiate/`, redirecting the customer to a hosted `payment_url`, and querying `/epayment/lookup/` with a payment index (`pidx`).
- **Fonepay (Dynamic QR & Hosted Web)**: Requires HMAC-SHA512 cryptographic digests. Supports two modes: Direct Dynamic EMVCo QR download for custom in-app checkout modals, or hosted web redirect checkout with server-to-server status verification.

`nepay` unifies all three behind a single, typesafe, server-side interface while enforcing strict integer paisa math and mandatory server-to-server verification.

---

## 1. Environment & Credentials Configuration

Payment credentials must remain strictly on your server. Never bundle them into frontend code. Store them in `.env` and load them on startup.

```bash title=".env"
# eSewa Sandbox (UAT)
ESEWA_PRODUCT_CODE="EPAYTEST"
ESEWA_SECRET_KEY="8gBm/:&EnhH.1/q"
ESEWA_ENV="sandbox"

# Khalti Sandbox
# Create a free test account to get your keys: https://test-admin.khalti.com/#/join/merchant
KHALTI_SECRET_KEY="your-khalti-sandbox-secret-key"
KHALTI_ENV="sandbox"

# Fonepay Sandbox / Local Mock
# Use merchantCode "FONEPAYTEST" for instant mock sandbox testing without bank onboarding
FONEPAY_MERCHANT_CODE="FONEPAYTEST"
FONEPAY_SECRET_KEY="fonepay_secret_key"
FONEPAY_RETURN_URL="https://yourdomain.com/api/payment/callback/fonepay"
FONEPAY_IS_SANDBOX="true"
```

Initialize provider configurations in a server module:

```ts title="src/lib/payment.ts"
import type { EsewaConfig, KhaltiConfig, FonepayConfig } from "@bivekkk/nepay";

export const esewaConfig: EsewaConfig = {
  productCode: process.env.ESEWA_PRODUCT_CODE ?? "EPAYTEST",
  secretKey: process.env.ESEWA_SECRET_KEY ?? "8gBm/:&EnhH.1/q",
  successUrl: "https://yourdomain.com/api/payment/callback/esewa",
  failureUrl: "https://yourdomain.com/api/payment/callback/esewa",
  env: "sandbox", // "sandbox" | "production"
};

export const khaltiConfig: KhaltiConfig = {
  secretKey: process.env.KHALTI_SECRET_KEY!,
  websiteUrl: "https://yourdomain.com",
  returnUrl: "https://yourdomain.com/api/payment/callback/khalti",
  env: "sandbox", // "sandbox" | "production"
};

export const fonepayConfig: FonepayConfig = {
  merchantCode: process.env.FONEPAY_MERCHANT_CODE ?? "FONEPAYTEST",
  secretKey: process.env.FONEPAY_SECRET_KEY ?? "fonepay_secret_key",
  returnUrl: process.env.FONEPAY_RETURN_URL ?? "https://yourdomain.com/api/payment/callback/fonepay",
  isSandbox: process.env.FONEPAY_IS_SANDBOX === "true",
};
```

### Configuration Parameters

| Field | Type | Required | Description |
|---|---|---|---|
| `productCode` | <span class="param-type">string</span> | <span class="param-required">Required (eSewa)</span> | Merchant code issued by eSewa (`"EPAYTEST"` for sandbox). |
| `merchantCode` | <span class="param-type">string</span> | <span class="param-required">Required (Fonepay)</span> | Merchant code issued by Fonepay (`"FONEPAYTEST"` for mock sandbox). |
| `secretKey` | <span class="param-type">string</span> | <span class="param-required">Required</span> | Cryptographic key used to sign digests or authenticate API requests. |
| `successUrl` / `returnUrl` | <span class="param-type">string</span> | <span class="param-required">Required</span> | The URL on your server where the gateway redirects the customer after checkout. |
| `env` / `isSandbox` | <span class="param-type">string \| boolean</span> | <span class="param-required">Required</span> | Toggles between gateway test endpoints and live production servers. |

:::note[The Paisa Rule]
All amounts in the SDK are integers representing **paisa** (`1 NPR = 100 Paisa`).
`NPR 100.00` is strictly passed as `10000`. This prevents floating-point drift (`0.1 + 0.2 !== 0.3`).
:::

---

## 2. Initiating a Payment

Call `initiatePayment()` with `method: "esewa"`, `method: "khalti"`, or `method: "fonepay"`. TypeScript automatically narrows the accepted options and return type.

### Example: eSewa Initiation

```ts title="src/routes/checkout.ts"
import { initiatePayment } from "@bivekkk/nepay";
import { esewaConfig } from "../lib/payment.js";

const checkout = await initiatePayment({
  method: "esewa",
  config: esewaConfig,
  order: {
    orderId: "INV-2024-001",
    amountPaisa: 10000, // NPR 100.00
  },
});

// checkout returns:
// {
//   url: "https://rc-epay.esewa.com.np/api/epay/main/v2/form",
//   fields: {
//     amount: "100",
//     tax_amount: "0",
//     total_amount: "100",
//     transaction_uuid: "INV-2024-001",
//     product_code: "EPAYTEST",
//     signed_field_names: "total_amount,transaction_uuid,product_code",
//     signature: "dGVzdFNpZ25hdHVyZQ==",
//     success_url: "...",
//     failure_url: "..."
//   }
// }
```

#### Step-by-Step Breakdown:
1. `method: "esewa"` informs the SDK to execute the eSewa v2 protocol.
2. The SDK converts `amountPaisa: 10000` to the formatted rupee string `"100"` expected by eSewa's form inputs.
3. It generates an HMAC-SHA256 signature using `config.secretKey` over the message `total_amount,transaction_uuid,product_code`.
4. It returns `url` and `fields`. Your server renders an auto-submitting HTML form or returns this JSON to the frontend to POST to eSewa.

---

### Example: Khalti Initiation

```ts title="src/routes/checkout.ts"
import { initiatePayment } from "@bivekkk/nepay";
import { khaltiConfig } from "../lib/payment.js";

const checkout = await initiatePayment({
  method: "khalti",
  config: khaltiConfig,
  order: {
    orderId: "INV-2024-001",
    amountPaisa: 10000, // NPR 100.00 (min: 1000 paisa)
    purchaseOrderName: "Store Order #001",
    customerInfo: {
      name: "Ram Sharma",
      email: "ram@example.com",
      phone: "9800000000",
    },
    // Optional: Enable or restrict payment channels (Wallet, Mobile Banking, ConnectIPS)
    modes: ["KHALTI", "MOBILE_BANKING", "CONNECT_IPS"],
  },
});

// checkout returns:
// {
//   pidx: "53uiCQgY7Df2ZD7hmetofZ",
//   payment_url: "https://test-pay.khalti.com/?pidx=53uiCQgY7Df2ZD7hmetofZ",
//   expires_at: "2026-10-29T14:15:22.000000Z",
//   expires_in: 1800
// }
```

#### Step-by-Step Breakdown:
1. `method: "khalti"` executes an authenticated REST call to Khalti's `/epayment/initiate/` endpoint.
2. `order.amountPaisa` is passed directly as integer paisa (Khalti's native format).
3. The response contains `pidx` (payment index) and `payment_url`.
4. Your server immediately redirects the customer's browser to `payment_url`.

---

### Example: Fonepay Initiation

Fonepay supports two operational modes depending on your user experience requirements:

#### Option A: Hosted Web Redirect (`flow: "hosted"`)
Redirects the customer to Fonepay's hosted checkout screen where they can log in via Mobile Banking or scan Fonepay's hosted QR:

```ts title="src/routes/checkout.ts"
import { initiatePayment } from "@bivekkk/nepay";
import { fonepayConfig } from "../lib/payment.js";

const checkout = await initiatePayment({
  method: "fonepay",
  config: fonepayConfig,
  flow: "hosted",
  order: {
    orderId: "INV-2024-001",
    amountPaisa: 10000, // NPR 100.00
    remarks1: "Order #001",
    remarks2: "Widget Purchase",
  },
});

// checkout returns:
// {
//   flow: "hosted",
//   payment_url: "https://dev-clientapi.fonepay.com/api/merchantRequest?PID=...&MD=P&PRN=...&DV=...",
//   prn: "INV-2024-001"
// }
// Redirect customer to checkout.payment_url
```

#### Option B: Direct Dynamic QR (`flow: "qr"`)
Generates an EMVCo dynamic QR string directly for embedding inside your custom checkout UI modal (e.g. PayBridge-style or native mobile app modal):

```ts title="src/routes/checkout-qr.ts"
import { initiatePayment } from "@bivekkk/nepay";
import { fonepayConfig } from "../lib/payment.js";

const checkout = await initiatePayment({
  method: "fonepay",
  config: fonepayConfig,
  flow: "qr",
  order: {
    orderId: "INV-2024-001",
    amountPaisa: 10000, // NPR 100.00
    remarks1: "Order #001",
    remarks2: "Widget Purchase",
  },
});

// checkout returns:
// {
//   flow: "qr",
//   qr_message: "000201010212...0406100.00...",
//   prn: "INV-2024-001"
// }
// Render checkout.qr_message as a QR code SVG/canvas in your frontend!
```

---

## 3. Mandatory Server-to-Server Verification

When the customer completes the transaction, they are redirected back to your callback route.

:::caution[Security Imperative]
**Never trust browser query strings or redirect parameters**. An attacker can tamper with query strings (e.g. `?status=Completed`) to forge a successful transaction without paying.
`verifyPayment()` validates HMAC signatures and directly invokes the gateway's server-to-server endpoint to guarantee authenticity before returning `status: "completed"`.
:::

### Verifying eSewa Callback

When eSewa redirects back, it attaches a base64-encoded `data` parameter in the query or body:

```ts title="src/routes/callback.ts"
import { verifyPayment } from "@bivekkk/nepay";
import { esewaConfig } from "../lib/payment.js";

export async function handleEsewaCallback(req, res) {
  // In some environments eSewa delivers GET queries, in others POST form body
  const base64Data = (req.query.data || req.body.data) as string;

  const result = await verifyPayment({
    method: "esewa",
    config: esewaConfig,
    data: base64Data,
    expectedOrderId: "INV-2024-001",
    expectedAmountPaisa: 10000,
  });

  if (result.status === "completed") {
    // 1. Transaction is cryptographically verified
    // 2. Gateway S2S status check confirmed "COMPLETE"
    // 3. Paid amount matched expectedAmountPaisa exactly
    await db.orders.update({
      where: { id: result.orderId },
      data: { status: "PAID", gatewayRef: result.traceId },
    });
    return res.redirect(`/order-confirmation?id=${result.orderId}`);
  }

  // Handle failed or cancelled payment
  return res.redirect(`/payment-failed?reason=${encodeURIComponent(result.status)}`);
}

---

### Verifying Khalti Callback

When Khalti redirects back to your `returnUrl`, it appends `?pidx=...&status=...`:

```ts title="src/routes/callback.ts"
import { verifyPayment } from "@bivekkk/nepay";
import { khaltiConfig } from "../lib/payment.js";

export async function handleKhaltiCallback(req, res) {
  const pidx = req.query.pidx as string;

  const result = await verifyPayment({
    method: "khalti",
    config: khaltiConfig,
    pidx: pidx,
    expectedOrderId: "INV-2024-001",
    expectedAmountPaisa: 10000,
  });

  if (result.status === "completed") {
    // 1. Queried Khalti S2S /epayment/lookup/
    // 2. Confirmed status === "Completed"
    // 3. Amount verified in paisa
    await db.orders.update({
      where: { id: result.orderId },
      data: { status: "PAID", gatewayRef: result.traceId },
    });
    return res.redirect(`/order-confirmation?id=${result.orderId}`);
  }

  return res.redirect(`/payment-failed?reason=${encodeURIComponent(result.status)}`);
}

---

### Verifying Fonepay (Hosted Callback or Dynamic QR)

Fonepay supports verification for both the hosted web callback and periodic dynamic QR polling:

```ts title="src/routes/callback.ts"
import { verifyPayment } from "@bivekkk/nepay";
import { fonepayConfig } from "../lib/payment.js";

// Option A: Hosted Web Callback
export async function handleFonepayHostedCallback(req, res) {
  // Fonepay redirects to your returnUrl with PRN, BID, UID, and DV query params
  const { PRN, BID, UID, DV } = req.query;

  const result = await verifyPayment({
    method: "fonepay",
    flow: "hosted",
    config: fonepayConfig,
    orderId: PRN as string,
    expectedAmountPaisa: 10000,
    callbackData: {
      prn: PRN as string,
      bid: BID as string,
      uid: UID as string,
      dv: DV as string,
    },
  });

  if (result.status === "completed") {
    await db.orders.update({
      where: { id: result.orderId },
      data: { status: "PAID", gatewayRef: result.traceId },
    });
    return res.redirect(`/order-confirmation?id=${result.orderId}`);
  }

  return res.redirect(`/payment-failed?reason=${encodeURIComponent(result.status)}`);
}

// Option B: Dynamic QR Polling
export async function checkFonepayQrStatus(orderId: string) {
  const result = await verifyPayment({
    method: "fonepay",
    flow: "qr",
    config: fonepayConfig,
    orderId,
    expectedAmountPaisa: 10000,
  });

  return result; // status: "completed" | "pending" | "failed"
}
```

---

## 4. Understanding the `PaymentResult` Object

Every verification returns a consistent `PaymentResult` object:

```ts
interface PaymentResult {
  status: "completed" | "pending" | "failed" | "expired" | "canceled";
  amountPaisa: number;
  orderId: string;
  traceId: string | null;
  raw: unknown;
}
```

| Field | Type | Description |
|---|---|---|
| `status` | <span class="param-type">PaymentStatus</span> | `"completed"` if payment is 100% verified server-to-server; `"pending"` if initiated but incomplete; `"expired"` if customer exceeded time; `"canceled"` if aborted; `"failed"` if tampered or amount mismatch. |
| `orderId` | <span class="param-type">string</span> | The identifier of your order (`transaction_uuid` or `purchase_order_id`). |
| `amountPaisa` | <span class="param-type">number</span> | Exact integer paisa verified by the gateway. |
| `traceId` | <span class="param-type">string \| null</span> | Gateway settlement reference (`ref_id` in eSewa, `transaction_id` in Khalti, `UID` / `bankTxnId` in Fonepay). |
| `raw` | <span class="param-type">unknown</span> | The raw decoded response received from the gateway for debugging or logging. |
