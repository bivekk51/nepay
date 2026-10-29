---
title: "API Reference: Functions"
description: Complete reference for all functions and methods exported by nepay.
---

## Unified Functions

### `initiatePayment(input)`

Dispatches initiation based on `input.method`.

```ts
function initiatePayment(
  input: UnifiedInitiateInput
): Promise<{ url: string; fields: Record<string, string> } | InitiateKhaltiResult>
```

#### Parameters:
- `input`: A discriminated union on `method`:
  - `method: 'esewa'`: Requires `config: EsewaConfig` and `order: { orderId, amountPaisa, taxPaisa?, servicePaisa?, deliveryPaisa? }`.
  - `method: 'khalti'`: Requires `config: KhaltiConfig` and `order: { purchaseOrderId, purchaseOrderName, amountPaisa, customerInfo?, amountBreakdown?, extra? }`.

#### Returns:
- For eSewa: `{ url: string, fields: Record<string, string> }` (target form URL and hidden input dictionary).
- For Khalti: `{ pidx: string, payment_url: string, expires_at: string, expires_in: number }`.

---

### `verifyPayment(input)`

Dispatches verification based on `input.method` and returns a normalized `PaymentResult`.

```ts
function verifyPayment(
  input: UnifiedVerifyInput
): Promise<PaymentResult>
```

#### Parameters:
- `input`:
  - `method: 'esewa'`: Requires `config`, `data` (base64 string), `expectedOrderId`, `expectedAmountPaisa`.
  - `method: 'khalti'`: Requires `config`, `pidx`, `expectedAmountPaisa`, `expectedOrderId?`.

#### Returns:
A promise resolving to a normalized `PaymentResult`:
```ts
interface PaymentResult {
  status: "completed" | "pending" | "failed" | "expired" | "canceled";
  amountPaisa: number;
  orderId: string;
  traceId: string | null; // eSewa ref_id or Khalti transaction_id
  raw: unknown;           // Raw provider responses for audit logging
}
```

---

## eSewa Dedicated Functions

### `buildEsewaFields(opts)`
```ts
function buildEsewaFields(opts: EsewaFieldOpts): {
  url: string;
  fields: Record<string, string>;
}
```
Constructs the HMAC-SHA256 signature and returns the form action URL and required fields.

### `verifyEsewaPayment(opts)`
```ts
function verifyEsewaPayment(opts: VerifyEsewaPaymentOpts): Promise<PaymentResult>
```
Decodes `data`, checks HMAC with `timingSafeEqual`, queries status API, and normalizes output.

### `signEpayV2(params, secret)`
```ts
function signEpayV2(
  p: { total_amount: string; transaction_uuid: string; product_code: string },
  secret: string
): string
```
Calculates ePay v2 Base64 digest of `total_amount=...,transaction_uuid=...,product_code=...`.

### `checkEpayStatus(opts)`
```ts
function checkEpayStatus(opts: EpayStatusOpts): Promise<EpayStatusResult>
```
Queries eSewa transaction status endpoint directly via HTTP GET.

---

## Khalti Dedicated Functions

### `initiateKhalti(opts)`
```ts
function initiateKhalti(opts: InitiateKhaltiOpts): Promise<InitiateKhaltiResult>
```
Calls `/epayment/initiate/` with `Authorization: Key <secret>` and returns `pidx` and `payment_url`.

### `lookupKhalti(opts)`
```ts
function lookupKhalti(opts: LookupKhaltiOpts): Promise<LookupKhaltiResult>
```
Calls `/epayment/lookup/` with `pidx`. Correctly parses HTTP 400 error bodies into status strings.

### `verifyKhaltiPayment(opts)`
```ts
function verifyKhaltiPayment(opts: VerifyKhaltiPaymentOpts): Promise<PaymentResult>
```
Queries lookup and normalizes payment status to `PaymentResult`.

---

## Money Utilities

### `nprToPaisa(npr: number): number`
Converts rupees to integer paisa: `Math.round(npr * 100)`.

### `paisaToRupeesString(paisa: number): string`
Converts integer paisa to string decimal representation (e.g. `12345` $\rightarrow$ `"123.45"`).

### `parseAmountToPaisa(raw: string | number): number`
Parses formatted or comma-separated amount strings (e.g. `"1,000.0"`) to integer paisa (`100000`).
