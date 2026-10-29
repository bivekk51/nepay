---
title: Express.js Integration Recipe
description: Complete production-ready Express.js server example for accepting eSewa and Khalti payments.
---

This recipe demonstrates a complete, production-ready Express.js application implementing:
1. Provider configuration with environment variables.
2. Checkout initiation for eSewa (auto-submitting HTML form) and Khalti (302 redirect).
3. Resilient eSewa callback handling supporting both **GET** and **POST** requests.
4. Khalti return URL verification querying the server-to-server lookup endpoint.
5. Post-verification database fulfillment patterns.

---

## Complete Server Implementation

```ts title="server.ts"
import express, { type Request, type Response } from "express";
import {
  initiatePayment,
  verifyPayment,
  type EsewaConfig,
  type KhaltiConfig,
  EsewaRetryableError,
} from "unified-nepal-payments";

const app = express();

// Required: parse JSON bodies and URL-encoded form submissions from eSewa
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. Gateway Configurations
const esewaConfig: EsewaConfig = {
  productCode: process.env.ESEWA_PRODUCT_CODE ?? "EPAYTEST",
  secretKey: process.env.ESEWA_SECRET_KEY ?? "8gBm/:&EnhH.1/q",
  successUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/api/payment/callback/esewa`,
  failureUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/api/payment/callback/esewa`,
  env: "sandbox",
};

const khaltiConfig: KhaltiConfig = {
  // Obtain keys from https://test-admin.khalti.com/#/join/merchant
  secretKey: process.env.KHALTI_SECRET_KEY!,
  websiteUrl: process.env.APP_URL ?? "http://localhost:3000",
  returnUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/api/payment/callback/khalti`,
  env: "sandbox",
};

// --------------------------------------------------------------------------
// eSewa Endpoints
// --------------------------------------------------------------------------

// POST /api/payment/esewa/initiate: Generates auto-submitting HTML Form
app.post("/api/payment/esewa/initiate", async (req: Request, res: Response) => {
  const { orderId, amountPaisa } = req.body;

  try {
    const result = await initiatePayment({
      method: "esewa",
      config: esewaConfig,
      order: {
        orderId: String(orderId),
        amountPaisa: Number(amountPaisa),
      },
    });

    // Build hidden input tags for form POST
    const inputs = Object.entries(result.fields)
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${v}"/>`)
      .join("\n");

    // Render an auto-submitting form page to redirect the customer to eSewa
    res.setHeader("Content-Type", "text/html");
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Redirecting to eSewa...</title></head>
        <body onload="document.getElementById('esewa-form').submit()">
          <p>Redirecting to eSewa Secure Payment Gateway...</p>
          <form id="esewa-form" action="${result.url}" method="POST">
            ${inputs}
          </form>
        </body>
      </html>
    `);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

// ALL /api/payment/callback/esewa: Handles BOTH GET and POST callbacks
app.all("/api/payment/callback/esewa", async (req: Request, res: Response) => {
  // eSewa may deliver data in query (GET) or form body (POST)
  const data = (req.query.data || req.body?.data) as string;

  if (!data) {
    return res.status(400).send("Missing eSewa callback payload");
  }

  try {
    const result = await verifyPayment({
      method: "esewa",
      config: esewaConfig,
      data,
      expectedOrderId: "INV-2024-001", // Look up expected values from your session or DB
      expectedAmountPaisa: 10000,
    });

    if (result.status === "completed") {
      // ✅ S2S Verified: Mark order as paid in DB
      console.log("eSewa Payment Verified. Ref ID:", result.traceId);
      return res.redirect(`/order/success?id=${result.orderId}&ref=${result.traceId}`);
    }

    return res.redirect(`/order/failed?reason=${encodeURIComponent(result.status)}`);
  } catch (err) {
    if (err instanceof EsewaRetryableError) {
      // Gateway 503 outage: do not cancel, queue retry
      return res.redirect(`/order/pending?id=INV-2024-001`);
    }
    return res.status(400).send(`Verification error: ${(err as Error).message}`);
  }
});

// --------------------------------------------------------------------------
// Khalti Endpoints
// --------------------------------------------------------------------------

// POST /api/payment/khalti/initiate: Initiates REST payment session
app.post("/api/payment/khalti/initiate", async (req: Request, res: Response) => {
  const { orderId, amountPaisa, orderName } = req.body;

  try {
    const result = await initiatePayment({
      method: "khalti",
      config: khaltiConfig,
      order: {
        purchaseOrderId: String(orderId),
        purchaseOrderName: String(orderName ?? `Order ${orderId}`),
        amountPaisa: Number(amountPaisa),
      },
    });

    // Save result.pidx to your database mapped to orderId
    // Redirect customer directly to Khalti's hosted payment page
    return res.redirect(result.payment_url);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
});

// GET /api/payment/callback/khalti: Handles customer return redirect
app.get("/api/payment/callback/khalti", async (req: Request, res: Response) => {
  const pidx = req.query.pidx as string;

  if (!pidx) {
    return res.status(400).send("Missing pidx in callback query");
  }

  try {
    const result = await verifyPayment({
      method: "khalti",
      config: khaltiConfig,
      pidx,
      expectedOrderId: "INV-2024-001", // Retrieve from DB based on pidx
      expectedAmountPaisa: 10000,
    });

    if (result.status === "completed") {
      // ✅ S2S Verified via /epayment/lookup/: Mark order as paid
      console.log("Khalti Payment Verified. Transaction ID:", result.traceId);
      return res.redirect(`/order/success?id=${result.orderId}&ref=${result.traceId}`);
    }

    return res.redirect(`/order/failed?reason=${encodeURIComponent(result.status)}`);
  } catch (err) {
    return res.status(502).send(`Khalti lookup network error: ${(err as Error).message}`);
  }
});

app.listen(3000, () => {
  console.log("Payment server running on http://localhost:3000");
});
```

---

## Detailed Step-by-Step Breakdown

### 1. Middleware Setup
- `express.urlencoded({ extended: true })`: Essential because eSewa often submits POST callbacks as `application/x-www-form-urlencoded`.
- `express.json()`: Required for client API requests.

### 2. Auto-Submitting Form for eSewa
ePay v2 does not provide a direct REST URL for user checkout; it requires an HTML Form POST containing signed hidden inputs. The endpoint builds the hidden input tags and returns an HTML page that submits itself automatically using `document.getElementById('esewa-form').submit()`.

### 3. Handling GET vs POST on eSewa Callback
eSewa callbacks can arrive as either GET or POST. Using `app.all("/api/payment/callback/esewa", ...)` ensures your endpoint receives both without 405 Method Not Allowed errors.

### 4. Khalti S2S Verification
Khalti redirects the user back with `?pidx=...`. Never trust query status parameters alone. `verifyPayment()` sends an authenticated POST to `/epayment/lookup/` to verify settlement.
