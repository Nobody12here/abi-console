import type { ReactNode } from "react";

export function Menu({ children }: { children: ReactNode }) {
  return <div className="menu">{children}</div>;
}
