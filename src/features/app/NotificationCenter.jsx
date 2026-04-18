import { Bell, CheckCheck, Trash2 } from "lucide-react";

import { EmptyPanel, Sheet, StatusPill } from "./ui.jsx";
import { formatDateShort } from "../../utils/format.js";

function getNotificationTone(kind) {
  const key = String(kind || "").trim().toLowerCase();
  if (key === "budget_alert" || key === "debt_due") return "warning";
  if (key === "goal_due" || key === "recurring_due") return "default";
  if (key === "scan_pending") return "success";
  return "default";
}

function getNotificationKindLabel(kind) {
  const key = String(kind || "").trim().toLowerCase();
  if (key === "budget_alert") return "งบ";
  if (key === "debt_due") return "หนี้";
  if (key === "goal_due") return "เป้าหมาย";
  if (key === "recurring_due") return "Recurring";
  if (key === "scan_pending") return "Inbox";
  return "แจ้งเตือน";
}

export default function NotificationCenter({
  open,
  onClose,
  notifications,
  unreadCount,
  loading = false,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
}) {
  const items = Array.isArray(notifications) ? notifications : [];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="การแจ้งเตือน"
      subtitle={unreadCount ? `ยังไม่ได้อ่าน ${unreadCount} รายการ` : "ไม่มีรายการที่ยังไม่ได้อ่าน"}
      footer={
        <div className="finance-sheet-actions finance-sheet-actions-sticky">
          <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose}>
            ปิด
          </button>
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            disabled={!unreadCount || loading}
            onClick={() => void markAllNotificationsRead?.()}
          >
            <CheckCheck size={16} />
            อ่านทั้งหมด
          </button>
        </div>
      }
    >
      {items.length ? (
        <div className="finance-list finance-notification-list">
          {items.map((notification) => (
            <article
              key={notification.id || `${notification.kind}-${notification.created_at}`}
              className={[
                "finance-notification-card",
                notification.is_read ? "is-read" : "is-unread",
              ].join(" ")}
            >
              <button
                type="button"
                className="finance-notification-main"
                onClick={() => void markNotificationRead?.(notification.id)}
              >
                <div className="finance-notification-head">
                  <div className="finance-notification-title-row">
                    <div className="finance-row-title">{notification.title}</div>
                    {!notification.is_read ? <span className="finance-notification-dot" aria-hidden="true" /> : null}
                  </div>
                  <StatusPill tone={getNotificationTone(notification.kind)}>
                    {getNotificationKindLabel(notification.kind)}
                  </StatusPill>
                </div>
                {notification.body ? <div className="finance-row-meta finance-row-meta-wrap">{notification.body}</div> : null}
                <div className="finance-notification-meta">
                  {notification.created_at ? formatDateShort(notification.created_at) : "ใหม่"}
                </div>
              </button>
              <button
                type="button"
                className="ui-icon-btn finance-notification-dismiss"
                aria-label="Dismiss notification"
                onClick={() => void dismissNotification?.(notification.id)}
              >
                <Trash2 size={16} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyPanel
          title="ยังไม่มีการแจ้งเตือน"
          copy="เมื่อมีงบใกล้เต็ม หนี้ใกล้ครบกำหนด รายการ recurring ถึงรอบ หรือเอกสารค้างตรวจ รายการจะมารวมที่นี่"
          action={
            <div className="finance-empty-icon">
              <Bell size={18} />
            </div>
          }
        />
      )}
    </Sheet>
  );
}
