/**
 * Provider contract input:
 *  { payload: {variant:'single'|'images', ...}, scanOpenAI: Function }
 * Provider contract output:
 *  { status:number, body:{ok:boolean, code?:string, message?:string, data?:any} }
 */

export async function scanWithProvider({ provider, payload, scanOpenAI }) {
  const p = String(provider || "openai").toLowerCase();

  if (p === "gemini") {
    return {
      status: 501,
      body: {
        ok: false,
        code: "provider_not_implemented",
        message: "Gemini provider adapter is not implemented yet",
      },
    };
  }

  if (payload.variant === "images") {
    const pdf = payload.images.find((x) => x.mimeType === "application/pdf");
    return pdf
      ? scanOpenAI({ base64: pdf.base64, mimeType: pdf.mimeType, filename: pdf.filename, accounts: payload.accounts })
      : scanOpenAI({ images: payload.images, accounts: payload.accounts });
  }

  return scanOpenAI({
    base64: payload.base64,
    mimeType: payload.mimeType,
    filename: payload.filename,
    accounts: payload.accounts,
  });
}
