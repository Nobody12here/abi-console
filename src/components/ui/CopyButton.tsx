import { useState } from "react";
import { Check, Copy } from "lucide-react";
import toast from "react-hot-toast";
import { copyText } from "@/lib/format";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label = "Copy",
  className,
  compact = false,
}: {
  value: string | undefined;
  label?: string;
  className?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  if (!value) return null;

  return (
    <button
      type="button"
      className={cn("copy-btn", compact && "compact", className)}
      aria-label={label}
      title={label}
      onClick={async (event) => {
        event.stopPropagation();
        try {
          await copyText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        } catch {
          toast.error("Could not copy to the clipboard.");
        }
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {!compact && <span>{copied ? "Copied" : label}</span>}
    </button>
  );
}
