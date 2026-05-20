import React from "react";
import { FileText, Image as ImageIcon, ReceiptText } from "lucide-react";
import { useBlobInfo } from "../utils/useBlobInfo";
import { ATTACHMENT_PREVIEW_COPY, resolveAttachmentPreviewState } from "../utils/attachmentPreviewState";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function stopAttachmentEvent(event) {
  event.stopPropagation();
}

export default function AttachmentPreview({ attachmentId, variant = "thumb", className = "" }) {
  const id = String(attachmentId || "").trim();
  const info = useBlobInfo(id);
  const preview = resolveAttachmentPreviewState(id, info);

  if (!preview.hasAttachment) return null;

  const openAttachment = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!preview.canOpen || typeof window === "undefined") return;
    window.open(preview.url, "_blank", "noopener,noreferrer");
  };

  const handleKeyDown = (event) => {
    event.stopPropagation();
    if (!preview.canOpen || (event.key !== "Enter" && event.key !== " ")) return;
    openAttachment(event);
  };

  const interactionProps = {
    onPointerDown: stopAttachmentEvent,
    onPointerUp: stopAttachmentEvent,
    onMouseDown: stopAttachmentEvent,
    onClick: preview.canOpen ? openAttachment : stopAttachmentEvent,
    onKeyDown: handleKeyDown,
    role: preview.canOpen ? "link" : "status",
    tabIndex: preview.canOpen ? 0 : undefined,
    "aria-label": preview.canOpen ? ATTACHMENT_PREVIEW_COPY.open : undefined,
  };

  if (variant === "link") {
    if (preview.isMissing) {
      return (
        <span
          {...interactionProps}
          className={cx(
            "inline-flex max-w-full flex-col items-start gap-0.5 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800",
            className,
          )}
          title={preview.title}
        >
          <span className="inline-flex max-w-full items-center gap-1.5">
            <FileText size={13} aria-hidden="true" />
            <span className="truncate">{preview.label}</span>
          </span>
          <span className="whitespace-normal text-[10px] font-medium leading-snug text-amber-800/75">
            {ATTACHMENT_PREVIEW_COPY.backupHint}
          </span>
        </span>
      );
    }

    return (
      <span
        {...interactionProps}
        className={cx(
          "inline-flex max-w-full items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700",
          preview.canOpen ? "cursor-pointer hover:bg-indigo-100" : "text-gray-500",
          className,
        )}
      >
        {preview.isPdf ? <FileText size={13} aria-hidden="true" /> : <ReceiptText size={13} aria-hidden="true" />}
        <span className="truncate">{preview.label}</span>
      </span>
    );
  }

  const frameClass =
    variant === "inline"
      ? "block w-full overflow-hidden rounded-2xl border border-white/20 bg-white/10 text-left"
      : "block w-full max-w-[220px] overflow-hidden rounded-2xl border border-white/20 bg-white/10 text-left";

  const bodyHeightClass = variant === "inline" ? "min-h-36 max-h-80" : "h-28";

  if (preview.isMissing) {
    return (
      <span
        {...interactionProps}
        className={cx(
          "block rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800",
          className,
        )}
        title={preview.title}
      >
        <span className="block">{preview.label}</span>
        <span className="mt-1 block text-[11px] font-medium leading-snug text-amber-800/75">
          {ATTACHMENT_PREVIEW_COPY.backupHint}
        </span>
      </span>
    );
  }

  return (
    <span
      {...interactionProps}
      className={cx(frameClass, preview.canOpen ? "cursor-pointer hover:bg-white/20" : "", className)}
    >
      {preview.canOpen ? (
        preview.isPdf ? (
          <span className={cx("flex w-full items-center justify-center bg-white/10", bodyHeightClass)}>
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900/80">
              <FileText size={18} aria-hidden="true" />
              {ATTACHMENT_PREVIEW_COPY.pdfLabel}
            </span>
          </span>
        ) : (
          <img
            src={preview.url}
            alt={ATTACHMENT_PREVIEW_COPY.imageAlt}
            className={cx("w-full object-cover", variant === "inline" ? "max-h-80" : "h-28")}
          />
        )
      ) : (
        <span className={cx("flex w-full items-center justify-center gap-2 px-3 text-xs font-semibold text-gray-900/55", bodyHeightClass)}>
          <ImageIcon size={16} aria-hidden="true" />
          {preview.label}
        </span>
      )}
    </span>
  );
}
