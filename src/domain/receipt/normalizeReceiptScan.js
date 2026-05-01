import { normalizeReceiptScanResult } from "../../../shared/scanSchema.js";

export {
  NormalizedReceiptAdjustmentSchema,
  NormalizedReceiptItemSchema,
  NormalizedReceiptScanSchema,
  normalizeReceiptScanResult,
} from "../../../shared/scanSchema.js";

export function normalizeReceiptScan(payload) {
  return normalizeReceiptScanResult(payload);
}

export default normalizeReceiptScan;
