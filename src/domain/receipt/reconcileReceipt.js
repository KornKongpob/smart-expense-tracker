import { normalizeReceiptLine, receiptLineToStoredLine, signedReceiptLineSatang } from "./receiptLineModel.js";

function clean(value) {
  return String(value ?? "").trim();
}

function toInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

export function summarizeReceiptLines(lines = []) {
  const normalized = (Array.isArray(lines) ? lines : []).map((line, index) => normalizeReceiptLine(line, index));
  const itemSubtotalSatang = normalized
    .filter((line) => line.receiptLineType !== "adjustment")
    .reduce((sum, line) => sum + Number(line.amountSatang || 0), 0);
  const adjustmentNetSatang = normalized
    .filter((line) => line.receiptLineType === "adjustment")
    .reduce((sum, line) => sum + signedReceiptLineSatang(line), 0);
  const discountSatang = normalized
    .filter((line) => line.receiptLineType === "adjustment" && line.adjustmentEffect === "subtract")
    .reduce((sum, line) => sum + Number(line.amountSatang || 0), 0);
  const surchargeSatang = normalized
    .filter((line) => line.receiptLineType === "adjustment" && line.adjustmentEffect !== "subtract")
    .reduce((sum, line) => sum + Number(line.amountSatang || 0), 0);
  const netSatang = itemSubtotalSatang + adjustmentNetSatang;

  return {
    lines: normalized,
    itemSubtotalSatang,
    discountSatang,
    surchargeSatang,
    netSatang,
  };
}

export function reconcileReceiptLines(lines = [], paidTotalSatang, options = {}) {
  const warnings = [];
  const target = Math.max(0, toInt(paidTotalSatang, 0));
  const summary = summarizeReceiptLines(lines);
  let reconciledLines = summary.lines;
  let differenceSatang = target - summary.netSatang;

  if (target > 0 && Math.abs(differenceSatang) > 1) {
    warnings.push("receipt_total_mismatch");

    if (options.addRoundingAdjustment === true) {
      const effect = differenceSatang < 0 ? "subtract" : "add";
      const amountSatang = Math.abs(differenceSatang);
      reconciledLines = [
        ...reconciledLines,
        normalizeReceiptLine(
          {
            id: clean(options.roundingAdjustmentId) || "receipt_rounding_adjustment",
            name: "Rounding",
            amountSatang,
            categoryId: clean(options.roundingCategoryId) || "rounding",
            receiptLineType: "adjustment",
            adjustmentType: "rounding",
            adjustmentEffect: effect,
          },
          reconciledLines.length,
        ),
      ];
      differenceSatang = 0;
    }
  }

  return {
    ...summarizeReceiptLines(reconciledLines),
    lines: reconciledLines.map(receiptLineToStoredLine),
    paidTotalSatang: target,
    differenceSatang,
    balanced: Math.abs(differenceSatang) <= 1,
    warnings,
  };
}

export default {
  reconcileReceiptLines,
  summarizeReceiptLines,
};
