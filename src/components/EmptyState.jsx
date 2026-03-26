// src/components/EmptyState.jsx
import React from "react";
import { cn } from "../utils/cn";

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}) {
  return (
    <div className={cn("ui-card", "text-center py-12", className)}>
      {icon ? <div className="mx-auto mb-3 opacity-35">{icon}</div> : null}
      <div className="text-base font-semibold text-gray-900">{title || "ไม่มีข้อมูล"}</div>
      {description ? (
        <div className="mt-2 text-sm font-bold text-gray-700/70 whitespace-pre-wrap">
          {description}
        </div>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
