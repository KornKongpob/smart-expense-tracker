// api/scan.js
// ✅ Alias to the improved hybrid receipt scanner.
// We keep /api/scan as the main endpoint so existing clients keep working.
// Implementation lives in /api/scan-receipt.js.

import scanReceiptHandler from "./scan-receipt.js";

export default async function handler(req, res) {
  return scanReceiptHandler(req, res);
}
