import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("empty-state", className)}>
      <h2>{title}</h2>
      {description && <div className="empty-state-copy">{description}</div>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
