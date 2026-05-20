export const ATTACHMENT_PREVIEW_COPY = {
  missing: "ไฟล์แนบไม่พบในเครื่องนี้",
  backupHint: "ถ้านำเข้าจาก Backup เดิม ไฟล์รูปอาจไม่ได้ถูกสำรองมาด้วย",
  loading: "กำลังโหลดไฟล์แนบ...",
  open: "ดูใบเสร็จ",
  imageAlt: "ใบเสร็จ",
  pdfLabel: "PDF",
};

export function resolveAttachmentPreviewState(attachmentId, info = {}) {
  const id = String(attachmentId || "").trim();
  const url = String(info?.url || "");
  const mimeType = String(info?.mimeType || "").toLowerCase();
  const isMissing = !!id && (!!info?.missing || (!!info?.resolved && !url));
  const isLoading = !!id && !isMissing && (!!info?.loading || (!info?.resolved && !url));
  const canOpen = !!id && !!url && !isMissing;

  return {
    attachmentId: id,
    hasAttachment: !!id,
    url,
    mimeType,
    isPdf: mimeType === "application/pdf",
    isMissing,
    isLoading,
    canOpen,
    label: isMissing
      ? ATTACHMENT_PREVIEW_COPY.missing
      : isLoading
        ? ATTACHMENT_PREVIEW_COPY.loading
        : ATTACHMENT_PREVIEW_COPY.open,
    title: isMissing
      ? `${ATTACHMENT_PREVIEW_COPY.missing} ${ATTACHMENT_PREVIEW_COPY.backupHint}`
      : ATTACHMENT_PREVIEW_COPY.open,
  };
}
