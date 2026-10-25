import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "teal" | "blue" | "amber" | "red" | "green" | "muted";

export function Badge({
  children,
  tone = "neutral",
  mono = false,
  className,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  mono?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={cn("badge", `badge-${tone}`, mono && "mono", className)}
      title={title}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "teal" }: { tone?: Tone }) {
  return <span className={cn("status-dot", `dot-${tone}`)} aria-hidden="true" />;
}
