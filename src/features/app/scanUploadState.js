const STAGE_ORDER = {
  queued: 0,
  preparing: 1,
  uploading: 2,
  scanning: 3,
  validating: 4,
  done: 5,
  error: 5,
};

const STAGE_LABEL = {
  queued: "รอเริ่มสแกน",
  preparing: "เตรียมไฟล์",
  uploading: "อัปโหลดไฟล์",
  scanning: "สแกนเอกสาร",
  validating: "ตรวจผลลัพธ์",
  done: "พร้อมใน Inbox",
  error: "สแกนไม่สำเร็จ",
};

const RAW_STAGE_MAP = {
  queued: "queued",
  encoding_image: "preparing",
  preparing_file: "preparing",
  uploading_files: "uploading",
  calling_api: "scanning",
  calling_api_fallback: "scanning",
  parsing_response: "validating",
  validating_items: "validating",
  done: "done",
  error: "error",
};

function cleanText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

export function getScanUploadStage(rawStatus) {
  const key = cleanText(rawStatus, "queued");
  if (Object.hasOwn(STAGE_ORDER, key)) return key;
  return RAW_STAGE_MAP[key] || "queued";
}

function resolveProgressStage(stage, rawProgressStage) {
  if (stage !== "error") return stage;

  const fallbackStage = getScanUploadStage(rawProgressStage);
  return fallbackStage === "error" ? "queued" : fallbackStage;
}

export function getScanUploadMeta(rawStatus, fileName = "", options = {}) {
  const stage = getScanUploadStage(rawStatus);
  const progressStage = resolveProgressStage(stage, cleanText(options.progressStage, stage));
  const totalSteps = 5;
  const stepIndex = stage === "done" ? totalSteps : STAGE_ORDER[progressStage] ?? 0;
  const progress = Math.max(0, Math.min(100, Math.round((stepIndex / totalSteps) * 100)));
  const label = STAGE_LABEL[stage] || stage;
  const stepText = `${stepIndex}/${totalSteps}`;
  const badgeText = stage === "done" ? "พร้อมใช้" : stage === "error" ? "ต้องตรวจ" : stepText;
  const progressLabel = stage === "error" ? `หยุดที่ขั้นตอน ${stepText}` : `ขั้นตอน ${stepText}`;
  const detailText = `${progressLabel} • ${label}`;
  const prefix = cleanText(fileName);

  return {
    rawStatus: cleanText(rawStatus, "queued"),
    stage,
    progressStage,
    label,
    stepIndex,
    totalSteps,
    progress,
    stepText,
    badgeText,
    progressLabel,
    detailText,
    summary: prefix ? `${prefix} - ${detailText}` : detailText,
  };
}

export function createScanUploadEntry(file, patch = {}) {
  const fileName = cleanText(file?.name, "scan-upload");
  const status = cleanText(patch.status, "queued");
  const meta = getScanUploadMeta(status, fileName, {
    progressStage: patch.progressStage,
  });

  return {
    id: patch.id || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    file,
    fileName,
    fileSize: Number(file?.size || 0),
    mimeType: cleanText(file?.type),
    status,
    stage: meta.stage,
    progressStage: meta.progressStage,
    label: meta.label,
    stepIndex: meta.stepIndex,
    totalSteps: meta.totalSteps,
    stepText: meta.stepText,
    badgeText: meta.badgeText,
    progressLabel: meta.progressLabel,
    detailText: meta.detailText,
    progress: meta.progress,
    summary: meta.summary,
    scanDocumentId: patch.scanDocumentId || null,
    error: patch.error || "",
    createdAt: patch.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function patchScanUploadEntry(entry, patch = {}) {
  const base = entry && typeof entry === "object" ? entry : {};
  const nextStatus = cleanText(patch.status, base.status || "queued");
  const nextFileName = cleanText(patch.fileName, base.fileName || "scan-upload");
  const fallbackProgressStage =
    nextStatus === "error"
      ? cleanText(
          patch.progressStage,
          base.progressStage || (base.stage && base.stage !== "error" ? base.stage : base.status || "queued"),
        )
      : cleanText(patch.progressStage, nextStatus);
  const meta = getScanUploadMeta(nextStatus, nextFileName, {
    progressStage: fallbackProgressStage,
  });
  const nextProgress =
    patch.progress != null
      ? Number(patch.progress)
      : nextStatus === "error" && Number.isFinite(Number(base.progress))
        ? Number(base.progress)
        : meta.progress;

  return {
    ...base,
    ...patch,
    fileName: nextFileName,
    status: nextStatus,
    stage: meta.stage,
    progressStage: meta.progressStage,
    label: meta.label,
    stepIndex: meta.stepIndex,
    totalSteps: meta.totalSteps,
    stepText: meta.stepText,
    badgeText: meta.badgeText,
    progressLabel: meta.progressLabel,
    detailText: meta.detailText,
    progress: nextProgress,
    summary: patch.summary || meta.summary,
    updatedAt: new Date().toISOString(),
  };
}
