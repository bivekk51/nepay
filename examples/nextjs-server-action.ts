/**
 * Next.js server-action sketch (illustration only — no live calls, no secrets).
 *
 * `secretKey` stays server-only: this module never ships to the browser
 * (server action / route handler), keys come from env vars.
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
  const { url, fields } = (await initiatePayment({
    method: "esewa",
    config: esewaConfig(),
    order: { orderId, amountPaisa },
  })) as { url: string; fields: Record<string, string> };
  return { url, fields };
}

export async function handleEsewaCallback(data: string, orderId: string, amountPaisa: number) {
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
}

export async function startKhaltiPayment(orderId: string, orderName: string, amountPaisa: number) {
  const { pidx, payment_url } = (await initiatePayment({
    method: "khalti",
    config: khaltiConfig(),
    order: { purchaseOrderId: orderId, purchaseOrderName: orderName, amountPaisa },
  })) as { pidx: string; payment_url: string };
  return { pidx, payment_url };
}

export async function handleKhaltiReturn(pidx: string, amountPaisa: number) {
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
}
