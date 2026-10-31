---
title: FonePay (Dynamic QR) Roadmap
description: Overview of FonePay integration support in nepay, covering Dynamic QR architecture, merchant validation flow, and the Phase 2 roadmap.
---

FonePay is Nepal's dominant interoperable retail payment network operated by F1Soft International. Unlike eSewa and Khalti, FonePay is bank-integrated and requires an approved corporate merchant agreement with a licensed partner commercial bank.

## Current Status: Phase 2 Roadmap

FonePay is scoped for **Phase 2** of `nepay` because FonePay does not offer an open, self-serve public developer sandbox:
- Test merchant credentials (`merchantCode`, `secretKey`, `username`, `password`) are bank-gated.
- FonePay Dynamic QR flow uses a WebSocket notification hint + polling model without standard browser return redirects.

---

## Planned Architecture (Dynamic QR v1.1)

```
1. Customer selects FonePay at checkout
2. Backend calls initiatePayment({ method: 'fonepay-qr', ... })
   └─ Signs payload with HMAC-SHA512 (hex)
   └─ Calls POST thirdPartyDynamicQrDownload
   └─ Receives { qrMessage, thirdpartyQrWebSocketUrl, prn }
3. Frontend renders EMVCo Dynamic QR
   └─ Backend or Frontend subscribes to WebSocket URL for payment hints
4. Customer scans QR via any bank app or digital wallet (eSewa, Khalti, IME Pay, bank apps)
5. WebSocket emits 'paymentSuccess' event
6. Backend verifies source of truth via POST thirdPartyDynamicQrGetStatus
   └─ Confirms paymentStatus === 'success' and captures fonepayTraceId
```

---

## Technical Comparison

| Feature | eSewa (ePay v2) | Khalti (KPG-2) | FonePay (Dynamic QR) |
|---|---|---|---|
| **Checkout UI** | Redirect / Form POST | Redirect / Link | Dynamic In-app QR Code |
| **Authentication** | `product_code` + HMAC secret | `Authorization: Key <secret>` | `merchantCode`, `secretKey`, `username`, `password` |
| **Signature** | HMAC-SHA256 (Base64) | None (Bearer token) | HMAC-SHA512 (Hex) |
| **Return URL** | Yes (Browser redirect) | Yes (Browser redirect) | None (WebSocket hint + S2S Polling) |
| **Test Sandbox** | Open public sandbox | Self-serve sandbox | Gated / Bank approval required |

If your organization has an active FonePay merchant agreement with an API certificate and would like early access to the Phase 2 FonePay integration module, please open an issue on [GitHub](https://github.com/bivekk51/nepay).
