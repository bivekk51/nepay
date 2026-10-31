---
title: Fonepay Gateway Integration (Web Checkout & Dynamic QR)
description: Complete guide to integrating Fonepay in Node.js and TypeScript using Nepay. Supports Hosted Web Checkout, Direct Dynamic QR, and Mock Sandbox testing.
---

Fonepay is Nepal's dominant interoperable retail payment network operated by F1Soft International, connecting commercial banks, development banks, and mobile wallets. 

`@bivekkk/nepay` supports **both** official Fonepay integration modes:
1. **Hosted Web Checkout (`flow: "hosted"`)**: Redirects customers to Fonepay's hosted payment portal where they authenticate or scan.
2. **Direct Dynamic QR (`flow: "qr"`)**: Server-to-server API generating standard EMVCo dynamic QR payloads for in-page display or mobile banking app deep linking.

---

## Configuration & Credentials

```typescript
import { FonepayConfig } from "@bivekkk/nepay";

export const fonepayConfig: FonepayConfig = {
  merchantCode: process.env.FONEPAY_MERCHANT_CODE!, // Provided by Fonepay / Bank
  secretKey: process.env.FONEPAY_SECRET_KEY!,       // Shared secret for HMAC-SHA512
  returnUrl: process.env.FONEPAY_RETURN_URL!,       // Callback URL after hosted payment
  isSandbox: process.env.NODE_ENV !== "production", // Sandbox vs Live API endpoints
};
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `merchantCode` | `string` | **Yes** | Your unique merchant code (PID) assigned by Fonepay. Use `"FONEPAYTEST"` for local mock testing. |
| `secretKey` | `string` | **Yes** | Shared secret key used to compute and verify HMAC-SHA512 signatures. |
| `isSandbox` | `boolean` | No | Defaults to `false`. Targets dev endpoints (`dev-clientapi.fonepay.com`). |
| `returnUrl` | `string` | Optional | Default redirect URL for hosted checkout returns if not set per-order. |

---

## Mode 1: Hosted Web Checkout (Redirect Flow)

Ideal for standard e-commerce carts where you want Fonepay to handle customer interaction on their official hosted page.

### 1. Initiate Payment

```typescript
import { initiatePayment } from "@bivekkk/nepay";
import { fonepayConfig } from "../lib/fonepay.js";

const result = await initiatePayment({
  method: "fonepay",
  config: fonepayConfig,
  flow: "hosted", // Optional, defaults to "hosted"
  order: {
    orderId: "INV-2024-001",
    amountPaisa: 10000, // NPR 100.00
    remarks1: "Store Order #001",
    returnUrl: "https://myshop.com/payment/fonepay/callback",
  },
});

// Redirect customer to Fonepay hosted payment portal
res.redirect(result.payment_url);
```

### 2. Verify Payment on Callback

When payment completes, Fonepay redirects to your `returnUrl` with query parameters (`PRN`, `UID`, `BID`, `P_AMT`, `DV`). Pass these directly to `verifyPayment`:

```typescript
import { verifyPayment } from "@bivekkk/nepay";
import { fonepayConfig } from "../lib/fonepay.js";

app.get("/payment/fonepay/callback", async (req, res) => {
  const result = await verifyPayment({
    method: "fonepay",
    config: fonepayConfig,
    orderId: String(req.query.PRN || req.query.prn),
    expectedAmountPaisa: 10000,
    callbackData: req.query as Record<string, string>,
  });

  if (result.status === "completed") {
    // Payment verified via Fonepay Server-to-Server status check
    console.log("Fulfillment confirmed! Trace ID:", result.traceId);
    return res.render("payment-success", { orderId: result.orderId });
  }

  return res.render("payment-failed", { orderId: result.orderId });
});
```

---

## Mode 2: Direct Dynamic QR (In-Page / App Intent)

Ideal for custom checkouts, in-store POS, or mobile apps where you want to render an EMVCo QR code directly in your UI or deep-link into Nepali banking apps without redirecting away.

### 1. Request Dynamic QR Payload

```typescript
import { initiatePayment } from "@bivekkk/nepay";
import { fonepayConfig } from "../lib/fonepay.js";

const result = await initiatePayment({
  method: "fonepay",
  config: fonepayConfig,
  flow: "qr",
  order: {
    orderId: "INV-2024-002",
    amountPaisa: 25000, // NPR 250.00
    remarks1: "In-page QR Checkout",
  },
});

if (result.flow === "qr") {
  // result.qr_message: Raw EMVCo QR string (e.g. "00020101021226...")
  // result.websocket_url: Fonepay WebSocket stream URL for real-time scan notifications
  res.json({
    qrString: result.qr_message,
    websocketUrl: result.websocket_url,
    expiresIn: result.expires_in,
  });
}
```

### 2. Rendering & Mobile Deep-Linking in Frontend

On Desktop, encode `qrString` into an SVG/Canvas with any QR generator (e.g. `qrcode`):

```html
<!-- Desktop: Show QR for customer to scan with any Nepal bank or wallet app -->
<div id="qrcode"></div>
```

On Mobile devices, deep-link directly into Nepal commercial bank apps:

```javascript
// Opens customer's mobile banking app directly with the payment pre-filled
const appScheme = `nabilmbank://?qrPayload=${encodeURIComponent(qrString)}`;
window.location.href = appScheme;
```

### 3. Verify Dynamic QR Payment

Poll or check status using `verifyPayment`:

```typescript
const result = await verifyPayment({
  method: "fonepay",
  config: fonepayConfig,
  flow: "qr",
  orderId: "INV-2024-002",
  expectedAmountPaisa: 25000,
});

if (result.status === "completed") {
  // Payment confirmed via thirdPartyDynamicQrGetStatus
} else if (result.status === "pending") {
  // Customer has not scanned yet
}
```

---

## Sandbox & Local Mock Mode

Unlike eSewa and Khalti, Fonepay **does not offer an open self-serve dummy sandbox**. Testing with official Fonepay sandbox requires an acquiring bank contract and moves small real-money micro-transactions.

### Zero-Config Local Development with Mock Mode
`nepay` includes a built-in deterministic simulator for developers who don't have bank credentials yet:

```typescript
const devFonepayConfig: FonepayConfig = {
  merchantCode: "FONEPAYTEST", // Triggers built-in deterministic simulator
  secretKey: "test_secret_key",
  isSandbox: true,
  returnUrl: "http://localhost:3000/callback",
};
```

* In `flow: "hosted"`, generates valid test URLs.
* In `flow: "qr"`, generates valid **EMVCo-standard QR payload strings** that you can render in your UI and scan.
* `verifyPayment` returns valid `completed` results with mock trace IDs, letting you test your complete webhook and fulfillment pipeline without bank approval.

---

## Technical Security & Verification Contract

1. **HMAC-SHA512 Digest**: All payloads (hosted parameters, dynamic QR download, and status verification) are hashed using HMAC-SHA512 over strict parameter ordering.
2. **Double Verification**: Hosted callbacks verify both the callback `DV` signature in the URL query and perform an authoritative Server-to-Server status inquiry (`verificationMerchant`).
3. **Paisa Normalization**: Amounts are checked in integer paisa, completely preventing floating-point mismatches.
