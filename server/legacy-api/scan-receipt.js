// Backward-compatible alias.
// Main endpoint: /api/scan

import scanHandler from "./scan.js";

export default async function handler(req, res) {
  return scanHandler(req, res);
}
