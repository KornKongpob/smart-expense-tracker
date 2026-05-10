import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRightLeft,
  CreditCard,
  Edit3,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Layers,
  ReceiptText,
  X,
} from "lucide-react";

import { formatCurrency, formatTransactionDateTime } from "../utils/format";
import { resolveTransactionDetailModel } from "../utils/transactionDetail.js";
import { useBlobInfo } from "../utils/useBlobInfo";
import { useLockBodyScroll } from "../utils/useLockBodyScroll";

function clean(value) {
  return String(value ?? "").trim();
}

function formatBytes(size) {
  const bytes = Number(size || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`;
}

function safeDateLabel(date, time) {
  try {
    return formatTransactionDateTime(date, time);
  } catch {
    return clean(date) || "No date";
  }
}

function typeLabel(type) {
  const key = clean(type).toLowerCase();
  if (key === "credit_payment") return "Credit payment";
  if (key === "transfer") return "Transfer";
  if (key === "income") return "Income";
  return "Expense";
}

function amountPrefix(type) {
  const key = clean(type).toLowerCase();
  if (key === "income") return "+";
  if (key === "transfer" || key === "credit_payment") return "";
  return "-";
}

function amountTone(type) {
  const key = clean(type).toLowerCase();
  if (key === "income") return "text-emerald-700";
  if (key === "transfer" || key === "credit_payment") return "text-slate-900";
  return "text-rose-700";
}

function lineMarker(line) {
  if (line?.receiptLineType !== "adjustment") return "";
  if (line?.adjustmentEffect === "subtract") return "Discount";
  const type = clean(line?.adjustmentType).toLowerCase();
  if (type === "tax") return "Tax";
  if (type === "rounding") return "Rounding";
  return "Fee";
}

function lineAmount(line) {
  const prefix =
    line?.receiptLineType === "adjustment"
      ? line.adjustmentEffect === "subtract"
        ? "-"
        : "+"
      : "";
  return `${prefix}${formatCurrency(line?.amountSatang || 0)}`;
}

function DetailRow({ label, value, children }) {
  if (!children && !clean(value)) return null;
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="min-w-0 text-right text-sm font-semibold text-slate-900">
        {children || <span className="break-words">{value}</span>}
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
      {Icon ? <Icon size={16} className="text-slate-500" /> : null}
      <span>{children}</span>
    </div>
  );
}

function ReceiptLines({ lines = [] }) {
  if (!Array.isArray(lines) || !lines.length) return null;

  return (
    <section className="space-y-3">
      <SectionTitle icon={ReceiptText}>Receipt lines</SectionTitle>
      <div className="space-y-2">
        {lines.map((line, index) => {
          const marker = lineMarker(line);
          return (
            <div
              key={clean(line.id) || `${line.splitIndex || index}-${line.itemName}`}
              className="rounded-2xl border border-slate-200 bg-white p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="break-words text-sm font-semibold text-slate-900">
                      {line.itemName || line.note || "Line item"}
                    </div>
                    {marker ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                        {marker}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs font-medium text-slate-500">
                    {line.categoryName || line.categoryId || "Uncategorized"}
                  </div>
                </div>
                <div className="shrink-0 text-sm font-bold tabular-nums text-slate-900">{lineAmount(line)}</div>
              </div>

              {Array.isArray(line.children) && line.children.length ? (
                <div className="mt-2 space-y-1 border-l border-slate-200 pl-3">
                  {line.children.map((child, childIndex) => (
                    <div
                      key={`${line.id || index}-${childIndex}`}
                      className="flex items-center justify-between gap-3 text-xs font-medium text-slate-500"
                    >
                      <span className="min-w-0 truncate">{child.name || "Item"}</span>
                      {child.amountSatang ? <span>{formatCurrency(child.amountSatang)}</span> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AttachmentPreview({ attachmentId }) {
  const info = useBlobInfo(attachmentId);
  const [imageOpen, setImageOpen] = useState(false);
  const url = info?.url || "";
  const mimeType = clean(info?.mimeType).toLowerCase();
  const isImage = !!url && mimeType.startsWith("image/");
  const isPdf = !!url && mimeType === "application/pdf";
  const sizeLabel = formatBytes(info?.size);

  useEffect(() => {
    setImageOpen(false);
  }, [attachmentId]);

  if (!attachmentId) return null;

  const largePreview =
    imageOpen && isImage ? (
      <div className="fixed inset-0 z-[130] flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <button
          type="button"
          className="absolute inset-0 bg-black/80"
          aria-label="Close image preview"
          onClick={() => setImageOpen(false)}
        />
        <div className="relative max-h-full max-w-5xl">
          <button
            type="button"
            onClick={() => setImageOpen(false)}
            className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full bg-white text-slate-900 shadow-lg"
            aria-label="Close image preview"
          >
            <X size={18} />
          </button>
          <img
            src={url}
            alt="Attached scan large preview"
            className="max-h-[88dvh] max-w-full rounded-2xl object-contain shadow-2xl"
          />
        </div>
      </div>
    ) : null;

  return (
    <section className="space-y-3">
      <SectionTitle icon={FileText}>Attachment</SectionTitle>
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        {isImage ? (
          <button
            type="button"
            onClick={() => setImageOpen(true)}
            className="block w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left"
          >
            <img src={url} alt="Attached scan preview" className="max-h-72 w-full object-contain" />
          </button>
        ) : isPdf ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-900"
          >
            <span className="flex min-w-0 items-center gap-2">
              <FileText size={18} className="shrink-0 text-rose-600" />
              <span className="truncate">Open scanned PDF</span>
            </span>
            <ExternalLink size={16} className="shrink-0 text-slate-400" />
          </a>
        ) : url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-900"
          >
            <span className="flex min-w-0 items-center gap-2">
              <ImageIcon size={18} className="shrink-0 text-slate-500" />
              <span className="truncate">Open attached file</span>
            </span>
            <ExternalLink size={16} className="shrink-0 text-slate-400" />
          </a>
        ) : (
          <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-500">
            Attachment is saved; preview is loading.
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
          <span className="rounded-full bg-slate-100 px-2 py-1">{mimeType || "stored file"}</span>
          {sizeLabel ? <span className="rounded-full bg-slate-100 px-2 py-1">{sizeLabel}</span> : null}
        </div>
      </div>
      {typeof document !== "undefined" && largePreview ? createPortal(largePreview, document.body) : largePreview}
    </section>
  );
}

export default function TransactionDetailModal({
  transaction,
  transactions = [],
  accounts = [],
  categories = {},
  onClose,
  onEdit,
}) {
  const titleId = useId();
  const closeButtonRef = useRef(null);
  const model = useMemo(
    () => resolveTransactionDetailModel({ transaction, transactions, accounts, categories }),
    [transaction, transactions, accounts, categories],
  );
  const isOpen = !!model;

  useLockBodyScroll(isOpen);

  useEffect(() => {
    if (!isOpen) return undefined;

    const t = window.setTimeout(() => closeButtonRef.current?.focus?.(), 0);
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!model) return null;

  const TypeIcon =
    model.txType === "credit_payment" ? CreditCard : model.txType === "transfer" ? ArrowRightLeft : model.kind === "split" ? Layers : ReceiptText;
  const dateLabel = safeDateLabel(model.date, model.transactionTime);
  const amountText = `${amountPrefix(model.txType)}${formatCurrency(model.amountSatang || 0)}`;
  const sourceEvidence = clean(model.evidence);
  const modal = (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onTouchMove={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
      }}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        aria-label="Close transaction details"
        onClick={onClose}
      />

      <div className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="border-b border-slate-200 px-4 pb-3 pt-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                <TypeIcon size={15} />
                <span>{typeLabel(model.txType)}</span>
              </div>
              <h3 id={titleId} className="mt-1 break-words text-xl font-bold text-slate-950">
                {model.title || "Transaction"}
              </h3>
              {model.merchant && model.merchant !== model.title ? (
                <div className="mt-1 break-words text-sm font-semibold text-slate-500">{model.merchant}</div>
              ) : null}
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
              aria-label="Close transaction details"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Amount</div>
              <div className={`mt-1 text-3xl font-black tabular-nums ${amountTone(model.txType)}`}>{amountText}</div>
              <div className="mt-2 text-sm font-semibold text-slate-600">{dateLabel}</div>
            </section>

            {model.transfer ? (
              <section className="space-y-3">
                <SectionTitle icon={ArrowRightLeft}>Transfer details</SectionTitle>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <DetailRow label="From" value={model.transfer.fromAccountName} />
                  <DetailRow label="To" value={model.transfer.toAccountName} />
                </div>
              </section>
            ) : null}

            <section className="space-y-2">
              <SectionTitle icon={ReceiptText}>Details</SectionTitle>
              <DetailRow label="Account" value={model.accountName} />
              <DetailRow label="Category" value={model.categoryName} />
              <DetailRow label="Reference" value={model.ref} />
              <DetailRow label="Source" value={model.source} />
              {model.note ? (
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Note</div>
                  <div className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-slate-900">{model.note}</div>
                </div>
              ) : null}
              {sourceEvidence ? (
                <div className="rounded-xl bg-slate-50 px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence</div>
                  <div className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-slate-900">
                    {sourceEvidence}
                  </div>
                </div>
              ) : null}
            </section>

            <ReceiptLines lines={model.lines} />
            <AttachmentPreview attachmentId={model.attachmentId} />
          </div>
        </div>

        <div className="border-t border-slate-200 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5">
          <button
            type="button"
            onClick={() => onEdit?.(model.editTargetId || model.primaryTxId || model.selectedId, model)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-sm transition active:scale-[0.99]"
          >
            <Edit3 size={17} />
            แก้ไข
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}
