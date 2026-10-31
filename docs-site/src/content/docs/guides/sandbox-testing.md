---
title: Payment Gateways Sandbox & Mock Testing Guide (eSewa, Khalti & Fonepay)
description: Official test credentials, customer test wallets, MPINs, OTPs, and local mock testing for eSewa UAT, Khalti sandbox, and Fonepay flows.
---

Testing digital payment gateways in Nepal requires testing against official staging and sandbox environments before applying for production merchant credentials.

This guide provides official test credentials, wallet phone numbers, test OTPs, local simulation options for Fonepay, and instructions for running the test suite.

---

## 1. Gateway Sandbox Credentials

### eSewa (UAT Environment)
eSewa provides a public User Acceptance Testing (UAT) gateway for testing ePay v2 integrations:

- **Form POST Gateway**: `https://rc-epay.esewa.com.np/api/epay/main/v2/form`
- **S2S Status Query API**: `https://rc.esewa.com.np/api/epay/transaction/status/`
- **Merchant Product Code**: `EPAYTEST`
- **Merchant Secret Key**: `8gBm/:&EnhH.1/q`

#### eSewa Customer Test Wallets
Use these test account credentials when prompted on the eSewa checkout screen:

| Mobile Number | Password | MPIN | SMS OTP |
|---|---|---|---|
| `9806800001` | `Nepal@123` | `1122` | `123456` |
| `9806800002` | `Nepal@123` | `1122` | `123456` |
| `9806800003` | `Nepal@123` | `1122` | `123456` |
| `9806800004` | `Nepal@123` | `1122` | `123456` |
| `9806800005` | `Nepal@123` | `1122` | `123456` |

---

### Khalti (Sandbox Environment)
Khalti issues merchant test credentials through their developer portal:

- **API Base URL**: `https://dev.khalti.com/api/v2`
- **Hosted Payment Screen**: `https://test-pay.khalti.com`

#### How to Obtain Khalti Test Keys
1. Register for a free merchant test account at [Khalti Test Merchant Admin](https://test-admin.khalti.com/#/join/merchant).
2. Log in and navigate to **Keys** in the left navigation sidebar.
3. Copy your test **Secret Key** (`live_secret_key` or `test_secret_key`).
4. Set it as `KHALTI_SECRET_KEY` in your environment.

#### Khalti Customer Test Wallets
Use these test wallets on the Khalti checkout screen:

| Mobile Number | MPIN | SMS OTP |
|---|---|---|
| `9800000000` | `1111` | `987654` |
| `9800000001` | `1111` | `987654` |
| `9800000002` | `1111` | `987654` |
| `9800000003` | `1111` | `987654` |
| `9800000004` | `1111` | `987654` |
| `9800000005` | `1111` | `987654` |

---

### Fonepay (Mock Sandbox & UAT Environment)

#### The Fonepay Credential Reality
Unlike eSewa or Khalti, **Fonepay does NOT provide an open self-service developer registration portal**. Test and production credentials for Fonepay require formal merchant onboarding through an acquiring commercial bank in Nepal (e.g., Nabil Bank, Global IME Bank, NIC Asia Bank, Himalayan Bank) or direct partner agreement with F1Soft / Fonepay.

#### The `nepay` Built-In Mock Simulator
To allow developers to build full checkout flows, UI modals, QR scanner integrations, and end-to-end payment state machines without waiting weeks for bank approvals, `nepay` includes a **zero-configuration developer mock simulator**:

- **Merchant Code**: `"FONEPAYTEST"`
- **Secret Key**: `"fonepay_secret_key"`
- **Environment**: `isSandbox: true`

When configured with `isSandbox: true` and `merchantCode: "FONEPAYTEST"`:
1. **Dynamic QR Flow (`flow: "qr"`)**: `initiatePayment()` immediately generates a syntactically valid EMVCo dynamic QR code containing the requested amount and PRN (`000201010212...0406100.00...5802NP...`). You can render this directly as a QR code in your UI.
2. **Hosted Web Flow (`flow: "hosted"`)**: Generates the exact signed redirect URL (`https://dev-clientapi.fonepay.com/api/merchantRequest?PID=...&MD=P&PRN=...&DV=...`) with HMAC-SHA512 verification digest.
3. **When Real Credentials Arrive**: Simply replace `"FONEPAYTEST"` and `"fonepay_secret_key"` with your bank-issued production credentials. Zero code changes required.

---

## 2. Setting Up Local Environment (`.env`)

Configure your environment variables in your server root:

```ini title=".env"
# eSewa Sandbox
ESEWA_PRODUCT_CODE="EPAYTEST"
ESEWA_SECRET_KEY="8gBm/:&EnhH.1/q"
ESEWA_SUCCESS_URL="http://localhost:3000/api/payment/callback/esewa"
ESEWA_FAILURE_URL="http://localhost:3000/api/payment/callback/esewa"
ESEWA_ENV="sandbox"

# Khalti Sandbox (Obtain keys from https://test-admin.khalti.com/#/join/merchant)
KHALTI_SECRET_KEY="your-khalti-sandbox-secret-key"
KHALTI_PUBLIC_KEY="your-khalti-sandbox-public-key"
KHALTI_WEBSITE_URL="http://localhost:3000"
KHALTI_RETURN_URL="http://localhost:3000/api/payment/callback/khalti"
KHALTI_ENV="sandbox"

# Fonepay Sandbox / Local Mock
FONEPAY_MERCHANT_CODE="FONEPAYTEST"
FONEPAY_SECRET_KEY="fonepay_secret_key"
FONEPAY_RETURN_URL="http://localhost:3000/api/payment/callback/fonepay"
FONEPAY_IS_SANDBOX="true"
```

---

## 3. Running SDK Automated Tests

`nepay` comes with two test suites:

### Offline Unit Tests
Tests schema validation, HMAC signature computation, comma formatting resilience, Fonepay hosted/QR signing, and error handling without making real network calls:

```bash
npm test
```

### Live Sandbox Gateway Tests
Executes real HTTPS requests against official eSewa, Khalti sandbox, and Fonepay gateway servers:

```bash
npm run test:live
```

The live test suite verifies:
1. **Khalti Initiate**: Dispatches a live POST to `https://dev.khalti.com/api/v2/epayment/initiate/` and confirms receipt of a valid `pidx` and checkout URL.
2. **Khalti Lookup**: Calls `https://dev.khalti.com/api/v2/epayment/lookup/` with the generated `pidx` and asserts status is `"Initiated"` or `"Pending"`.
3. **eSewa Signature**: Formats form parameters and calculates HMAC-SHA256 signatures according to ePay v2 requirements.
4. **eSewa Status Query**: Invokes `https://rc.esewa.com.np/api/epay/transaction/status/` and validates gateway connectivity.
5. **Fonepay Hosted Initiate**: Generates signed hosted URLs and verifies HMAC-SHA512 checksum integrity.
6. **Fonepay Dynamic QR Mock Simulation**: Validates EMVCo QR code string generation with currency `524` (NPR) and formatted amount.
7. **Fonepay Live Connectivity**: Verifies HTTPS connectivity to Fonepay gateway endpoints.
8. **Amount Tampering Defense**: Asserts that `verifyPayment()` rejects transactions when the expected amount does not match the gateway record.
