import { describe, it, expect } from "vitest";
import { nprToPaisa, paisaToRupeesString, parseAmountToPaisa } from "../src/money.js";
describe("money", () => {
  it("converts NPR to paisa without float drift", () => { expect(nprToPaisa(123.45)).toBe(12345); });
  it("formats paisa to rupees string", () => { expect(paisaToRupeesString(12345)).toBe("123.45"); expect(paisaToRupeesString(10000)).toBe("100"); });
  it("parses comma-formatted callback amounts", () => { expect(parseAmountToPaisa("1,000.0")).toBe(100000); expect(parseAmountToPaisa("100")).toBe(10000); });
});
