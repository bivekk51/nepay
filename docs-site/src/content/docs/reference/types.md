---
title: "API Reference: Types & Schemas"
description: TypeScript interfaces, types, and Zod schemas exported by nepay.
---

## Types

### `PaymentStatus`
```ts
type PaymentStatus = "completed" | "pending" | "failed" | "expired" | "canceled";
```

### `PaymentResult`
```ts
interface PaymentResult {
  /** Normalized status */
  status: PaymentStatus;
  /** Verified amount in integer paisa */
  amountPaisa: number;
  /** Verified or expected merchant order ID */
  orderId: string;
  /** Provider transaction reference (eSewa ref_id or Khalti transaction_id) */
  traceId: string | null;
  /** Raw gateway responses for debugging and audit logs */
  raw: unknown;
}
```

### `EsewaConfig`
```ts
interface EsewaConfig {
  productCode: string;
  secretKey: string;
  successUrl: string;
  failureUrl: string;
  env: "sandbox" | "production";
}
```

### `KhaltiConfig`
```ts
interface KhaltiConfig {
  secretKey: string;
  publicKey?: string;
  websiteUrl: string;
  returnUrl: string;
  env: "sandbox" | "production";
  baseUrl?: string;
}
```

### `InitiateKhaltiResult`
```ts
interface InitiateKhaltiResult {
  pidx: string;
  payment_url: string;
  expires_at: string;
  expires_in: number;
}
```

### `LookupKhaltiResult`
```ts
interface LookupKhaltiResult {
  pidx: string;
  total_amount: number;
  status: string;
  transaction_id: string | null;
  fee: number | null;
  refunded: boolean | null;
  raw: unknown;
}
```

---

## Errors

### `EsewaRetryableError`
```ts
class EsewaRetryableError extends Error
```
Thrown when eSewa's status endpoint responds with `{"code":0,"error_message":"Service is currently unavailable"}` indicating a temporary gateway downtime. Callers should retry after an exponential backoff.

---

## Constants

### `ESEWA_BASES`
```ts
const ESEWA_BASES = {
  sandbox: {
    form: "https://rc-epay.esewa.com.np/api/epay/main/v2/form",
    status: "https://rc.esewa.com.np/api/epay/transaction/status/",
  },
  production: {
    form: "https://epay.esewa.com.np/api/epay/main/v2/form",
    status: "https://esewa.com.np/api/epay/transaction/status/",
  },
} as const;
```

### `KHALTI_BASES`
```ts
const KHALTI_BASES = {
  sandbox: "https://dev.khalti.com/api/v2",
  production: "https://khalti.com/api/v2",
} as const;
```
