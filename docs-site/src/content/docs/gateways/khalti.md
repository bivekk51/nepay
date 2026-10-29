---
title: Khalti (ePayment v2) Integration
description: Comprehensive guide to integrating Khalti ePayment v2 (KPG-2) using unified-nepal-payments.
---

Khalti provides a modern, RESTful checkout experience known as **Khalti Payment Gateway v2 (KPG-2)**. Unlike form-based redirects, Khalti relies on server-to-server JSON API requests, returning a hosted payment page URL (`payment_url`) and a unique payment session identifier (`pidx`).

---

## How Khalti ePayment v2 Works

```
1. Customer clicks "Pay with Khalti"
   └─ Your Backend sends authenticated POST to /epayment/initiate/
   └─ Header: "Authorization: Key <secretKey>"
   └─ Khalti responds with: { pidx, payment_url, expires_at, expires_in }

2. Your Backend redirects Customer to payment_url
   └─ Customer enters Khalti mobile wallet number & MPIN
   └─ Khalti verifies SMS OTP and debits funds

3. Khalti redirects Customer back to your returnUrl
   └─ Appends query parameters: ?pidx=<pidx>&status=Completed&transaction_id=...

4. Your Backend executes S2S Verification
   └─ Sends POST to /epayment/lookup/ with { pidx }
   └─ Confirms status === "Completed" and total_amount === expectedAmountPaisa
   └─ Fulfills order and marks paid in database
```

---

## Configuration & Credentials

Payment credentials should be stored in environment variables and never exposed to client browsers.

To obtain your sandbox keys:
1. Sign up for a free merchant test account at [Khalti Test Merchant Admin](https://test-admin.khalti.com/#/join/merchant).
2. Log in and navigate to **Keys** in the left sidebar.
3. Copy your test **Secret Key** (`live_secret_key` or `test_secret_key`).

```ts title="src/lib/khalti.ts"
import type { KhaltiConfig } from "unified-nepal-payments";

export const khaltiConfig: KhaltiConfig = {
  secretKey: process.env.KHALTI_SECRET_KEY!,
  publicKey: process.env.KHALTI_PUBLIC_KEY, // Optional: for client widgets
  websiteUrl: process.env.APP_URL ?? "https://yourdomain.com",
  returnUrl: `${process.env.APP_URL ?? "https://yourdomain.com"}/api/payment/callback/khalti`,
  env: "sandbox", // "sandbox" | "production"
};
```

### Configuration Parameters

| Property | Type | Requirement | Description |
|---|---|---|---|
| `secretKey` | <span class="param-type">string</span> | <span class="param-required">Required</span> | Merchant secret key used in `Authorization: Key <secretKey>` header. |
| `publicKey` | <span class="param-type">string</span> | <span class="param-optional">Optional</span> | Public key used if initializing client-side SDKs. |
| `websiteUrl` | <span class="param-type">string</span> | <span class="param-required">Required</span> | Your canonical website homepage URL (must be valid HTTP/HTTPS). |
| `returnUrl` | <span class="param-type">string</span> | <span class="param-required">Required</span> | Endpoint where Khalti redirects the user upon completion or cancellation. |
| `env` | <span class="param-type">"sandbox" \| "production"</span> | <span class="param-required">Required</span> | Switches between `https://dev.khalti.com/api/v2` and `https://khalti.com/api/v2`. |
| `baseUrl` | <span class="param-type">string</span> | <span class="param-optional">Optional</span> | Custom base URL override for proxying or mocked testing environments. |

---

## Step 1: Initiating a Payment

Call `initiatePayment()` or the standalone function `initiateKhalti()`:

```ts title="src/routes/checkout.ts"
import { initiatePayment } from "unified-nepal-payments";
import { khaltiConfig } from "../lib/khalti.js";

const result = await initiatePayment({
  method: "khalti",
  config: khaltiConfig,
  order: {
    orderId: "INV-2024-001",
    amountPaisa: 10000, // NPR 100.00
    purchaseOrderName: "Store Order #001",
    customerInfo: {
      name: "Ram Sharma",
      email: "ram@example.com",
      phone: "9800000000",
    },
    // Optional itemized breakdown (sum must equal amountPaisa)
    amountBreakdown: [
      { label: "Items Total", amount: 9000 },
      { label: "VAT (13%)", amount: 1000 },
    ],
  },
});

// Store result.pidx in your database associated with INV-2024-001
console.log("Payment Index (pidx):", result.pidx);

// Redirect customer to Khalti hosted checkout
res.redirect(result.payment_url);
```

### Request Parameter Specifications

| Parameter | Type | Required | Description |
|---|---|---|---|
| `orderId` | <span class="param-type">string</span> | <span class="param-required">Required</span> | Unique internal identifier for the order (`purchase_order_id`). |
| `amountPaisa` | <span class="param-type">number</span> | <span class="param-required">Required</span> | Total payable amount in integer paisa. **Minimum allowed is `1000` (NPR 10.00)**. |
| `purchaseOrderName` | <span class="param-type">string</span> | <span class="param-required">Required</span> | Human-readable title displayed on the Khalti checkout screen. |
| `customerInfo` | <span class="param-type">object</span> | <span class="param-optional">Optional</span> | Details (`name`, `email`, `phone`) pre-filling the payment form. |
| `amountBreakdown` | <span class="param-type">Array&lt;{label, amount}&gt;</span> | <span class="param-optional">Optional</span> | Itemized billing. The sum of item amounts must strictly equal `amountPaisa`. |

:::note[Pre-Flight Validation]
The SDK performs local validation using Zod before issuing any network requests:
- Throws an immediate validation error if `amountPaisa < 1000`.
- Throws an error if `amountBreakdown` items do not sum up exactly to `amountPaisa`.
:::

### Gateway Response Structure

Upon successful initiation, Khalti responds with:

```json
{
  "pidx": "53uiCQgY7Df2ZD7hmetofZ",
  "payment_url": "https://test-pay.khalti.com/?pidx=53uiCQgY7Df2ZD7hmetofZ",
  "expires_at": "2026-10-29T14:15:22.000000Z",
  "expires_in": 1800
}
```

---

## Step 2: Customer Redirection & Payment

When your backend redirects the customer to `payment_url`:
1. The customer enters their 10-digit Khalti mobile number.
2. They enter their 4-digit MPIN.
3. Khalti sends a 6-digit OTP via SMS.
4. The customer confirms payment.

---

## Step 3: Server-to-Server Verification

When payment completes or is canceled, Khalti redirects back to your `returnUrl`:
`https://yourdomain.com/api/payment/callback/khalti?pidx=53uiCQgY7Df2ZD7hmetofZ&status=Completed&transaction_id=...`

:::caution[Why Return Query Parameters Must NOT Be Trusted]
A customer can easily alter the query string to `?status=Completed` without actually paying.
You **must** execute an independent server-to-server lookup using `verifyPayment()` or `lookupKhalti()` to query Khalti's `/epayment/lookup/` endpoint.
:::

```ts title="src/routes/callback.ts"
import { verifyPayment } from "unified-nepal-payments";
import { khaltiConfig } from "../lib/khalti.js";

export async function handleKhaltiReturn(req, res) {
  const pidx = req.query.pidx as string;

  const result = await verifyPayment({
    method: "khalti",
    config: khaltiConfig,
    pidx,
    expectedOrderId: "INV-2024-001",
    expectedAmountPaisa: 10000,
  });

  if (result.status === "completed") {
    // 1. Transaction confirmed by Khalti lookup endpoint
    // 2. Amount matched expectedAmountPaisa exactly
    // 3. Order ID verified
    await db.orders.update({
      where: { id: result.orderId },
      data: {
        status: "PAID",
        gatewayRef: result.traceId, // Khalti transaction_id
      },
    });

    return res.redirect(`/order/success?id=${result.orderId}`);
  }

  // Handle non-completed statuses: 'pending' | 'failed'
  return res.redirect(`/order/failed?reason=${encodeURIComponent(result.status)}`);
}
```

### Lookup Response Fields

| Field | Type | Description |
|---|---|---|
| `pidx` | <span class="param-type">string</span> | Unique identifier for the payment session. |
| `status` | <span class="param-type">string</span> | Gateway state: `"Completed"`, `"Pending"`, `"Initiated"`, `"Expired"`, `"User canceled"`. |
| `total_amount` | <span class="param-type">number</span> | Total amount paid in integer paisa. |
| `transaction_id` | <span class="param-type">string</span> | Settlement reference assigned once payment completes. |
| `fee` | <span class="param-type">number</span> | Khalti processing fee in paisa. |
| `refunded` | <span class="param-type">boolean</span> | Indicates whether the transaction has been refunded. |

---

## Edge Case: Resilient HTTP 400 Expired Body Handling

When a payment session is abandoned or expires, Khalti returns an **HTTP 400 Bad Request** status containing a JSON body:

```json
{
  "status": "Expired"
}
```

Many standard HTTP client libraries crash by throwing unhandled network exceptions on HTTP 400 responses.
`unified-nepal-payments` intercepts 400 responses, safely decodes the JSON body, and maps it directly to:

```ts
{
  status: "failed",
  message: "Khalti transaction expired",
  raw: { status: "Expired" }
}
```

This prevents your server from crashing and allows you to present a graceful retry flow to the customer.

---

## Sandbox Testing Credentials

To test Khalti integrations in the sandbox environment:

1. **Merchant Portal**: Register your test merchant account at [Khalti Test Merchant Admin](https://test-admin.khalti.com/#/join/merchant) to generate your test Secret Key.
2. **API Base URL**: `https://dev.khalti.com/api/v2`
3. **Customer Test Wallets**: `9800000000` through `9800000005`
4. **Test MPIN**: `1111`
5. **Test OTP**: `987654`
