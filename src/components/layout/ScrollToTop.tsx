import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Page key without the contract tab, so switching tabs keeps the scroll position. */
function pageKey(pathname: string): string {
  const match = pathname.match(/^\/contract\/[^/]+\/[^/]+/);
  return match ? match[0] : pathname;
}

export function ScrollToTop() {
  const { pathname } = useLocation();
  const key = pageKey(pathname);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [key]);

  return null;
}
