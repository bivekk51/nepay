---
title: Installation & Requirements
description: How to install and set up unified-nepal-payments in your TypeScript or JavaScript project.
---

`unified-nepal-payments` is published to the npm registry as a zero-dependency (other than Zod) core library targeting Node 18+.

## Installation

Install the package using your favorite package manager:

```bash
# npm
npm install unified-nepal-payments

# pnpm
pnpm add unified-nepal-payments

# yarn
yarn add unified-nepal-payments

# bun
bun add unified-nepal-payments
```

## Runtime Requirements

- **Node.js**: `>= 18.0.0` (Uses native Node `fetch` and `node:crypto`).
- **TypeScript**: `>= 5.0.0` recommended for full type inference and union narrowing.
- **Module Systems**: Ships both **ESM** (`import`) and **CommonJS** (`require`) bundles with complete `.d.ts` type definitions.

### TypeScript Configuration

Ensure your `tsconfig.json` has `moduleResolution` configured for modern packages:

```json title="tsconfig.json"
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true
  }
}
```

## Peer Dependencies & Frameworks

The core library does not depend on any specific web framework. You can use it with:
- **Express.js** / **Koa** / **Fastify**
- **Next.js** (App Router, Server Actions, Route Handlers, or Pages API routes)
- **Remix** / **React Router v7**
- **NestJS**
- **Cloudflare Workers / Node.js Serverless** (AWS Lambda, Vercel Functions)

Next, head to the [Quick Start Guide](/getting-started/quickstart/) to initiate your first payment!
