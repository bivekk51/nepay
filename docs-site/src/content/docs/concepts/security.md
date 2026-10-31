---
title: Security & Server-Only Keys
description: "Security principles for Nepal payment gateways: server-only credentials, timing-safe HMAC validation, and zero client-side secret leaks."
---

Payment gateway integration errors frequently result in high-severity security vulnerabilities. `nepay` is built with a defense-in-depth architecture to eliminate common failure modes.

## ⚠️ The Server-Only Rule

:::danger[Never Expose Secret Keys to the Browser]
`EsewaConfig.secretKey`, `KhaltiConfig.secretKey`, and `FonepayConfig.secretKey` must **never** be shipped in client-side bundles (e.g. React, Vue, Svelte, or Next.js `NEXT_PUBLIC_*` variables).
:::

If a secret key is exposed in browser JavaScript:
- Attackers can sign arbitrary fraudulent eSewa or Fonepay payment callbacks and mark orders paid.
- Attackers can issue unauthorized API queries, QR downloads, and refunds directly to your merchant balance.

All calls to `initiatePayment()` and `verifyPayment()` must execute strictly in backend code:
- Node.js / Express / Fastify / Koa / NestJS route handlers
- Next.js Server Actions or Route Handlers (`app/api/.../route.ts`)
- Serverless functions (AWS Lambda, Google Cloud Functions)

## Zero Secret Logging

The SDK adheres to a strict zero-leak logging discipline:
- No secrets are printed in logs.
- Error messages do not concatenate or echo secret keys.
- Gateway payloads included in the normalized `raw` result only contain non-sensitive gateway response bodies.

## Constant-Time HMAC Signature Comparison

When verifying eSewa (HMAC-SHA256) and Fonepay (HMAC-SHA512) callback signatures, standard string comparison (`a === b`) is vulnerable to **timing attacks**, where an attacker measures slight microsecond timing differences to infer byte values.

`nepay` uses `crypto.timingSafeEqual`:

```ts
import { timingSafeEqual } from "node:crypto";

function constantTimeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
```

This ensures that the time taken to evaluate signatures remains constant regardless of how many bytes match. Built-in helpers `verifyFonepaySignature()` and eSewa verification use this pattern everywhere.

## Unique Transaction IDs Per Attempt

Never reuse an order ID across multiple payment attempts. If a customer abandons a checkout or their card expires, minting a new attempt ID (e.g. `ORDER_101_ATTEMPT_1`, `ORDER_101_ATTEMPT_2` or UUID) prevents:
- Idempotency collisions at Khalti.
- Replay attacks where an old completed payment is claimed for a new order.
