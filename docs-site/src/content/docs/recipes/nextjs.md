---
title: Next.js eSewa & Khalti Integration
description: Accept eSewa and Khalti payments in Next.js 14+ using Server Actions and Route Handlers with zero client-side credential leaks.
---

Next.js Server Actions allow you to run backend code directly from your UI components while ensuring secret keys never leave the server.

## Server Actions Example

```ts title="app/actions/payments.ts"
"use server";

import {
  initiatePayment,
  verifyPayment,
  type EsewaConfig,
  type KhaltiConfig,
} from "@bivekkk/nepay";

const esewaConfig: EsewaConfig = {
  productCode: process.env.ESEWA_PRODUCT_CODE!,
  secretKey: process.env.ESEWA_SECRET_KEY!,
  successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/esewa/callback`,
  failureUrl: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/esewa/callback`,
  env: "sandbox",
};

const khaltiConfig: KhaltiConfig = {
  secretKey: process.env.KHALTI_SECRET_KEY!,
  websiteUrl: process.env.NEXT_PUBLIC_APP_URL!,
  returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/khalti/return`,
  env: "sandbox",
};

// 1. Start eSewa
export async function createEsewaCheckout(orderId: string, amountPaisa: number) {
  const result = await initiatePayment({
    method: "esewa",
    config: esewaConfig,
    order: { orderId, amountPaisa },
  });

  if (!("url" in result)) throw new Error("eSewa initiation failed");
  return { url: result.url, fields: result.fields };
}

// 2. Start Khalti
export async function createKhaltiCheckout(orderId: string, title: string, amountPaisa: number) {
  const result = await initiatePayment({
    method: "khalti",
    config: khaltiConfig,
    order: {
      purchaseOrderId: orderId,
      purchaseOrderName: title,
      amountPaisa,
    },
  });

  if (!("pidx" in result)) throw new Error("Khalti initiation failed");
  return { paymentUrl: result.payment_url, pidx: result.pidx };
}

// 3. Verify Khalti Return
export async function verifyKhaltiTransaction(pidx: string, expectedAmountPaisa: number, orderId: string) {
  try {
    const result = await verifyPayment({
      method: "khalti",
      config: khaltiConfig,
      pidx,
      expectedAmountPaisa,
      expectedOrderId: orderId,
    });

    if (result.status === "completed") {
      // Fulfil order in database (e.g. Prisma / Drizzle)
      return { success: true, status: result.status, traceId: result.traceId };
    }
    return { success: false, status: result.status };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
```

---

## App Router Callback Handler (`route.ts`)

Because eSewa returns via form submission (POST) or query redirect (GET), a Route Handler in `app/checkout/esewa/callback/route.ts` is ideal:

```ts title="app/checkout/esewa/callback/route.ts"
import { NextRequest, NextResponse } from "next/server";
import { verifyPayment, type EsewaConfig } from "@bivekkk/nepay";

const esewaConfig: EsewaConfig = {
  productCode: process.env.ESEWA_PRODUCT_CODE!,
  secretKey: process.env.ESEWA_SECRET_KEY!,
  successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/esewa/callback`,
  failureUrl: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/esewa/callback`,
  env: "sandbox",
};

async function handleEsewa(req: NextRequest) {
  let data: string | null = req.nextUrl.searchParams.get("data");

  // Read POST body if not in query params
  if (!data && req.method === "POST") {
    try {
      const formData = await req.formData();
      data = formData.get("data") as string | null;
    } catch {
      // not formData
    }
  }

  if (!data) {
    return NextResponse.redirect(new URL("/checkout/failed?reason=missing_data", req.url));
  }

  try {
    // You can retrieve expected order details from your database session
    const expectedOrderId = req.nextUrl.searchParams.get("orderId") ?? "ORDER-101";
    const expectedAmountPaisa = 10000;

    const result = await verifyPayment({
      method: "esewa",
      config: esewaConfig,
      data,
      expectedOrderId,
      expectedAmountPaisa,
    });

    if (result.status === "completed") {
      // Fulfill order in DB
      return NextResponse.redirect(new URL(`/checkout/success?ref=${result.traceId}`, req.url));
    } else {
      return NextResponse.redirect(new URL(`/checkout/pending?status=${result.status}`, req.url));
    }
  } catch (error) {
    return NextResponse.redirect(new URL(`/checkout/failed?error=verification_failed`, req.url));
  }
}

export async function GET(req: NextRequest) {
  return handleEsewa(req);
}

export async function POST(req: NextRequest) {
  return handleEsewa(req);
}
```
