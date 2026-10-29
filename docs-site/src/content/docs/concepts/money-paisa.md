---
title: Integer Paisa & Money Math
description: Why nepay uses integer paisa and how to avoid floating-point errors.
---

One of the most frequent sources of payment bugs and silent reconciliation failures in fintech applications is **floating-point arithmetic drift** (e.g. `0.1 + 0.2 === 0.30000000000000004`).

To make `nepay` mathematically deterministic and safe across all databases and platforms, **every monetary amount in the public API is an integer paisa**.

## The Paisa Rule

> **1 NPR (Rupee) = 100 Paisa**

Every amount passed to `initiatePayment()` or returned by `verifyPayment()` is represented in integer paisa. Never pass decimal amounts or floating-point numbers.

| NPR Display | Paisa Value | Note |
|---|---|---|
| `NPR 10.00` | `1000` | Minimum allowed transaction for Khalti |
| `NPR 50.50` | `5050` | Fractional rupee |
| `NPR 100.00` | `10000` | Standard test transaction |
| `NPR 1,250.75` | `125075` | No commas, pure integer |

## Built-in Conversion Helpers

The SDK provides three dedicated helpers for converting between rupees and paisa:

```ts
import { nprToPaisa, paisaToRupeesString, parseAmountToPaisa } from "nepay";
```

### 1. `nprToPaisa(npr: number): number`
Converts a decimal rupee number to integer paisa using `Math.round(npr * 100)`.

```ts
nprToPaisa(123.45); // => 12345
nprToPaisa(10);     // => 1000
```

### 2. `paisaToRupeesString(paisa: number): string`
Converts integer paisa into a formatted decimal string (up to 2 decimals) required by gateways such as eSewa's form inputs.

```ts
paisaToRupeesString(12345); // => "123.45"
paisaToRupeesString(10000); // => "100" (trailing zeros trimmed)
paisaToRupeesString(10050); // => "100.5"
```

### 3. `parseAmountToPaisa(raw: string | number): number`
Strips commas and formatting quirks from callback responses and parses them back into safe integer paisa.

```ts
parseAmountToPaisa("1,000.0"); // => 100000
parseAmountToPaisa("1250.50"); // => 125050
parseAmountToPaisa(100);       // => 10000
```

## Why This Matters in Gateway Communication

### eSewa (ePay v2)
eSewa requires decimal rupees in form submissions (e.g. `"100"` or `"112.50"`). When eSewa redirects back to your callback, it often formats amounts with commas:
```json
{
  "total_amount": "1,000.0"
}
```
If you perform string equality `total_amount === "1000"`, the verification would fail! `nepay` solves this by:
1. Verifying the HMAC-SHA256 signature against the **raw string** as received (`"1,000.0"`).
2. Stripping commas and parsing the amount to paisa (`100000`) for exact numeric comparison against `expectedAmountPaisa`.
3. Normalizing to plain decimal `"1000.0"` before invoking eSewa's status query endpoint.

### Khalti (ePayment v2)
Khalti operates natively in **integer paisa**:
- Minimum amount is `1000` (NPR 10). Passing less throws a pre-flight validation error.
- Breakdown sum (`amount_breakdown[].amount`) must equal `amount` in paisa.
