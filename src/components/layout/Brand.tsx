import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Braces } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="brand" aria-label="ABI Console home">
      <span className="brand-mark">
        <Braces size={17} strokeWidth={2.2} />
      </span>
      {!compact && (
        <span className="brand-word">
          ABI <i>/</i> Console
        </span>
      )}
    </Link>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <div className="page-header-description">{description}</div>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
      {children}
    </header>
  );
}
