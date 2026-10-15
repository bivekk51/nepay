import { z } from "zod";
import type { PaymentResult } from "./types.js";
import {
  EsewaConfigSchema,
  buildEsewaFields,
  verifyEsewaPayment,
} from "./esewa.js";
import {
  KhaltiConfigSchema,
  initiateKhalti,
  verifyKhaltiPayment,
} from "./khalti.js";

export type { PaymentStatus, PaymentResult } from "./types.js";
export { nprToPaisa, paisaToRupeesString, parseAmountToPaisa } from "./money.js";
export {
  signEpayV2,
  verifyEpayCallback,
  checkEpayStatus,
  EsewaConfigSchema,
  ESEWA_BASES,
  EsewaRetryableError,
  buildEsewaFields,
  verifyEsewaPayment,
} from "./esewa.js";
export {
  KhaltiConfigSchema,
  KHALTI_BASES,
  initiateKhalti,
  lookupKhalti,
  verifyKhaltiPayment,
} from "./khalti.js";

export const EsewaInitiateSchema = z.object({
  method: z.literal("esewa"),
  config: EsewaConfigSchema,
  order: z.object({
    orderId: z.string(),
    amountPaisa: z.number().int(),
    taxPaisa: z.number().int().optional(),
    servicePaisa: z.number().int().optional(),
    deliveryPaisa: z.number().int().optional(),
  }),
});

export const KhaltiInitiateSchema = z.object({
  method: z.literal("khalti"),
  config: KhaltiConfigSchema,
  order: z.object({
    purchaseOrderId: z.string(),
    purchaseOrderName: z.string(),
    amountPaisa: z.number().int(),
    customerInfo: z
      .object({
        name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
      })
      .optional(),
    amountBreakdown: z.array(z.object({ label: z.string(), amount: z.number().int() })).optional(),
    extra: z.record(z.string()).optional(),
  }),
});

export const UnifiedInitiateInput = z.discriminatedUnion("method", [
  EsewaInitiateSchema,
  KhaltiInitiateSchema,
]);
export type UnifiedInitiateInput = z.infer<typeof UnifiedInitiateInput>;

export const EsewaVerifySchema = z.object({
  method: z.literal("esewa"),
  config: EsewaConfigSchema,
  data: z.string(),
  expectedOrderId: z.string(),
  expectedAmountPaisa: z.number().int(),
});

export const KhaltiVerifySchema = z.object({
  method: z.literal("khalti"),
  config: KhaltiConfigSchema,
  pidx: z.string(),
  expectedAmountPaisa: z.number().int(),
  expectedOrderId: z.string().optional(),
});

export const UnifiedVerifyInput = z.discriminatedUnion("method", [
  EsewaVerifySchema,
  KhaltiVerifySchema,
]);
export type UnifiedVerifyInput = z.infer<typeof UnifiedVerifyInput>;

/** Alias covering both initiate and verify shapes; unknown `method` values throw via zod. */
export const UnifiedInput = z.union([UnifiedInitiateInput, UnifiedVerifyInput]);

export async function initiatePayment(input: UnifiedInitiateInput): Promise<
  { url: string; fields: Record<string, string> } | import("./khalti.js").InitiateKhaltiResult
> {
  const parsed = UnifiedInitiateInput.parse(input);
  switch (parsed.method) {
    case "esewa":
      return buildEsewaFields({
        config: parsed.config,
        orderId: parsed.order.orderId,
        amountPaisa: parsed.order.amountPaisa,
        taxPaisa: parsed.order.taxPaisa,
        servicePaisa: parsed.order.servicePaisa,
        deliveryPaisa: parsed.order.deliveryPaisa,
      });
    case "khalti":
      return initiateKhalti({
        config: parsed.config,
        purchaseOrderId: parsed.order.purchaseOrderId,
        purchaseOrderName: parsed.order.purchaseOrderName,
        amountPaisa: parsed.order.amountPaisa,
        customerInfo: parsed.order.customerInfo,
        amountBreakdown: parsed.order.amountBreakdown,
        extra: parsed.order.extra as Record<`merchant_${string}`, string> | undefined,
      });
  }
}

export async function verifyPayment(input: UnifiedVerifyInput): Promise<PaymentResult> {
  const parsed = UnifiedVerifyInput.parse(input);
  switch (parsed.method) {
    case "esewa":
      return verifyEsewaPayment({
        config: parsed.config,
        data: parsed.data,
        expectedOrderId: parsed.expectedOrderId,
        expectedAmountPaisa: parsed.expectedAmountPaisa,
      });
    case "khalti":
      return verifyKhaltiPayment({
        config: parsed.config,
        pidx: parsed.pidx,
        expectedAmountPaisa: parsed.expectedAmountPaisa,
        expectedOrderId: parsed.expectedOrderId,
      });
  }
}
