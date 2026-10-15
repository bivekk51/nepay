export function nprToPaisa(npr: number): number {
  return Math.round(npr * 100);
}

export function paisaToRupeesString(paisa: number): string {
  const fixed = (paisa / 100).toFixed(2);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

export function parseAmountToPaisa(raw: string | number): number {
  const cleaned = String(raw).replace(/,/g, "").trim();
  return Math.round(Number(cleaned) * 100);
}
