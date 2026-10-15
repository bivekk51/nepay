/**
 * Next.js server-action sketch (illustration only — no live calls, no secrets).
 *
 * `secretKey` stays server-only: this module never ships to the browser
 * (server action / route handler), keys come from env vars.
 *
 * NOTE on try/catch: `verifyPayment` THROWS for eSewa (bad signature, order or
 * amount mismatch) and throws for Khalti only on transport/unparseable errors
 * (mismatches come back as `{ status: "failed" }`). Always wrap verify calls
 * in try/catch — the handlers below show the pattern.
 */
"use server";

import { initiatePayment, verifyPayment } from "../src/index.js";

function esewaConfig() {
  return {
    productCode: "EPAYTEST",
    secretKey: process.env.ESEWA_SECRET_KEY ?? "",
    successUrl: "https://example.com/payments/esewa/callback",
    failureUrl: "https://example.com/payments/esewa/callback",
    env: "sandbox" as const,
  };
}

function khaltiConfig() {
  return {
    secretKey: process.env.KHALTI_SECRET_KEY ?? "",
    websiteUrl: "https://example.com",
    returnUrl: "https://example.com/payments/khalti/return",
    env: "sandbox" as const,
  };
}

export async function startEsewaPayment(orderId: string, amountPaisa: number) {
  const initiated = await initiatePayment({
    method: "esewa",
    config: esewaConfig(),
    order: { orderId, amountPaisa },
  });
  if (!("url" in initiated)) {
    throw new Error("unexpected initiate result for method esewa");
  }
  const { url, fields } = initiated;
  return { url, fields };
}

export async function handleEsewaCallback(data: string, orderId: string, amountPaisa: number) {
  try {
    const result = await verifyPayment({
      method: "esewa",
      config: esewaConfig(),
      data,
      expectedOrderId: orderId,
      expectedAmountPaisa: amountPaisa,
    });
    if (result.status === "completed") {
      // TODO: fulfil the order exactly once (idempotent on orderId).
    }
    return { status: result.status };
  } catch (err) {
    // eSewa verify THROWS on invalid signature / order / amount mismatch.
    return { status: "failed" as const, error: (err as Error).message };
  }
}

export async function startKhaltiPayment(orderId: string, orderName: string, amountPaisa: number) {
  const initiated = await initiatePayment({
    method: "khalti",
    config: khaltiConfig(),
    order: { purchaseOrderId: orderId, purchaseOrderName: orderName, amountPaisa },
  });
  if (!("pidx" in initiated)) {
    throw new Error("unexpected initiate result for method khalti");
  }
  const { pidx, payment_url } = initiated;
  return { pidx, payment_url };
}

export async function handleKhaltiReturn(pidx: string, amountPaisa: number) {
  try {
    const result = await verifyPayment({
      method: "khalti",
      config: khaltiConfig(),
      pidx,
      expectedAmountPaisa: amountPaisa,
    });
    if (result.status === "completed") {
      // TODO: fulfil the order exactly once (idempotent on orderId).
    }
    return { status: result.status };
  } catch (err) {
    // Khalti verify throws only on transport/unparseable errors.
    return { status: "failed" as const, error: (err as Error).message };
  }
}
