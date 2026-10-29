# Contributing to Nepay

Thank you for your interest in contributing to **Nepay**! We welcome contributions ranging from reporting bugs and writing documentation to proposing new gateway adapters and improving developer ergonomics.

This document outlines the guidelines, architecture conventions, and setup instructions to ensure a seamless contribution process.

---

## Code of Conduct

We are committed to providing a friendly, safe, and welcoming environment for all contributors. Please be respectful, constructive, and collaborative in all discussions and pull requests.

---

## Getting Started

### Prerequisites

- **Node.js**: `>= 18.0.0`
- **npm**: `>= 9.0.0` (or `pnpm` / `bun`)
- **Git**

### Clone & Install

```bash
# 1. Clone the repository
git clone https://github.com/bivekk51/nepay.git
cd nepay

# 2. Install dependencies
npm install

# 3. Configure environment variables for sandbox testing
cp .env.example .env
```

---

## Development Workflow

### Available Scripts

| Command | Description |
|---|---|
| `npm run build` | Builds dual ESM (`dist/index.js`) and CJS (`dist/index.cjs`) with TypeScript declaration files via `tsup`. |
| `npm run typecheck` | Runs TypeScript compiler checks (`tsc --noEmit`). |
| `npm test` | Runs offline unit test suite with mocked network calls via `vitest`. |
| `npm run test:live` | Runs live end-to-end integration tests against eSewa UAT and Khalti sandbox. |
| `npm run docs:dev` | Launches the Astro Starlight documentation site locally at `http://localhost:4321`. |
| `npm run docs:build` | Builds production static assets for the documentation site. |

---

## Architectural Principles & Standards

When submitting bug fixes or adding new gateways (e.g. FonePay, ConnectIPS), all code must strictly follow these core invariants:

### 1. Integer Paisa Arithmetic (`amountPaisa`)
- **Rule**: Float money does not exist in `nepay`'s public API.
- All monetary amounts passed into or returned from the SDK must be integer paisa (`1 NPR = 100 Paisa`).
- Use the built-in helper functions from `src/money.ts` (`nprToPaisa`, `paisaToRupeesString`, `parseAmountToPaisa`) for formatting and parsing.

### 2. Zero Browser / Client Credential Leaks
- **Rule**: Secrets (`secretKey`, merchant secrets, private keys) must remain server-only.
- Never write code that exports secrets into client-accessible bundles or browser query strings.
- Never log raw secrets or sensitive authorization headers in error messages.

### 3. Mandatory Server-to-Server (S2S) Verification
- **Rule**: Never trust client-side return redirects alone.
- `verifyPayment()` must always query the gateway's server endpoint directly to verify transaction status before resolving `status: "completed"`.

### 4. Discriminated Union API Surface
- Functions must conform to the unified entrypoints:
  ```ts
  initiatePayment({ method: "esewa" | "khalti" | "...", config, order })
  verifyPayment({ method: "esewa" | "khalti" | "...", config, ... })
  ```
- Use Zod schemas to validate inputs at runtime and discriminate return types with complete TypeScript intellisense.

---

## Submitting a Pull Request (PR)

1. **Create a Feature Branch**:
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/issue-description
   ```

2. **Commit Conventions**:
   Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat(gateway)`: A new gateway adapter or feature
   - `fix(esewa)`: A bug fix for a specific gateway
   - `docs`: Documentation updates or additions
   - `test`: Adding or improving tests
   - `refactor`: Code improvements without behavior changes

3. **Verify Before Pushing**:
   Ensure all checks pass cleanly before opening a pull request:
   ```bash
   npm run typecheck
   npm test
   npm run build
   npm run docs:build
   ```

4. **Open a PR**:
   - Provide a clear summary of what was added or fixed.
   - Reference any related issues (e.g., `Fixes #12`).
   - Include reproduction steps or test coverage.

---

## Community & Questions

- **Bug Reports & Feature Requests**: [GitHub Issues](https://github.com/bivekk51/nepay/issues)
- **Live Documentation**: [https://nepay.nepalbivek.com.np/](https://nepay.nepalbivek.com.np/)
