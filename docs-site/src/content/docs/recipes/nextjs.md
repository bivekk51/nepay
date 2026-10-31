---
title: Next.js Payment Gateway Integration (eSewa, Khalti & Fonepay)
description: Accept eSewa, Khalti, and Fonepay payments in Next.js 14+ using Server Actions and Route Handlers with zero client-side credential leaks.
---

Next.js Server Actions and Route Handlers allow you to run backend code directly from your UI components while ensuring secret keys never leave the server.

This recipe covers:
1. Server Actions for initiating eSewa (form fields), Khalti (hosted URL), and Fonepay (Hosted redirect & Dynamic QR).
2. Server Actions for verifying Khalti and polling Fonepay dynamic QR.
3. App Router Route Handlers for eSewa (GET/POST) and Fonepay (GET) redirect callbacks.
4. Client-side Dynamic QR modal component with auto-polling.

---

## Server Actions Example

```ts title="app/actions/payments.ts"
"use server";

import {
  initiatePayment,
  verifyPayment,
  type EsewaConfig,
  type KhaltiConfig,
  type FonepayConfig,
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

const fonepayConfig: FonepayConfig = {
  // Use "FONEPAYTEST" for instant mock mode without waiting for bank onboarding
  merchantCode: process.env.FONEPAY_MERCHANT_CODE ?? "FONEPAYTEST",
  secretKey: process.env.FONEPAY_SECRET_KEY ?? "fonepay_secret_key",
  returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/fonepay/callback`,
  isSandbox: process.env.NODE_ENV !== "production",
};

// 1. Start eSewa
export async function createEsewaCheckout(orderId: string, amountPaisa: number) {
  const result = await initiatePayment({
    method: "esewa",
    config: esewaConfig,
    order: { orderId, amountPaisa },
  });

  if (!("url" in result && "fields" in result)) throw new Error("eSewa initiation failed");
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

  if (!("payment_url" in result)) throw new Error("Khalti initiation failed");
  return { paymentUrl: result.payment_url, pidx: result.pidx };
}

// 3. Start Fonepay (Hosted Web Checkout)
export async function createFonepayHostedCheckout(orderId: string, amountPaisa: number) {
  const result = await initiatePayment({
    method: "fonepay",
    flow: "hosted",
    config: fonepayConfig,
    order: {
      orderId,
      amountPaisa,
      remarks1: `Order ${orderId}`,
    },
  });

  if (!("payment_url" in result)) throw new Error("Fonepay hosted initiation failed");
  return { paymentUrl: result.payment_url };
}

// 4. Start Fonepay (Direct Dynamic QR for Modal)
export async function createFonepayQrCheckout(orderId: string, amountPaisa: number) {
  const result = await initiatePayment({
    method: "fonepay",
    flow: "qr",
    config: fonepayConfig,
    order: {
      orderId,
      amountPaisa,
      remarks1: `Order ${orderId}`,
    },
  });

  if (!("qr_message" in result)) throw new Error("Fonepay QR initiation failed");
  return { qrMessage: result.qr_message, prn: result.prn };
}

// 5. Verify Khalti Return
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

// 6. Poll Fonepay Dynamic QR Status
export async function checkFonepayQrStatus(orderId: string, expectedAmountPaisa: number) {
  try {
    const result = await verifyPayment({
      method: "fonepay",
      flow: "qr",
      config: fonepayConfig,
      orderId,
      expectedAmountPaisa,
    });

    if (result.status === "completed") {
      // Fulfil order in database
      return { success: true, status: result.status, traceId: result.traceId };
    }
    return { success: false, status: result.status };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
      config: fonepayConfig,
      prn,
      expectedOrderId: prn,
      expectedAmountPaisa,
    });

    if (result.status === "completed") {
      // Fulfil order in database
      return { success: true, status: result.status, traceId: result.traceId };
    }
    return { success: false, status: result.status };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}
```

---

## App Router Callback Handlers (`route.ts`)

### 1. eSewa Callback Handler

Because eSewa returns via form submission (POST) or query redirect (GET), handle both methods:

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

### 2. Fonepay Hosted Callback Handler

Fonepay redirects back via GET with `PRN`, `BID`, `UID`, and `DV` query parameters:

```ts title="app/checkout/fonepay/callback/route.ts"
import { NextRequest, NextResponse } from "next/server";
import { verifyPayment, type FonepayConfig } from "@bivekkk/nepay";

const fonepayConfig: FonepayConfig = {
  merchantCode: process.env.FONEPAY_MERCHANT_CODE ?? "FONEPAYTEST",
  secretKey: process.env.FONEPAY_SECRET_KEY ?? "fonepay_secret_key",
  returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/fonepay/callback`,
  isSandbox: process.env.NODE_ENV !== "production",
};

export async function GET(req: NextRequest) {
  const prn = req.nextUrl.searchParams.get("PRN");
  const bid = req.nextUrl.searchParams.get("BID");
  const uid = req.nextUrl.searchParams.get("UID");
  const dv = req.nextUrl.searchParams.get("DV");

  if (!prn || !bid || !uid || !dv) {
    return NextResponse.redirect(new URL("/checkout/failed?reason=missing_params", req.url));
  }

  try {
    const result = await verifyPayment({
      method: "fonepay",
      flow: "hosted",
      config: fonepayConfig,
      orderId: prn,
      expectedAmountPaisa: 10000, // Look up expected order amount in DB
      callbackData: { prn, bid, uid, dv },
    });

    if (result.status === "completed") {
      return NextResponse.redirect(new URL(`/checkout/success?ref=${result.traceId}`, req.url));
    }
    return NextResponse.redirect(new URL(`/checkout/failed?reason=${result.status}`, req.url));
  } catch (error) {
    return NextResponse.redirect(new URL("/checkout/failed?reason=verification_failed", req.url));
  }
}
```

---

## Client Component: PayBridge-Style Dynamic QR Modal

For Fonepay Dynamic QR, render the EMVCo string client-side and poll with Server Actions:

```tsx title="components/FonepayQrModal.tsx"
"use client";

import { useEffect, useState } from "react";
import QRCode from "react-qr-code"; // npm install react-qr-code
import { createFonepayQrCheckout, checkFonepayQrStatus } from "@/app/actions/payments";

export function FonepayQrModal({ orderId, amountPaisa }: { orderId: string; amountPaisa: number }) {
  const [qrMessage, setQrMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("loading");

  useEffect(() => {
    // 1. Generate dynamic QR string via server action
    createFonepayQrCheckout(orderId, amountPaisa).then((res) => {
      setQrMessage(res.qrMessage);
      setStatus("pending");
    });
  }, [orderId, amountPaisa]);

  useEffect(() => {
    if (status !== "pending") return;

    // 2. Poll payment status every 3 seconds (PayBridgeNP pattern)
    const interval = setInterval(async () => {
      const res = await checkFonepayQrStatus(orderId, amountPaisa);
      if (res.success && res.status === "completed") {
        setStatus("completed");
        clearInterval(interval);
        window.location.href = `/checkout/success?ref=${res.traceId}`;
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [orderId, amountPaisa, status]);

  if (!qrMessage) return <div>Generating Fonepay QR...</div>;

  return (
    <div className="flex flex-col items-center p-6 border rounded-xl bg-white shadow-lg text-black">
      <h3 className="text-lg font-bold mb-2">Scan & Pay with Any Banking App</h3>
      <p className="text-sm text-gray-500 mb-4">Supported: eSewa, Khalti, Nabil, NIC Asia, Global IME</p>
      
      <div className="p-4 bg-white rounded-lg border">
        <QRCode value={qrMessage} size={220} />
      </div>

      <div className="mt-4 text-sm font-medium animate-pulse text-gray-600">
        Waiting for payment confirmation...
      </div>
    </div>
  );
}
```
