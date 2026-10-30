# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-10-30

### Added
- **Khalti Multi-Channel Payment Modes**:
  - Support for `modes: KhaltiPaymentMode[]` in `initiatePayment` and `initiateKhaltiPayment` (`"KHALTI"`, `"EBANKING"`, `"MOBILE_BANKING"`, `"CONNECT_IPS"`, `"SCT"`, `"VISA"`).
  - Pre-filter channels on Khalti hosted checkout or restrict checkouts to specific banking rails.
  - Exported `KhaltiPaymentMode` and `KhaltiPaymentModeSchema`.
- **Khalti Direct Checkout URL Deep-linking**:
  - Added `getKhaltiCheckoutUrl(paymentUrlOrPidx, channel?, opts?)` helper function.
  - Generate direct deep links for Mobile Banking (`/mobank`), ConnectIPS (`/cips`), Internet Banking (`/ebank`), Khalti Wallet (`/wallet`), and Card channels.
  - Supports deep linking to specific bank indices (`/mobank/:bankIdx`) and pre-filling customer mobile numbers (`?mobile=98XXXXXXXX`).
  - Exported `KhaltiCheckoutChannel` and `KhaltiCheckoutChannelSchema`.

### Fixed
- **Documentation Table of Contents (TOC)**:
  - Fixed issue where scrolling to the bottom or clicking the last heading (`Sandbox Testing Credentials`) would fail to highlight or would snap back to preceding sections.
  - Intercepted Starlight custom element prototype setter to prevent narrow 53px slit intersection conflicts during smooth scrolling and reading trailing sections.
  - Added bottom scroll breathing room (`padding-bottom: clamp(14rem, 45vh, 32rem)`) to `.sl-markdown-content` allowing end-of-page headings to scroll comfortably into reading view.

### Documentation
- Updated Khalti Gateway guide with comprehensive Multi-Channel Banking patterns and code examples.
- Updated Quickstart guide with payment modes initiate syntax.
- Added API reference and TypeScript type documentation for `getKhaltiCheckoutUrl`, `KhaltiPaymentMode`, and `KhaltiCheckoutChannel`.

## [0.1.0] - 2026-10-29

### Added
- Unified SDK entry points: `initiatePayment` and `verifyPayment` with Zod discriminated unions on `method: 'esewa' | 'khalti'`.
- Normalized `PaymentResult` with statuses: `completed`, `pending`, `failed`, `expired`, `canceled`.
- **eSewa ePay v2**:
  - `buildEsewaFields` auto-submitting form generator targeting `rc-epay.esewa.com.np` (sandbox) and `epay.esewa.com.np` (production).
  - HMAC-SHA256 signature calculation and constant-time verification.
  - S2S status check query against `rc.esewa.com.np` requiring `COMPLETE` with non-null `ref_id`.
  - Handling for both GET and POST callbacks (`req.query.data ?? req.body.data`).
  - Parsing and stripping of comma-formatted callback amounts like `"1,000.0"`.
  - Retryable error handling for gateway maintenance (`EsewaRetryableError`).
- **Khalti ePayment v2**:
  - Server-to-server initiate via `/epayment/initiate/` targeting `dev.khalti.com` (sandbox) and `khalti.com` (production).
  - Server-to-server lookup via `/epayment/lookup/`.
  - Direct handling for HTTP 400 Expired / User-canceled response bodies.
  - Pre-flight integer paisa validation (minimum 1,000 paisa) and breakdown sum validation.
  - Order ID binding verification.
- Money conversion utilities:
  - `nprToPaisa`: Safe conversion of NPR decimal to integer paisa.
  - `paisaToRupeesString`: Converts integer paisa to boundary rupees string without floating-point artifacts.
  - `parseAmountToPaisa`: Normalizes raw amounts and strings to integer paisa.
- Framework integration examples for Express.js and Next.js App Router (Server Actions).
- Automated live integration tests hitting live eSewa UAT and Khalti Sandbox gateways.
- Documentation website powered by Astro Starlight.
