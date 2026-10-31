---
title: "API Reference: Types & Schemas"
description: Complete TypeScript interfaces, discriminated unions, and runtime Zod validation schemas exported by nepay.
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

### `KhaltiPaymentMode`
```ts
type KhaltiPaymentMode = "KHALTI" | "EBANKING" | "MOBILE_BANKING" | "CONNECT_IPS" | "SCT";
```

### `KhaltiCheckoutChannel`
```ts
type KhaltiCheckoutChannel = "wallet" | "mobank" | "cips" | "ebank" | "sct" | "visa";
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

### `FonepayConfig`
```ts
interface FonepayConfig {
  merchantCode: string;
  secretKey: string;
  isSandbox?: boolean;
  returnUrl?: string;
  hostedBaseUrl?: string;
  hostedVerifyBaseUrl?: string;
  qrBaseUrl?: string;
  qrStatusBaseUrl?: string;
}
```

### `FonepayFlow`
```ts
type FonepayFlow = "hosted" | "qr";
```

### `InitiateFonepayHostedResult`
```ts
interface InitiateFonepayHostedResult {
  flow: "hosted";
  payment_url: string;
  prn: string;
}
```

### `InitiateFonepayQrResult`
```ts
interface InitiateFonepayQrResult {
  flow: "qr";
  qr_message: string;
  prn: string;
  websocket_url?: string;
  expires_in?: number;
}
```

### `InitiateFonepayOpts`
```ts
interface InitiateFonepayOpts {
  config: FonepayConfig;
  orderId: string;
  amountPaisa: number;
  flow?: FonepayFlow;
  returnUrl?: string;
  remarks1?: string;
  remarks2?: string;
  date?: Date | string;
}
```

### `VerifyFonepayPaymentOpts`
```ts
interface VerifyFonepayPaymentOpts {
  config: FonepayConfig;
  orderId: string;
  expectedAmountPaisa: number;
  flow?: FonepayFlow;
  callbackData?: {
    prn?: string;
    uid?: string;
    bid?: string;
    p_amt?: string | number;
    amt?: string | number;
    dv?: string;
    bc?: string;
    [key: string]: unknown;
  };
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

### `FONEPAY_BASES`
```ts
const FONEPAY_BASES = {
  sandbox: {
    hosted: "https://dev-clientapi.fonepay.com/api/merchantRequest",
    hostedVerify: "https://dev-clientapi.fonepay.com/api/merchantRequest/verificationMerchant",
    qr: "https://dev-clientapi.fonepay.com/api/merchant/thirdPartyDynamicQrDownload",
    qrStatus: "https://dev-clientapi.fonepay.com/api/merchant/thirdPartyDynamicQrGetStatus",
  },
  production: {
    hosted: "https://clientapi.fonepay.com/api/merchantRequest",
    hostedVerify: "https://clientapi.fonepay.com/api/merchantRequest/verificationMerchant",
    qr: "https://clientapi.fonepay.com/api/merchant/thirdPartyDynamicQrDownload",
    qrStatus: "https://clientapi.fonepay.com/api/merchant/thirdPartyDynamicQrGetStatus",
  },
} as const;
```
