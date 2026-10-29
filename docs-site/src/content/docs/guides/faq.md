---
title: Nepal Payment Gateway FAQ & Troubleshooting
description: "Solutions to common eSewa ePay v2 and Khalti errors: PENDING callbacks, CORS issues, amount breakdown mismatches, and signature debugging."
head:
  - tag: script
    attrs:
      type: application/ld+json
    content: |
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
          {
            "@type": "Question",
            "name": "Why does eSewa return PENDING to my failureUrl?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "In eSewa ePay v2, when a transaction is not completed immediately or times out, eSewa redirects to failureUrl with status: \"PENDING\" rather than \"FAILED\". nepay handles this automatically: calling verifyPayment() returns status: \"pending\". Keep the order in a pending state and query status later."
            }
          },
          {
            "@type": "Question",
            "name": "Why is Khalti rejecting my transaction with Amount Breakdown mismatch?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "If you pass amountBreakdown, Khalti requires that the sum of each item's amount must strictly equal the top-level amountPaisa. nepay validates this pre-flight before sending the request to Khalti."
            }
          },
          {
            "@type": "Question",
            "name": "Why does my browser get a CORS error when initiating a payment?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "Initiating payments requires your merchant secret keys. If you try to call Khalti's /epayment/initiate/ or build signatures in client-side React code, the gateway blocks the request via CORS. Initiation must happen server-side."
            }
          },
          {
            "@type": "Question",
            "name": "How do I handle duplicate payment callbacks (Idempotency)?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "To prevent double-fulfilment when a customer refreshes the return URL: key your database transaction by orderId or purchaseOrderId and wrap fulfillment in an atomic check ensuring the order is not already marked completed."
            }
          },
          {
            "@type": "Question",
            "name": "What does EsewaRetryableError mean?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "When eSewa's backend is performing maintenance, their transaction status check API returns a service unavailable error. The SDK catches this and throws EsewaRetryableError. Do not fail the user's order; retry the verification in 1 or 2 minutes."
            }
          },
          {
            "@type": "Question",
            "name": "Can I test cards or e-banking in Khalti sandbox?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": "In the Khalti sandbox, only Khalti Wallet payments are enabled for automated testing. Card payments and e-banking options are only available in production after merchant KYC approval."
            }
          }
        ]
      }
---

## Frequently Asked Questions

### Why does eSewa return `PENDING` to my `failureUrl`?
In eSewa ePay v2, when a transaction is not completed immediately or times out, eSewa redirects to `failureUrl` with `status: "PENDING"` rather than `"FAILED"`.
`nepay` handles this automatically: calling `verifyPayment()` returns `status: "pending"`. You should keep the order in a pending state and query the status later.

### Why is Khalti rejecting my transaction with "Amount Breakdown mismatch"?
If you pass `amountBreakdown`, Khalti requires that the sum of each item's `amount` must **strictly equal** the top-level `amountPaisa`.
`nepay` validates this pre-flight before sending the request to Khalti.

### Why does my browser get a CORS error when initiating a payment?
Initiating payments requires your merchant secret keys. If you try to call Khalti's `/epayment/initiate/` or build signatures in client-side React code, the gateway blocks the request via CORS. This is intentional: **initiation must happen server-side**.

### How do I handle duplicate payment callbacks (Idempotency)?
A customer might refresh their browser on the return URL, or eSewa might retry sending the callback.
To prevent double-fulfilment:
1. Always key your database transaction by `orderId` or `purchaseOrderId`.
2. Wrap fulfillment in an atomic check:
   ```ts
   const order = await db.orders.findUnique({ where: { id: orderId } });
   if (order.status === "completed") {
     // Already fulfilled! Return success without duplicate fulfillment.
     return;
   }
   await db.orders.update({ where: { id: orderId }, data: { status: "completed" } });
   ```

### What does `EsewaRetryableError` mean?
When eSewa's backend is performing maintenance, their transaction status check API returns `{"code":0,"error_message":"Service is currently unavailable"}`.
The SDK catches this and throws `EsewaRetryableError`. Do not fail the user's order; retry the verification in 1 or 2 minutes.

### Can I test cards or e-banking in Khalti sandbox?
In the Khalti sandbox (`test-pay.khalti.com`), only Khalti Wallet payments are enabled for automated testing. Card payments and e-banking options are only available in production after merchant KYC approval.
