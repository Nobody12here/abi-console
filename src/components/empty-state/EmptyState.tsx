import { memo } from "react";
import { Braces } from "lucide-react";

export const EmptyState = memo(function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Braces size={22} />
      </div>
      <p className="eyebrow">READY WHEN YOU ARE</p>
      <h2>Load a contract to begin</h2>
      <p>
        Fetch an ABI by address, paste your JSON, or upload a local file. The
        console will generate an interface for every read and write method.
      </p>
    </div>
  );
});
