import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("empty-state", className)}>
      {icon && <div className="empty-state-icon">{icon}</div>}
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2>{title}</h2>
      {description && <div className="empty-state-copy">{description}</div>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
