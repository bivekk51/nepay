import { z } from "zod";
import type { PaymentResult } from "./types.js";
import {
  EsewaConfigSchema,
  buildEsewaFields,
  verifyEsewaPayment,
} from "./esewa.js";
import {
  KhaltiConfigSchema,
  KhaltiPaymentModeSchema,
  KhaltiCheckoutChannelSchema,
  initiateKhalti,
  verifyKhaltiPayment,
  getKhaltiCheckoutUrl,
} from "./khalti.js";
import {
  FonepayConfigSchema,
  FonepayFlowSchema,
  initiateFonepay,
  verifyFonepayPayment,
  generateFonepayHostedUrl,
  generateFonepayHostedSignature,
  generateFonepayHostedVerifySignature,
  generateFonepayQrSignature,
  generateFonepayQrStatusSignature,
  verifyFonepaySignature,
  formatFonepayDate,
  FONEPAY_BASES,
} from "./fonepay.js";

export type { PaymentStatus, PaymentResult } from "./types.js";
export type {
  EsewaConfig,
  EpayV2SignParams,
  EpayStatusOpts,
  EpayStatusResult,
  EsewaFieldOpts,
  VerifyEsewaPaymentOpts,
} from "./esewa.js";
export type {
  KhaltiConfig,
  KhaltiAmountBreakdown,
  KhaltiPaymentMode,
  KhaltiCheckoutChannel,
  InitiateKhaltiOpts,
  InitiateKhaltiResult,
  LookupKhaltiOpts,
  LookupKhaltiResult,
  VerifyKhaltiPaymentOpts,
} from "./khalti.js";
export type {
  FonepayConfig,
  FonepayFlow,
  InitiateFonepayHostedOpts,
  InitiateFonepayQrOpts,
  InitiateFonepayOpts,
  InitiateFonepayHostedResult,
  InitiateFonepayQrResult,
  InitiateFonepayResult,
  VerifyFonepayPaymentOpts,
} from "./fonepay.js";

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
  KhaltiPaymentModeSchema,
  KhaltiCheckoutChannelSchema,
  KHALTI_BASES,
  initiateKhalti,
  lookupKhalti,
  verifyKhaltiPayment,
  getKhaltiCheckoutUrl,
} from "./khalti.js";
export {
  FonepayConfigSchema,
  FonepayFlowSchema,
  FONEPAY_BASES,
  initiateFonepay,
  verifyFonepayPayment,
  generateFonepayHostedUrl,
  generateFonepayHostedSignature,
  generateFonepayHostedVerifySignature,
  generateFonepayQrSignature,
  generateFonepayQrStatusSignature,
  verifyFonepaySignature,
  formatFonepayDate,
  fonepayPaisaToAmount,
} from "./fonepay.js";

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
  order: z
    .object({
      orderId: z.string().optional(),
      purchaseOrderId: z.string().optional(),
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
      modes: z.array(KhaltiPaymentModeSchema).optional(),
      extra: z.record(z.string()).optional(),
    })
    .refine((data) => Boolean(data.orderId || data.purchaseOrderId), {
      message: "Either orderId or purchaseOrderId must be provided",
    }),
});

export const FonepayInitiateSchema = z.object({
  method: z.literal("fonepay"),
  config: FonepayConfigSchema,
  flow: FonepayFlowSchema.optional(),
  order: z.object({
    orderId: z.string(),
    amountPaisa: z.number().int(),
    returnUrl: z.string().url().optional(),
    remarks1: z.string().optional(),
    remarks2: z.string().optional(),
    date: z.union([z.date(), z.string()]).optional(),
  }),
});

export const UnifiedInitiateInput = z.discriminatedUnion("method", [
  EsewaInitiateSchema,
  KhaltiInitiateSchema,
  FonepayInitiateSchema,
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

export const FonepayVerifySchema = z.object({
  method: z.literal("fonepay"),
  config: FonepayConfigSchema,
  orderId: z.string(),
  expectedAmountPaisa: z.number().int(),
  flow: FonepayFlowSchema.optional(),
  callbackData: z.record(z.unknown()).optional(),
});

export const UnifiedVerifyInput = z.discriminatedUnion("method", [
  EsewaVerifySchema,
  KhaltiVerifySchema,
  FonepayVerifySchema,
]);
export type UnifiedVerifyInput = z.infer<typeof UnifiedVerifyInput>;

/** Alias covering both initiate and verify shapes; unknown `method` values throw via zod. */
export const UnifiedInput = z.union([UnifiedInitiateInput, UnifiedVerifyInput]);

export async function initiatePayment(input: UnifiedInitiateInput): Promise<
  | { url: string; fields: Record<string, string> }
  | import("./khalti.js").InitiateKhaltiResult
  | import("./fonepay.js").InitiateFonepayResult
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
    case "khalti": {
      const orderId = (parsed.order.purchaseOrderId || parsed.order.orderId)!;
      return initiateKhalti({
        config: parsed.config,
        purchaseOrderId: orderId,
        purchaseOrderName: parsed.order.purchaseOrderName,
        amountPaisa: parsed.order.amountPaisa,
        customerInfo: parsed.order.customerInfo,
        amountBreakdown: parsed.order.amountBreakdown,
        modes: parsed.order.modes,
        extra: parsed.order.extra as Record<`merchant_${string}`, string> | undefined,
      });
    }
    case "fonepay":
      return initiateFonepay({
        config: parsed.config,
        flow: parsed.flow,
        orderId: parsed.order.orderId,
        amountPaisa: parsed.order.amountPaisa,
        returnUrl: parsed.order.returnUrl,
        remarks1: parsed.order.remarks1,
        remarks2: parsed.order.remarks2,
        date: parsed.order.date,
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
    case "fonepay":
      return verifyFonepayPayment({
        config: parsed.config,
        orderId: parsed.orderId,
        expectedAmountPaisa: parsed.expectedAmountPaisa,
        flow: parsed.flow,
        callbackData: parsed.callbackData,
      });
  }
}
