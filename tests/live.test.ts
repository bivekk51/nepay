import { describe, it, expect, beforeAll } from "vitest";
import {
  initiatePayment,
  verifyPayment,
  initiateKhalti,
  lookupKhalti,
  verifyKhaltiPayment,
  getKhaltiCheckoutUrl,
  buildEsewaFields,
  checkEpayStatus,
  signEpayV2,
  verifyEsewaPayment,
  type KhaltiConfig,
  type EsewaConfig,
  type FonepayConfig,
} from "../src/index.js";

// Load environment variables (Vitest automatically loads .env)
const khaltiSecret = process.env.KHALTI_SECRET_KEY || "";
const khaltiPublic = process.env.KHALTI_PUBLIC_KEY || "";
const esewaProductCode = process.env.ESEWA_PRODUCT_CODE || "EPAYTEST";
const esewaSecret = process.env.ESEWA_SECRET_KEY || "8gBm/:&EnhH.1/q";

const khaltiConfig: KhaltiConfig = {
  secretKey: khaltiSecret,
  publicKey: khaltiPublic,
  websiteUrl: process.env.KHALTI_WEBSITE_URL || "https://example.com",
  returnUrl: process.env.KHALTI_RETURN_URL || "https://example.com/payments/khalti/return",
  env: "sandbox",
};

const esewaConfig: EsewaConfig = {
  productCode: esewaProductCode,
  secretKey: esewaSecret,
  successUrl: process.env.ESEWA_SUCCESS_URL || "https://example.com/payments/esewa/callback",
  failureUrl: process.env.ESEWA_FAILURE_URL || "https://example.com/payments/esewa/callback",
  env: "sandbox",
};

describe("Live Sandbox Integration Tests", { timeout: 20000 }, () => {
  describe("Khalti Sandbox End-to-End", () => {
    let generatedPidx = "";
    const testOrderId = `LIVE-TEST-${Date.now()}`;
    const amountPaisa = 1000; // Rs 10

    it("successfully initiates a live payment on Khalti sandbox", async () => {
      const result = await initiatePayment({
        method: "khalti",
        config: khaltiConfig,
        order: {
          purchaseOrderId: testOrderId,
          purchaseOrderName: "Automated Live Test Order",
          amountPaisa,
          customerInfo: {
            name: "Test User",
            email: "test@example.com",
            phone: "9800000000",
          },
        },
      });

      expect("pidx" in result).toBe(true);
      if (!("pidx" in result)) throw new Error("Expected Khalti initiation result");

      expect(typeof result.pidx).toBe("string");
      expect(result.pidx.length).toBeGreaterThan(5);
      expect(result.payment_url).toContain("https://test-pay.khalti.com/?pidx=");
      expect(result.expires_in).toBeGreaterThan(0);
      expect(result.expires_at).toBeDefined();

      generatedPidx = result.pidx;
    });

    it("successfully performs live server-to-server lookup on the initiated pidx", async () => {
      expect(generatedPidx).toBeTruthy();

      const lookup = await lookupKhalti({
        config: khaltiConfig,
        pidx: generatedPidx,
      });

      expect(lookup.pidx).toBe(generatedPidx);
      expect(lookup.total_amount).toBe(amountPaisa);
      // Fresh transaction should be Pending or Initiated
      expect(["Pending", "Initiated"]).toContain(lookup.status);
      expect(lookup.raw).toBeDefined();
    });

    it("correctly normalizes live pending Khalti transaction via verifyPayment", async () => {
      expect(generatedPidx).toBeTruthy();

      const result = await verifyPayment({
        method: "khalti",
        config: khaltiConfig,
        pidx: generatedPidx,
        expectedAmountPaisa: amountPaisa,
        expectedOrderId: testOrderId,
      });

      expect(result.status).toBe("pending");
      expect(result.amountPaisa).toBe(amountPaisa);
      expect(result.orderId).toBe(testOrderId);
    });

    it("fails verification if expected amount does not match live amount", async () => {
      expect(generatedPidx).toBeTruthy();

      const result = await verifyPayment({
        method: "khalti",
        config: khaltiConfig,
        pidx: generatedPidx,
        expectedAmountPaisa: 99999, // Mismatched amount
      });

      expect(result.status).toBe("failed");
    });

    it("initiates live transaction with banking modes and constructs direct channel checkout URLs", async () => {
      const result = await initiatePayment({
        method: "khalti",
        config: khaltiConfig,
        order: {
          purchaseOrderId: `MODES-${Date.now()}`,
          purchaseOrderName: "Direct Banking Test",
          amountPaisa: 1500, // Rs 15
          modes: ["MOBILE_BANKING", "CONNECT_IPS", "KHALTI"],
        },
      });

      expect("pidx" in result).toBe(true);
      if ("pidx" in result) {
        expect(result.pidx).toBeTruthy();
        expect(result.payment_url).toContain("https://test-pay.khalti.com/");

        // Direct Mobile Banking checkout link
        const mobankUrl = getKhaltiCheckoutUrl(result.payment_url, "mobank");
        expect(mobankUrl).toBe(`https://test-pay.khalti.com/mobank?pidx=${result.pidx}`);

        // Direct ConnectIPS checkout link
        const cipsUrl = getKhaltiCheckoutUrl(result.payment_url, "cips");
        expect(cipsUrl).toBe(`https://test-pay.khalti.com/cips?pidx=${result.pidx}`);

        // Direct Wallet checkout link
        const walletUrl = getKhaltiCheckoutUrl(result.payment_url, "wallet");
        expect(walletUrl).toBe(`https://test-pay.khalti.com/wallet?pidx=${result.pidx}`);

        // Construct from raw pidx with sandbox env
        const directFromPidx = getKhaltiCheckoutUrl(result.pidx, "mobank", { env: "sandbox" });
        expect(directFromPidx).toBe(`https://test-pay.khalti.com/mobank?pidx=${result.pidx}`);
      }
    });
  });

  describe("eSewa UAT / Sandbox End-to-End", () => {
    const testOrderId = `ESEWA-${Date.now()}`;
    const amountPaisa = 10000; // Rs 100

    it("builds valid form parameters and signature for eSewa sandbox", async () => {
      const initiated = await initiatePayment({
        method: "esewa",
        config: esewaConfig,
        order: {
          orderId: testOrderId,
          amountPaisa,
        },
      });

      expect("url" in initiated).toBe(true);
      if (!("url" in initiated)) throw new Error("Expected eSewa initiation result");

      expect(initiated.url).toBe("https://rc-epay.esewa.com.np/api/epay/main/v2/form");
      expect(initiated.fields.product_code).toBe("EPAYTEST");
      expect(initiated.fields.total_amount).toBe("100");
      expect(initiated.fields.transaction_uuid).toBe(testOrderId);
      expect(initiated.fields.signature).toBeDefined();
    });

    it("queries live eSewa status check endpoint and receives valid gateway response", async () => {
      const statusRes = await checkEpayStatus({
        env: "sandbox",
        product_code: esewaConfig.productCode,
        total_amount: "100",
        transaction_uuid: testOrderId,
      });

      // An uncompleted transaction should return NOT_FOUND or similar from live eSewa
      expect(statusRes.status).toBe("NOT_FOUND");
      expect(statusRes.ref_id).toBeNull();
      expect(statusRes.raw).toBeDefined();
    });

    it("verifies and fails an uncompleted transaction through verifyPayment with live status check", async () => {
      // Construct a validly signed callback payload for an uncompleted transaction
      const payload = {
        total_amount: "100",
        transaction_uuid: testOrderId,
        product_code: esewaConfig.productCode,
        signed_field_names: "total_amount,transaction_uuid,product_code",
        signature: signEpayV2(
          {
            total_amount: "100",
            transaction_uuid: testOrderId,
            product_code: esewaConfig.productCode,
          },
          esewaConfig.secretKey
        ),
      };
      const callbackData = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");

      const result = await verifyPayment({
        method: "esewa",
        config: esewaConfig,
        data: callbackData,
        expectedOrderId: testOrderId,
        expectedAmountPaisa: amountPaisa,
      });

      // Because the live status check returns NOT_FOUND, it normalizes to 'failed'
      expect(result.status).toBe("failed");
      expect(result.orderId).toBe(testOrderId);
      expect(result.amountPaisa).toBe(amountPaisa);
    });
  });

  describe("Fonepay Integration End-to-End", () => {
    const fonepayMerchantCode = process.env.FONEPAY_MERCHANT_CODE || "FONEPAYTEST";
    const fonepaySecret = process.env.FONEPAY_SECRET_KEY || "test_secret_key_1234567890";
    const isLiveCreds = Boolean(process.env.FONEPAY_MERCHANT_CODE && process.env.FONEPAY_SECRET_KEY);

    const fonepayConfig: FonepayConfig = {
      merchantCode: fonepayMerchantCode,
      secretKey: fonepaySecret,
      returnUrl: "https://example.com/payments/fonepay/callback",
      isSandbox: !isLiveCreds,
    };

    const fpOrderId = `LIVE-FP-${Date.now()}`;
    const fpAmountPaisa = 1000; // Rs 10

    it("successfully generates signed Hosted Web Checkout URL via unified initiatePayment", async () => {
      const res = await initiatePayment({
        method: "fonepay",
        config: fonepayConfig,
        order: {
          orderId: fpOrderId,
          amountPaisa: fpAmountPaisa,
          remarks1: "Fonepay Live Test",
        },
      });

      expect("flow" in res && res.flow === "hosted").toBe(true);
      if ("flow" in res && res.flow === "hosted") {
        expect(res.payment_url).toContain("PRN=" + fpOrderId);
        expect(res.payment_url).toContain("PID=" + fonepayConfig.merchantCode);
        expect(res.payment_url).toContain("DV=");
      }
    });

    it("successfully initiates Dynamic QR flow via unified initiatePayment", async () => {
      const res = await initiatePayment({
        method: "fonepay",
        config: fonepayConfig,
        flow: "qr",
        order: {
          orderId: fpOrderId,
          amountPaisa: fpAmountPaisa,
          remarks1: "Fonepay QR Test",
        },
      });

      expect("flow" in res && res.flow === "qr").toBe(true);
      if ("flow" in res && res.flow === "qr") {
        expect(res.prn).toBe(fpOrderId);
        expect(typeof res.qr_message).toBe("string");
        expect(res.qr_message.length).toBeGreaterThan(20);
      }
    });

    it("verifies Fonepay transaction through unified verifyPayment", async () => {
      const result = await verifyPayment({
        method: "fonepay",
        config: fonepayConfig,
        orderId: fpOrderId,
        expectedAmountPaisa: fpAmountPaisa,
        callbackData: {
          prn: fpOrderId,
          uid: `UID-${fpOrderId}`,
          bid: "BID-TEST-001",
          p_amt: "10.00",
        },
      });

      if (!isLiveCreds) {
        expect(result.status).toBe("completed");
        expect(result.amountPaisa).toBe(fpAmountPaisa);
        expect(result.orderId).toBe(fpOrderId);
      }
    });
  });
});
