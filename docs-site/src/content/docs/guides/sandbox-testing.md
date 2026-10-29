---
title: eSewa & Khalti Sandbox Test Credentials
description: Official test credentials, customer test wallets, MPINs, and OTPs for testing eSewa UAT and Khalti sandbox payment flows.
---

Testing digital payment gateways in Nepal requires testing against official staging and sandbox environments before applying for production merchant credentials.

This guide provides official test credentials, wallet phone numbers, test OTPs, and instructions for running the test suite.

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
```

---

## 3. Running SDK Automated Tests

`nepay` comes with two test suites:

### Offline Unit Tests
Tests schema validation, HMAC signature computation, comma formatting resilience, and error handling without making real network calls.

```bash
npm test
```

### Live Sandbox Gateway Tests
Executes real HTTPS requests against official eSewa and Khalti sandbox servers:

```bash
npm run test:live
```

The live test suite verifies:
1. **Khalti Initiate**: Dispatches a live POST to `https://dev.khalti.com/api/v2/epayment/initiate/` and confirms receipt of a valid `pidx` and checkout URL.
2. **Khalti Lookup**: Calls `https://dev.khalti.com/api/v2/epayment/lookup/` with the generated `pidx` and asserts status is `"Initiated"` or `"Pending"`.
3. **eSewa Signature**: Formats form parameters and calculates HMAC-SHA256 signatures according to ePay v2 requirements.
4. **eSewa Status Query**: Invokes `https://rc.esewa.com.np/api/epay/transaction/status/` and validates gateway connectivity.
5. **Amount Tampering Defense**: Asserts that `verifyPayment()` rejects transactions when the expected amount does not match the gateway record.
