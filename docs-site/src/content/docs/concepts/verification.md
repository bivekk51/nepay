---
title: S2S Verification & Contracts
description: Why server-to-server verification is mandatory and how to handle provider verification differences.
---

A dangerous mistake in Nepal payment integrations is fulfilling an order immediately upon receiving the user's browser redirect.

:::caution[Redirects Cannot Be Trusted Alone]
A customer can tamper with browser redirect query parameters, simulate form submissions, or drop off before their bank actually debits funds.
:::

`nepay` strictly enforces **Mandatory Server-to-Server (S2S) Verification**.

## The Golden Fulfilment Rule

```ts
if (result.status === "completed") {
  // Fulfil order exactly once (idempotent on orderId)
}
```

Only mark an order fulfilled when `result.status === "completed"`.

- `status === "pending"`: Payment has not settled. Hold order, poll or re-query status later.
- `status === "failed"`: Amount mismatch, order ID mismatch, or payment canceled/refunded.
- `status === "expired"`: The payment window expired before customer finished authorization.
- `status === "canceled"`: The customer explicitly canceled the payment screen.

---

## Provider Verification Contracts

The two gateways report verification issues differently. Knowing how each provider behaves helps you structure your error handling.

### 1. eSewa (ePay v2)
When `verifyPayment({ method: "esewa", ... })` is called:
1. Base64-decodes `data`.
2. Validates the HMAC-SHA256 signature using `timingSafeEqual`.
3. Verifies that `product_code`, `transaction_uuid`, and `total_amount` match your expected parameters.
4. **Makes an HTTPS call to eSewa's transaction status endpoint**:
   `GET https://rc.esewa.com.np/api/epay/transaction/status/?product_code=...`
5. Confirms that eSewa reports `status: "COMPLETE"` **and** returns a non-null `ref_id`.

**Exception behavior**:
- `verifyPayment` **THROWS** on invalid signatures, missing payload parameters, amount mismatches, or order ID mismatches.
- If eSewa's status endpoint is temporarily down (returning `code: 0, error_message: "Service is currently unavailable"`), it throws an `EsewaRetryableError` so you can retry checking status later.

### 2. Khalti (ePayment v2)
When `verifyPayment({ method: "khalti", ... })` is called:
1. Makes an authorized HTTPS POST request to Khalti's lookup endpoint:
   `POST https://dev.khalti.com/api/v2/epayment/lookup/` with `{ pidx }`.
2. Evaluates the live gateway status and validates the amount and order binding:
   - `status: "Completed"` and `total_amount === expectedAmountPaisa` $\rightarrow$ `{ status: "completed" }`
   - `status: "Pending"` or `"Initiated"` $\rightarrow$ `{ status: "pending" }`
   - `status: "Expired"` $\rightarrow$ `{ status: "expired" }`
   - `status: "User canceled"` $\rightarrow$ `{ status: "canceled" }`
   - `status: "Refunded"` or amount mismatch $\rightarrow$ `{ status: "failed" }`

**Exception behavior**:
- `verifyPayment` **RETURNS** `{ status: "failed" }` on amount mismatch or order ID mismatch (instead of throwing).
- It **throws only** on network transport errors or malformed non-JSON gateway responses.

---

## The Universal Try/Catch Pattern

Because eSewa throws on mismatches while Khalti throws on network failures, **always wrap `verifyPayment()` in a `try/catch` block**:

```ts
try {
  const result = await verifyPayment(input);

  switch (result.status) {
    case "completed":
      // Fulfil order
      break;
    case "pending":
      // Keep order in pending state, await confirmation
      break;
    case "expired":
    case "canceled":
    case "failed":
      // Mark failed or canceled
      break;
  }
} catch (error) {
  if (error instanceof EsewaRetryableError) {
    // Gateway is temporarily down; schedule a retry in 1 minute
  } else {
    // Invalid signature, payload tampering, or network outage
    console.error("Verification error:", error);
  }
}
```
