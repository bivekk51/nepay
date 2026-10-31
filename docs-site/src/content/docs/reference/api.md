---
title: "API Reference: Functions"
description: Complete reference for all unified payment functions and gateway helper methods exported by nepay.
---

## Unified Functions

### `initiatePayment(input)`

Dispatches initiation based on `input.method`.

```ts
function initiatePayment(
  input: UnifiedInitiateInput
): Promise<
  | { url: string; fields: Record<string, string> }
  | InitiateKhaltiResult
  | InitiateFonepayHostedResult
  | InitiateFonepayQrResult
>
```

#### Parameters:
- `input`: A discriminated union on `method`:
  - `method: 'esewa'`: Requires `config: EsewaConfig` and `order: { orderId, amountPaisa, taxPaisa?, servicePaisa?, deliveryPaisa? }`.
  - `method: 'khalti'`: Requires `config: KhaltiConfig` and `order: { purchaseOrderId (or orderId), purchaseOrderName, amountPaisa, customerInfo?, amountBreakdown?, extra? }`.
  - `method: 'fonepay'`: Requires `config: FonepayConfig` and `order: { orderId, amountPaisa, remarks1?, remarks2?, returnUrl?, date? }`. Optional `flow?: 'hosted' | 'qr'`.

#### Returns:
- For eSewa: `{ url: string, fields: Record<string, string> }` (target form URL and hidden input dictionary).
- For Khalti: `{ pidx: string, payment_url: string, expires_at: string, expires_in: number }`.
- For Fonepay (Hosted): `{ flow: "hosted", payment_url: string, prn: string }`.
- For Fonepay (QR): `{ flow: "qr", qr_message: string, prn: string, websocket_url?: string, expires_in?: number }`.

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
  - `method: 'esewa'`: Requires `config: EsewaConfig`, `data` (base64 string), `expectedOrderId`, `expectedAmountPaisa`.
  - `method: 'khalti'`: Requires `config: KhaltiConfig`, `pidx`, `expectedAmountPaisa`, `expectedOrderId?`.
  - `method: 'fonepay'`: Requires `config: FonepayConfig`, `orderId`, `expectedAmountPaisa`, and optional `flow?: 'hosted' | 'qr'`, `callbackData?: Record<string, unknown>`.

#### Returns:
A promise resolving to a normalized `PaymentResult`:
```ts
interface PaymentResult {
  status: "completed" | "pending" | "failed" | "expired" | "canceled";
  amountPaisa: number;
  orderId: string;
  traceId: string | null; // eSewa ref_id, Khalti transaction_id, or Fonepay UID/bankTxnId
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

### `getKhaltiCheckoutUrl(paymentUrlOrPidx, channel?, opts?)`
```ts
function getKhaltiCheckoutUrl(
  paymentUrlOrPidx: string,
  channel?: "wallet" | "mobank" | "cips" | "ebank" | "sct" | "visa",
  opts?: { env?: "sandbox" | "production" }
): string
```
Constructs a direct deep-link URL for Khalti checkout, targeting either the default multi-option selector or a specific direct channel (e.g. `/mobank` for Mobile Banking, `/cips` for ConnectIPS, `/wallet` for Khalti Wallet).

---

## Fonepay Dedicated Functions

### `initiateFonepay(opts)`
```ts
function initiateFonepay(
  opts: InitiateFonepayOpts
): Promise<InitiateFonepayHostedResult | InitiateFonepayQrResult>
```
Initiates a Fonepay payment. If `opts.flow === "hosted"`, generates and returns `{ url: string }`. If `opts.flow === "qr"`, requests or generates a dynamic EMVCo QR string and returns `{ qrString: string, prn: string, isMock: boolean }`.

### `verifyFonepayPayment(opts)`
```ts
function verifyFonepayPayment(opts: VerifyFonepayPaymentOpts): Promise<PaymentResult>
```
Verifies a Fonepay payment. For `flow: "hosted"`, verifies callback signature and queries `/api/merchantRequest/verificationMerchant`. For `flow: "qr"`, queries `/api/merchant/thirdPartyDynamicQrGetStatus`. Returns normalized `PaymentResult`.

### `generateFonepayHostedUrl(opts)`
```ts
function generateFonepayHostedUrl(opts: {
  config: FonepayConfig;
  order: { prn: string; amountPaisa: number; remarks1: string; remarks2?: string; date?: string };
}): string
```
Calculates HMAC-SHA512 digest and builds the complete redirection URL to Fonepay's hosted payment gateway.

### `generateFonepayHostedSignature(params, secret)`
```ts
function generateFonepayHostedSignature(
  params: {
    pid: string;
    md: string;
    prn: string;
    amt: string;
    crn: string;
    dt: string;
    r1: string;
    r2: string;
    ru: string;
  },
  secret: string
): string
```
Calculates HMAC-SHA512 signature over `PID,MD,PRN,AMT,CRN,DT,R1,R2,RU`.

### `generateFonepayHostedVerifySignature(params, secret)`
```ts
function generateFonepayHostedVerifySignature(
  params: { pid: string; prn: string; bid: string; uid: string; amt: string },
  secret: string
): string
```
Calculates HMAC-SHA512 signature for hosted verification queries over `PID,PRN,BID,UID,AMT`.

### `generateFonepayQrSignature(params, secret)`
```ts
function generateFonepayQrSignature(
  params: { amount: string; prn: string; merchantCode: string; remarks1: string; remarks2?: string },
  secret: string
): string
```
Calculates HMAC-SHA512 signature for dynamic QR downloads over `amount,prn,merchantCode,remarks1,remarks2`.

### `generateFonepayQrStatusSignature(params, secret)`
```ts
function generateFonepayQrStatusSignature(
  params: { prn: string; merchantCode: string },
  secret: string
): string
```
Calculates HMAC-SHA512 signature for QR status queries over `prn,merchantCode`.

### `verifyFonepaySignature(receivedSig, expectedSig)`
```ts
function verifyFonepaySignature(receivedSig: string, expectedSig: string): boolean
```
Performs a timing-safe comparison (`crypto.timingSafeEqual`) of two Fonepay signatures.

### `fonepayPaisaToAmount(paisa)`
```ts
function fonepayPaisaToAmount(paisa: number): string
```
Converts integer paisa to strict 2-decimal rupee string (e.g. `10000` $\rightarrow$ `"100.00"`).

### `formatFonepayDate(date?)`
```ts
function formatFonepayDate(date?: Date): string
```
Formats a date into Fonepay's mandatory `MM/DD/YYYY` string format anchored to Nepal local time (`Asia/Kathmandu`).

---

## Money Utilities

### `nprToPaisa(npr: number): number`
Converts rupees to integer paisa: `Math.round(npr * 100)`.

### `paisaToRupeesString(paisa: number): string`
Converts integer paisa to string decimal representation (e.g. `12345` $\rightarrow$ `"123.45"`).

### `parseAmountToPaisa(raw: string | number): number`
Parses formatted or comma-separated amount strings (e.g. `"1,000.0"`) to integer paisa (`100000`).
