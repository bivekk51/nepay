import { describe, it, expect, vi, afterEach } from "vitest";
import {
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
  type FonepayConfig,
} from "../src/fonepay.js";
import { initiatePayment, verifyPayment } from "../src/index.js";

const testConfig: FonepayConfig = {
  merchantCode: "TEST_MERCHANT_01",
  secretKey: "test_secret_key_1234567890",
  isSandbox: true,
  returnUrl: "https://example.com/payment/callback",
};

describe("fonepay", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("formatFonepayDate", () => {
    it("formats Date strictly as MM/DD/YYYY in Nepal timezone", () => {
      // 2026-10-31T00:00:00Z -> In Nepal (UTC+5:45), this is 2026-10-31 05:45:00
      const d = new Date("2026-10-31T00:00:00.000Z");
      expect(formatFonepayDate(d)).toBe("10/31/2026");
    });

    it("throws on invalid date input", () => {
      expect(() => formatFonepayDate("invalid-date-string")).toThrow(TypeError);
    });
  });

  describe("cryptographic signatures", () => {
    it("generates deterministic HMAC-SHA512 hosted signature", () => {
      const sig = generateFonepayHostedSignature({
        pid: "TEST_MERCHANT",
        md: "P",
        prn: "ORDER-001",
        amt: "100.00",
        crn: "NPR",
        dt: "10/31/2026",
        r1: "Test Order",
        r2: "N/A",
        ru: "https://example.com/callback",
        secret: "my_secret_key",
      });
      expect(typeof sig).toBe("string");
      expect(sig.length).toBe(128); // SHA-512 hex is 128 characters
      // Re-running with same inputs produces identical hash
      const sig2 = generateFonepayHostedSignature({
        pid: "TEST_MERCHANT",
        md: "P",
        prn: "ORDER-001",
        amt: "100.00",
        crn: "NPR",
        dt: "10/31/2026",
        r1: "Test Order",
        r2: "N/A",
        ru: "https://example.com/callback",
        secret: "my_secret_key",
      });
      expect(sig).toBe(sig2);
    });

    it("generates deterministic QR download signature", () => {
      const sig = generateFonepayQrSignature({
        amount: "500.00",
        prn: "QR-ORDER-1",
        merchantCode: "M100",
        remarks1: "Store",
        remarks2: "Counter 1",
        secret: "secret123",
      });
      expect(sig.length).toBe(128);
    });

    it("generates deterministic QR status check signature", () => {
      const sig = generateFonepayQrStatusSignature({
        prn: "QR-ORDER-1",
        merchantCode: "M100",
        secret: "secret123",
      });
      expect(sig.length).toBe(128);
    });

    it("verifies signatures in constant time and handles case differences", () => {
      const sig = "a1b2c3d4e5f6".repeat(10) + "12345678";
      expect(verifyFonepaySignature(sig, sig)).toBe(true);
      expect(verifyFonepaySignature(sig.toUpperCase(), sig.toLowerCase())).toBe(true);
      expect(verifyFonepaySignature(sig, "wrong")).toBe(false);
      expect(verifyFonepaySignature("", sig)).toBe(false);
    });
  });

  describe("hosted web checkout initiate", () => {
    it("constructs full signed redirect URL with all required query parameters", () => {
      const { url, params } = generateFonepayHostedUrl({
        config: testConfig,
        orderId: "INV-101",
        amountPaisa: 10000, // NPR 100.00
        date: new Date("2026-10-31T12:00:00Z"),
        remarks1: "Electronics Order",
      });

      expect(url.startsWith(FONEPAY_BASES.sandbox.hosted)).toBe(true);
      expect(params.PID).toBe("TEST_MERCHANT_01");
      expect(params.MD).toBe("P");
      expect(params.PRN).toBe("INV-101");
      expect(params.AMT).toBe("100.00");
      expect(params.CRN).toBe("NPR");
      expect(params.DT).toBe("10/31/2026");
      expect(params.R1).toBe("Electronics Order");
      expect(params.R2).toBe("N/A");
      expect(params.RU).toBe("https://example.com/payment/callback");
      expect(params.DV.length).toBe(128);
      expect(url).toContain("DV=" + params.DV);
    });

    it("uses production base URL when isSandbox is false", () => {
      const prodConfig: FonepayConfig = {
        ...testConfig,
        isSandbox: false,
      };
      const { url } = generateFonepayHostedUrl({
        config: prodConfig,
        orderId: "INV-PROD-1",
        amountPaisa: 5000,
      });
      expect(url.startsWith(FONEPAY_BASES.production.hosted)).toBe(true);
    });

    it("rejects non-positive amountPaisa", async () => {
      await expect(
        initiateFonepay({
          config: testConfig,
          orderId: "INV-ERR",
          amountPaisa: 0,
        })
      ).rejects.toThrow(RangeError);

      await expect(
        initiateFonepay({
          config: testConfig,
          orderId: "INV-ERR",
          amountPaisa: -100,
        })
      ).rejects.toThrow(RangeError);
    });

    it("throws if no returnUrl is provided in config or opts", () => {
      const noRuConfig: FonepayConfig = {
        merchantCode: "M1",
        secretKey: "S1",
        isSandbox: true,
      };
      expect(() =>
        generateFonepayHostedUrl({
          config: noRuConfig,
          orderId: "INV-1",
          amountPaisa: 1000,
        })
      ).toThrow(/returnUrl/);
    });

    it("returns flow: hosted from initiateFonepay", async () => {
      const res = await initiateFonepay({
        config: testConfig,
        orderId: "INV-202",
        amountPaisa: 25000,
      });
      expect(res.flow).toBe("hosted");
      if (res.flow === "hosted") {
        expect(res.payment_url).toContain("PRN=INV-202");
        expect(res.prn).toBe("INV-202");
      }
    });
  });

  describe("direct dynamic QR initiate", () => {
    it("returns mock EMVCo QR string when in sandbox mock mode", async () => {
      const mockConfig: FonepayConfig = {
        merchantCode: "FONEPAYTEST",
        secretKey: "test_secret",
        isSandbox: true,
      };
      const res = await initiateFonepay({
        config: mockConfig,
        flow: "qr",
        orderId: "QR-ORDER-100",
        amountPaisa: 15000, // NPR 150.00
      });

      expect(res.flow).toBe("qr");
      if (res.flow === "qr") {
        expect(res.prn).toBe("QR-ORDER-100");
        expect(res.qr_message.startsWith("000201010212")).toBe(true);
        expect(res.qr_message).toContain("150.00");
        expect(res.websocket_url).toContain("QR-ORDER-100");
        expect(res.expires_in).toBe(900);
      }
    });

    it("calls Fonepay QR API endpoint when not in mock mode", async () => {
      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          status: "success",
          qrMessage: "00020101021226...REAL_FONEPAY_QR_PAYLOAD",
          thirdpartyQrWebSocketUrl: "wss://merchantapi.fonepay.com/ws/live-stream",
          expiresIn: 600,
        }),
      })) as unknown as typeof fetch;
      vi.stubGlobal("fetch", mockFetch);

      const res = await initiateFonepay({
        config: testConfig,
        flow: "qr",
        orderId: "ORDER-LIVE-QR",
        amountPaisa: 30000,
      });

      expect(res.flow).toBe("qr");
      if (res.flow === "qr") {
        expect(res.qr_message).toBe("00020101021226...REAL_FONEPAY_QR_PAYLOAD");
        expect(res.websocket_url).toBe("wss://merchantapi.fonepay.com/ws/live-stream");
        expect(res.expires_in).toBe(600);
      }
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("throws on network error during QR download", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          status: 401,
          text: async () => "Unauthorized: Invalid merchant credentials",
        }))
      );

      await expect(
        initiateFonepay({
          config: testConfig,
          flow: "qr",
          orderId: "ERR-QR",
          amountPaisa: 1000,
        })
      ).rejects.toThrow(/HTTP 401/);
    });
  });

  describe("verifyFonepayPayment", () => {
    it("returns completed status in mock sandbox mode", async () => {
      const mockConfig: FonepayConfig = {
        merchantCode: "FONEPAYTEST",
        secretKey: "test_secret",
        isSandbox: true,
      };

      const result = await verifyFonepayPayment({
        config: mockConfig,
        orderId: "MOCK-INV-1",
        expectedAmountPaisa: 10000,
      });

      expect(result.status).toBe("completed");
      expect(result.amountPaisa).toBe(10000);
      expect(result.orderId).toBe("MOCK-INV-1");
      expect(result.traceId).toContain("MOCK-INV-1");
    });

    it("verifies hosted payment via verificationMerchant with XML response", async () => {
      const xmlResponse = `
        <response>
          <success>true</success>
          <statusCode>0</statusCode>
          <message>Transaction successful</message>
          <uniqueId>UID-FP-998877</uniqueId>
        </response>
      `;

      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => xmlResponse,
      }));
      vi.stubGlobal("fetch", mockFetch);

      const result = await verifyFonepayPayment({
        config: testConfig,
        orderId: "INV-HOSTED-1",
        expectedAmountPaisa: 10000, // NPR 100.00
        callbackData: {
          prn: "INV-HOSTED-1",
          uid: "UID-FP-998877",
          bid: "BID-NABIL-123",
          p_amt: "100.00",
        },
      });

      expect(result.status).toBe("completed");
      expect(result.amountPaisa).toBe(10000);
      expect(result.orderId).toBe("INV-HOSTED-1");
      expect(result.traceId).toBe("UID-FP-998877");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("verifies hosted payment via verificationMerchant with JSON response", async () => {
      const jsonResponse = JSON.stringify({
        success: true,
        statusCode: "0",
        message: "Payment settled",
        traceId: "TRACE-991122",
      });

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          status: 200,
          text: async () => jsonResponse,
        }))
      );

      const result = await verifyFonepayPayment({
        config: testConfig,
        orderId: "INV-JSON-1",
        expectedAmountPaisa: 50000,
        callbackData: {
          prn: "INV-JSON-1",
          uid: "TRACE-991122",
          bid: "BID-GLOBAL-456",
          p_amt: "500.00",
        },
      });

      expect(result.status).toBe("completed");
      expect(result.amountPaisa).toBe(50000);
      expect(result.traceId).toBe("TRACE-991122");
    });

    it("fails verification if callback DV signature does not match", async () => {
      const result = await verifyFonepayPayment({
        config: testConfig,
        orderId: "INV-TAMPERED",
        expectedAmountPaisa: 10000,
        callbackData: {
          prn: "INV-TAMPERED",
          uid: "UID-1",
          bid: "BID-1",
          p_amt: "100.00",
          dv: "fake_tampered_signature_string",
        },
      });

      expect(result.status).toBe("failed");
      expect(result.raw).toHaveProperty("error", "Callback signature verification failed");
    });

    it("fails verification if orderId does not match callback PRN", async () => {
      const result = await verifyFonepayPayment({
        config: testConfig,
        orderId: "EXPECTED-ORDER-1",
        expectedAmountPaisa: 10000,
        callbackData: {
          prn: "DIFFERENT-ORDER-99",
          uid: "UID-1",
        },
      });

      expect(result.status).toBe("failed");
      expect(result.raw).toHaveProperty("error", "Order ID mismatch");
    });

    it("fails verification if returned amount does not match expectedAmountPaisa", async () => {
      const xmlResponse = `<response><success>true</success><uniqueId>U1</uniqueId></response>`;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          status: 200,
          text: async () => xmlResponse,
        }))
      );

      const result = await verifyFonepayPayment({
        config: testConfig,
        orderId: "INV-AMT-MISMATCH",
        expectedAmountPaisa: 10000, // Expected Rs 100
        callbackData: {
          prn: "INV-AMT-MISMATCH",
          uid: "U1",
          bid: "B1",
          p_amt: "50.00", // Paid Rs 50
        },
      });

      expect(result.status).toBe("failed");
      expect(result.amountPaisa).toBe(5000);
      expect(result.raw).toHaveProperty("error", "Amount mismatch");
    });

    it("verifies dynamic QR status via thirdPartyDynamicQrGetStatus", async () => {
      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          paymentStatus: "success",
          bankRefId: "BANK-REF-7788",
          amount: 250.0,
        }),
      })) as unknown as typeof fetch;
      vi.stubGlobal("fetch", mockFetch);

      const result = await verifyFonepayPayment({
        config: testConfig,
        flow: "qr",
        orderId: "QR-ORDER-DONE",
        expectedAmountPaisa: 25000,
      });

      expect(result.status).toBe("completed");
      expect(result.amountPaisa).toBe(25000);
      expect(result.traceId).toBe("BANK-REF-7788");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("returns pending status for in-progress QR payment", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            paymentStatus: "pending",
          }),
        }))
      );

      const result = await verifyFonepayPayment({
        config: testConfig,
        flow: "qr",
        orderId: "QR-ORDER-PENDING",
        expectedAmountPaisa: 10000,
      });

      expect(result.status).toBe("pending");
      expect(result.orderId).toBe("QR-ORDER-PENDING");
    });
  });

  describe("unified initiatePayment & verifyPayment", () => {
    it("initiates Fonepay hosted payment via unified initiatePayment", async () => {
      const res = await initiatePayment({
        method: "fonepay",
        config: testConfig,
        order: {
          orderId: "UNIFIED-FP-1",
          amountPaisa: 8000,
          remarks1: "Unified Order",
        },
      });

      expect(res).toHaveProperty("flow", "hosted");
      expect((res as any).payment_url).toContain("PRN=UNIFIED-FP-1");
    });

    it("initiates Fonepay QR payment via unified initiatePayment", async () => {
      const mockConfig: FonepayConfig = {
        merchantCode: "FONEPAYTEST",
        secretKey: "test_secret",
        isSandbox: true,
      };
      const res = await initiatePayment({
        method: "fonepay",
        config: mockConfig,
        flow: "qr",
        order: {
          orderId: "UNIFIED-QR-1",
          amountPaisa: 12000,
        },
      });

      expect(res).toHaveProperty("flow", "qr");
      expect((res as any).qr_message).toBeDefined();
    });

    it("verifies Fonepay payment via unified verifyPayment", async () => {
      const mockConfig: FonepayConfig = {
        merchantCode: "FONEPAYTEST",
        secretKey: "test_secret",
        isSandbox: true,
      };
      const res = await verifyPayment({
        method: "fonepay",
        config: mockConfig,
        orderId: "UNIFIED-VERIFY-1",
        expectedAmountPaisa: 15000,
      });

      expect(res.status).toBe("completed");
      expect(res.amountPaisa).toBe(15000);
      expect(res.orderId).toBe("UNIFIED-VERIFY-1");
    });
  });
});
