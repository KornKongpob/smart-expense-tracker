import React from "react";
import { cn } from "../../utils/cn";

/**
 * BentoGrid
 * - Mobile-first: single column
 * - Tablet/Desktop: 12-column bento grid
 */
export default function BentoGrid({ className, children }) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-12 gap-3", className)}>
      {children}
    </div>
  );
}
