import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { paisaToRupeesString, parseAmountToPaisa } from "./money.js";
import type { PaymentResult } from "./types.js";

export const FONEPAY_BASES = {
  sandbox: {
    hosted: "https://dev-clientapi.fonepay.com/api/merchantRequest",
    hostedVerify: "https://dev-clientapi.fonepay.com/api/merchantRequest/verificationMerchant",
    qr: "https://dev-merchantapi.fonepay.com/api/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrDownload",
    qrStatus: "https://dev-merchantapi.fonepay.com/api/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrGetStatus",
  },
  production: {
    hosted: "https://clientapi.fonepay.com/api/merchantRequest",
    hostedVerify: "https://clientapi.fonepay.com/api/merchantRequest/verificationMerchant",
    qr: "https://merchantapi.fonepay.com/api/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrDownload",
    qrStatus: "https://merchantapi.fonepay.com/api/merchant/merchantDetailsForThirdParty/thirdPartyDynamicQrGetStatus",
  },
} as const;

export const FonepayConfigSchema = z.object({
  merchantCode: z.string().min(1),
  secretKey: z.string().min(1),
  isSandbox: z.boolean().default(false),
  returnUrl: z.string().url().optional(),
  hostedBaseUrl: z.string().url().optional(),
  hostedVerifyBaseUrl: z.string().url().optional(),
  qrBaseUrl: z.string().url().optional(),
  qrStatusBaseUrl: z.string().url().optional(),
});

export type FonepayConfig = z.infer<typeof FonepayConfigSchema>;

export const FonepayFlowSchema = z.enum(["hosted", "qr"]);
export type FonepayFlow = z.infer<typeof FonepayFlowSchema>;

export interface InitiateFonepayHostedOpts {
  config: FonepayConfig;
  orderId: string;
  amountPaisa: number;
  returnUrl?: string;
  remarks1?: string;
  remarks2?: string;
  date?: Date | string;
}

export interface InitiateFonepayQrOpts {
  config: FonepayConfig;
  orderId: string;
  amountPaisa: number;
  remarks1?: string;
  remarks2?: string;
}

export interface InitiateFonepayOpts {
  config: FonepayConfig;
  orderId: string;
  amountPaisa: number;
  flow?: FonepayFlow;
  returnUrl?: string;
  remarks1?: string;
  remarks2?: string;
  date?: Date | string;
}

export interface InitiateFonepayHostedResult {
  flow: "hosted";
  payment_url: string;
  prn: string;
}

export interface InitiateFonepayQrResult {
  flow: "qr";
  qr_message: string;
  prn: string;
  websocket_url?: string;
  expires_in?: number;
}

export type InitiateFonepayResult = InitiateFonepayHostedResult | InitiateFonepayQrResult;

export interface VerifyFonepayPaymentOpts {
  config: FonepayConfig;
  orderId: string;
  expectedAmountPaisa: number;
  flow?: FonepayFlow;
  callbackData?: {
    prn?: string;
    uid?: string;
    bid?: string;
    p_amt?: string | number;
    amt?: string | number;
    dv?: string;
    bc?: string;
    [key: string]: unknown;
  };
}

export function fonepayPaisaToAmount(paisa: number): string {
  return (paisa / 100).toFixed(2);
}

/**
 * Formats a Date object or string into Fonepay's required `MM/DD/YYYY` string format
 * strictly evaluated in the Nepal timezone (Asia/Kathmandu, UTC+5:45).
 */
export function formatFonepayDate(d: Date | string = new Date()): string {
  const dateObj = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dateObj.getTime())) {
    throw new TypeError(`Invalid date supplied to formatFonepayDate: ${JSON.stringify(d)}`);
  }
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kathmandu",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  return formatter.format(dateObj);
}

/**
 * Generates the HMAC-SHA512 Data Validation (DV) hash for Fonepay Web Checkout (Hosted Redirect).
 * Concatenation order: PID,MD,PRN,AMT,CRN,DT,R1,R2,RU
 */
export function generateFonepayHostedSignature(params: {
  pid: string;
  md: string;
  prn: string;
  amt: string;
  crn: string;
  dt: string;
  r1: string;
  r2: string;
  ru: string;
  secret: string;
}): string {
  const raw = `${params.pid},${params.md},${params.prn},${params.amt},${params.crn},${params.dt},${params.r1},${params.r2},${params.ru}`;
  return createHmac("sha512", params.secret).update(raw, "utf8").digest("hex");
}

/**
 * Generates the HMAC-SHA512 Data Validation (DV) hash for Fonepay Web Checkout Verification.
 * Concatenation order: PID,PRN,BID,UID,AMT
 */
export function generateFonepayHostedVerifySignature(params: {
  pid: string;
  prn: string;
  bid: string;
  uid: string;
  amt: string;
  secret: string;
}): string {
  const raw = `${params.pid},${params.prn},${params.bid},${params.uid},${params.amt}`;
  return createHmac("sha512", params.secret).update(raw, "utf8").digest("hex");
}

/**
 * Generates the HMAC-SHA512 Data Validation hash for Fonepay Dynamic QR Download.
 * Concatenation order: amount,prn,merchantCode,remarks1,remarks2
 */
export function generateFonepayQrSignature(params: {
  amount: string;
  prn: string;
  merchantCode: string;
  remarks1: string;
  remarks2: string;
  secret: string;
}): string {
  const raw = `${params.amount},${params.prn},${params.merchantCode},${params.remarks1},${params.remarks2}`;
  return createHmac("sha512", params.secret).update(raw, "utf8").digest("hex");
}

/**
 * Generates the HMAC-SHA512 Data Validation hash for Fonepay Dynamic QR Status Check.
 * Concatenation order: prn,merchantCode
 */
export function generateFonepayQrStatusSignature(params: {
  prn: string;
  merchantCode: string;
  secret: string;
}): string {
  const raw = `${params.prn},${params.merchantCode}`;
  return createHmac("sha512", params.secret).update(raw, "utf8").digest("hex");
}

/**
 * Verifies a received HMAC-SHA512 hex signature in constant time.
 */
export function verifyFonepaySignature(expectedHex: string, receivedHex: string): boolean {
  if (!expectedHex || !receivedHex) return false;
  const a = Buffer.from(expectedHex.toLowerCase(), "utf8");
  const b = Buffer.from(receivedHex.toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Generates the complete Fonepay Web Checkout redirect URL.
 */
export function generateFonepayHostedUrl(opts: InitiateFonepayHostedOpts): {
  url: string;
  params: Record<string, string>;
} {
  const config = FonepayConfigSchema.parse(opts.config);
  const ru = opts.returnUrl || config.returnUrl;
  if (!ru) {
    throw new Error(
      "Fonepay Hosted checkout requires a returnUrl in either config or order initiation options."
    );
  }

  const pid = config.merchantCode;
  const md = "P";
  const prn = opts.orderId;
  const amt = fonepayPaisaToAmount(opts.amountPaisa);
  const crn = "NPR";
  const dt = typeof opts.date === "string" ? opts.date : formatFonepayDate(opts.date);
  const r1 = opts.remarks1 || "Order Payment";
  const r2 = opts.remarks2 || "N/A";

  const dv = generateFonepayHostedSignature({
    pid,
    md,
    prn,
    amt,
    crn,
    dt,
    r1,
    r2,
    ru,
    secret: config.secretKey,
  });

  const params: Record<string, string> = {
    PID: pid,
    MD: md,
    PRN: prn,
    AMT: amt,
    CRN: crn,
    DT: dt,
    R1: r1,
    R2: r2,
    RU: ru,
    DV: dv,
  };

  const base =
    config.hostedBaseUrl ||
    (config.isSandbox ? FONEPAY_BASES.sandbox.hosted : FONEPAY_BASES.production.hosted);

  const query = new URLSearchParams(params).toString();
  return {
    url: `${base}?${query}`,
    params,
  };
}

/**
 * Generates an EMVCo-compliant dynamic QR payload string for offline mock testing.
 */
function generateMockEmvcoQr(merchantCode: string, prn: string, amountRupees: string): string {
  // EMVCo QR format structure: ID(2) + Length(2) + Value
  const tag00 = "000201"; // Format Indicator
  const tag01 = "010212"; // Dynamic QR Point of Initiation (12 = dynamic)
  const tag26 = `26${String(merchantCode.length + 4).padStart(2, "0")}0002NP${merchantCode}`; // Merchant Account Info
  const tag52 = "52045411"; // Merchant Category Code
  const tag53 = "5303524"; // Currency NPR (524)
  const tag54 = `54${String(amountRupees.length).padStart(2, "0")}${amountRupees}`; // Transaction Amount
  const tag58 = "5802NP"; // Country Code
  const tag59 = `59${String(merchantCode.length).padStart(2, "0")}${merchantCode}`; // Merchant Name
  const tag60 = "6009Kathmandu"; // City
  const tag62 = `62${String(prn.length + 4).padStart(2, "0")}01${String(prn.length).padStart(2, "0")}${prn}`; // Invoice/PRN
  return `${tag00}${tag01}${tag26}${tag52}${tag53}${tag54}${tag58}${tag59}${tag60}${tag62}6304MOCK`;
}

/**
 * Initiates a Fonepay payment in either Hosted Web Checkout or Direct Dynamic QR flow.
 */
export async function initiateFonepay(opts: InitiateFonepayOpts): Promise<InitiateFonepayResult> {
  const config = FonepayConfigSchema.parse(opts.config);
  if (!Number.isInteger(opts.amountPaisa) || opts.amountPaisa <= 0) {
    throw new RangeError(
      `Invalid amountPaisa ${JSON.stringify(opts.amountPaisa)}: must be a positive integer in paisa.`
    );
  }

  const flow = opts.flow || "hosted";

  if (flow === "hosted") {
    const { url } = generateFonepayHostedUrl({
      config,
      orderId: opts.orderId,
      amountPaisa: opts.amountPaisa,
      returnUrl: opts.returnUrl,
      remarks1: opts.remarks1,
      remarks2: opts.remarks2,
      date: opts.date,
    });
    return {
      flow: "hosted",
      payment_url: url,
      prn: opts.orderId,
    };
  }

  // Dynamic QR flow
  const amountStr = fonepayPaisaToAmount(opts.amountPaisa);
  const remarks1 = opts.remarks1 || "Payment";
  const remarks2 = opts.remarks2 || "N/A";

  const dataValidation = generateFonepayQrSignature({
    amount: amountStr,
    prn: opts.orderId,
    merchantCode: config.merchantCode,
    remarks1,
    remarks2,
    secret: config.secretKey,
  });

  const qrEndpoint =
    config.qrBaseUrl ||
    (config.isSandbox ? FONEPAY_BASES.sandbox.qr : FONEPAY_BASES.production.qr);

  // If in sandbox mode with mock test credentials, return deterministic EMVCo QR
  if (config.isSandbox && config.merchantCode === "FONEPAYTEST") {
    return {
      flow: "qr",
      qr_message: generateMockEmvcoQr(config.merchantCode, opts.orderId, amountStr),
      prn: opts.orderId,
      websocket_url: "wss://dev-merchantapi.fonepay.com/ws/" + encodeURIComponent(opts.orderId),
      expires_in: 900,
    };
  }

  const payload = {
    amount: parseFloat(amountStr),
    prn: opts.orderId,
    merchantCode: config.merchantCode,
    remarks1,
    remarks2,
    dataValidation,
  };

  const res = await fetch(qrEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fonepay QR download failed with HTTP ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    qrMessage?: string;
    qrPayload?: string;
    thirdpartyQrWebSocketUrl?: string;
    websocketUrl?: string;
    status?: string | boolean;
    expiresIn?: number;
  };

  const qrString = data.qrMessage || data.qrPayload;
  if (!qrString) {
    throw new Error(
      `Fonepay QR response did not contain qrMessage or qrPayload: ${JSON.stringify(data)}`
    );
  }

  return {
    flow: "qr",
    qr_message: qrString,
    prn: opts.orderId,
    websocket_url: data.thirdpartyQrWebSocketUrl || data.websocketUrl,
    expires_in: data.expiresIn,
  };
}

/**
 * Internal helper to parse Fonepay XML or JSON verification response.
 */
function parseFonepayStatusResponse(text: string): {
  success: boolean;
  statusCode: string;
  message: string;
  traceId: string | null;
  raw: unknown;
} {
  // 1. Try parsing JSON
  try {
    const json = JSON.parse(text);
    const success =
      json.success === true ||
      json.status === "success" ||
      json.status === "successful" ||
      json.paymentStatus === "success" ||
      json.statusCode === "0" ||
      json.responseCode === "0";
    const traceId = json.traceId || json.uid || json.bankRefId || json.uniqueId || null;
    return {
      success,
      statusCode: String(json.statusCode ?? json.responseCode ?? (success ? "0" : "1")),
      message: String(json.message ?? json.responseMessage ?? ""),
      traceId,
      raw: json,
    };
  } catch {
    // 2. Parse XML via regex
    const successMatch = text.match(/<success>(.*?)<\/success>/i);
    const statusMatch =
      text.match(/<statusCode>(.*?)<\/statusCode>/i) ||
      text.match(/<status>(.*?)<\/status>/i);
    const msgMatch = text.match(/<message>(.*?)<\/message>/i);
    const uidMatch =
      text.match(/<uniqueId>(.*?)<\/uniqueId>/i) ||
      text.match(/<uid>(.*?)<\/uid>/i) ||
      text.match(/<traceId>(.*?)<\/traceId>/i);

    const isSuccess = successMatch
      ? successMatch[1].trim().toLowerCase() === "true"
      : statusMatch
        ? statusMatch[1].trim() === "0"
        : false;

    return {
      success: isSuccess,
      statusCode: statusMatch ? statusMatch[1].trim() : isSuccess ? "0" : "1",
      message: msgMatch ? msgMatch[1].trim() : "",
      traceId: uidMatch ? uidMatch[1].trim() : null,
      raw: text,
    };
  }
}

/**
 * Verifies a Fonepay payment (either from Hosted Web Checkout return or Direct Dynamic QR polling).
 */
export async function verifyFonepayPayment(
  opts: VerifyFonepayPaymentOpts
): Promise<PaymentResult> {
  const config = FonepayConfigSchema.parse(opts.config);
  if (!Number.isInteger(opts.expectedAmountPaisa) || opts.expectedAmountPaisa <= 0) {
    throw new RangeError(
      `Invalid expectedAmountPaisa ${JSON.stringify(opts.expectedAmountPaisa)}: must be a positive integer in paisa.`
    );
  }

  const isHosted =
    opts.flow === "hosted" ||
    Boolean(opts.callbackData?.uid || opts.callbackData?.bid || opts.callbackData?.UID);

  // Mock sandbox shortcut for test credentials without live bank backend
  if (config.isSandbox && config.merchantCode === "FONEPAYTEST") {
    const traceId = opts.callbackData?.uid
      ? String(opts.callbackData.uid)
      : `MOCK-FP-${opts.orderId}`;
    return {
      status: "completed",
      amountPaisa: opts.expectedAmountPaisa,
      orderId: opts.orderId,
      traceId,
      raw: { mock: true, orderId: opts.orderId, amountPaisa: opts.expectedAmountPaisa },
    };
  }

  if (isHosted) {
    // 1. Verify Hosted Web Checkout via verificationMerchant S2S endpoint
    const cb = opts.callbackData || {};
    const uid = String(cb.uid || cb.UID || "");
    const bid = String(cb.bid || cb.BID || "");
    const prn = String(cb.prn || cb.PRN || opts.orderId);
    const amtStr = cb.p_amt || cb.amt || cb.P_AMT || cb.AMT || paisaToRupeesString(opts.expectedAmountPaisa);
    const amt = String(amtStr);

    if (prn !== opts.orderId) {
      return {
        status: "failed",
        amountPaisa: 0,
        orderId: opts.orderId,
        traceId: uid || null,
        raw: { error: "Order ID mismatch", receivedPrn: prn, expectedOrderId: opts.orderId },
      };
    }

    // Verify callback DV signature if present
    if (cb.dv || cb.DV) {
      const receivedDv = String(cb.dv || cb.DV);
      const expectedDv = generateFonepayHostedVerifySignature({
        pid: config.merchantCode,
        prn,
        bid,
        uid,
        amt,
        secret: config.secretKey,
      });
      if (!verifyFonepaySignature(expectedDv, receivedDv)) {
        return {
          status: "failed",
          amountPaisa: 0,
          orderId: opts.orderId,
          traceId: uid || null,
          raw: { error: "Callback signature verification failed", receivedDv, expectedDv },
        };
      }
    }

    const dv = generateFonepayHostedVerifySignature({
      pid: config.merchantCode,
      prn,
      bid,
      uid,
      amt,
      secret: config.secretKey,
    });

    const verifyEndpoint =
      config.hostedVerifyBaseUrl ||
      (config.isSandbox
        ? FONEPAY_BASES.sandbox.hostedVerify
        : FONEPAY_BASES.production.hostedVerify);

    const query = new URLSearchParams({
      PID: config.merchantCode,
      PRN: prn,
      BID: bid,
      UID: uid,
      AMT: amt,
      DV: dv,
    }).toString();

    const res = await fetch(`${verifyEndpoint}?${query}`, {
      method: "GET",
      headers: { Accept: "application/xml, application/json, text/plain" },
    });

    const bodyText = await res.text();
    const parsed = parseFonepayStatusResponse(bodyText);

    if (parsed.success) {
      const returnedPaisa = parseAmountToPaisa(amt);
      if (returnedPaisa !== opts.expectedAmountPaisa) {
        return {
          status: "failed",
          amountPaisa: returnedPaisa,
          orderId: opts.orderId,
          traceId: uid || parsed.traceId,
          raw: {
            error: "Amount mismatch",
            expectedAmountPaisa: opts.expectedAmountPaisa,
            receivedAmountPaisa: returnedPaisa,
            gatewayResponse: parsed.raw,
          },
        };
      }
      return {
        status: "completed",
        amountPaisa: returnedPaisa,
        orderId: opts.orderId,
        traceId: uid || parsed.traceId,
        raw: parsed.raw,
      };
    }

    return {
      status: "failed",
      amountPaisa: 0,
      orderId: opts.orderId,
      traceId: uid || parsed.traceId,
      raw: parsed.raw,
    };
  }

  // 2. Verify Dynamic QR flow via thirdPartyDynamicQrGetStatus endpoint
  const statusEndpoint =
    config.qrStatusBaseUrl ||
    (config.isSandbox ? FONEPAY_BASES.sandbox.qrStatus : FONEPAY_BASES.production.qrStatus);

  const dataValidation = generateFonepayQrStatusSignature({
    prn: opts.orderId,
    merchantCode: config.merchantCode,
    secret: config.secretKey,
  });

  const res = await fetch(statusEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      merchantCode: config.merchantCode,
      prn: opts.orderId,
      dataValidation,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      status: "failed",
      amountPaisa: 0,
      orderId: opts.orderId,
      traceId: null,
      raw: { httpStatus: res.status, body: text },
    };
  }

  const json = (await res.json()) as {
    paymentStatus?: string;
    status?: string;
    traceId?: string;
    bankRefId?: string;
    amount?: number | string;
    [key: string]: unknown;
  };

  const statusStr = String(json.paymentStatus || json.status || "").toLowerCase();
  const traceId = json.traceId || json.bankRefId ? String(json.traceId || json.bankRefId) : null;

  if (statusStr === "success" || statusStr === "completed" || statusStr === "successful") {
    const paidPaisa = json.amount
      ? parseAmountToPaisa(String(json.amount))
      : opts.expectedAmountPaisa;

    if (paidPaisa !== opts.expectedAmountPaisa) {
      return {
        status: "failed",
        amountPaisa: paidPaisa,
        orderId: opts.orderId,
        traceId,
        raw: {
          error: "Amount mismatch",
          expectedAmountPaisa: opts.expectedAmountPaisa,
          receivedAmountPaisa: paidPaisa,
          gatewayResponse: json,
        },
      };
    }

    return {
      status: "completed",
      amountPaisa: paidPaisa,
      orderId: opts.orderId,
      traceId,
      raw: json,
    };
  }

  if (statusStr === "pending" || statusStr === "in_progress" || statusStr === "processing") {
    return {
      status: "pending",
      amountPaisa: 0,
      orderId: opts.orderId,
      traceId,
      raw: json,
    };
  }

  return {
    status: "failed",
    amountPaisa: 0,
    orderId: opts.orderId,
    traceId,
    raw: json,
  };
}
