import { formatEther, parseEther, type Hex } from "viem";

export function plural(
  count: number,
  singular: string,
  pluralForm = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function shortenAddress(address: string | undefined, size = 4): string {
  if (!address) return "";
  if (address.length <= size * 2 + 2) return address;
  return `${address.slice(0, size + 2)}…${address.slice(-size)}`;
}

export function shortHash(hash: string | undefined, size = 6): string {
  if (!hash) return "";
  if (hash.length <= size * 2 + 2) return hash;
  return `${hash.slice(0, size + 2)}…${hash.slice(-size)}`;
}

export function shortSignature(signature: string, max = 52): string {
  if (signature.length <= max) return signature;
  return `${signature.slice(0, max - 1)}…`;
}

export function relativeTime(iso: string | undefined): string {
  if (!iso) return "never";
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return "unknown";

  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 90) return "a minute ago";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function absoluteTime(iso: string | undefined): string {
  if (!iso) return "Unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatNativeValue(wei: bigint, symbol: string): string {
  const formatted = formatEther(wei);
  const trimmed = formatted.includes(".")
    ? formatted.replace(/0+$/, "").replace(/\.$/, "")
    : formatted;
  return `${trimmed} ${symbol}`;
}

export function parseNativeValue(input: string, unit: "native" | "wei"): bigint {
  const value = input.trim();
  if (!value) return 0n;
  if (unit === "wei") {
    if (!/^\d+$/.test(value)) throw new Error("Enter a whole number of wei.");
    return BigInt(value);
  }
  if (!/^\d*\.?\d+$/.test(value) && !/^\d+\.?$/.test(value)) {
    throw new Error("Enter a valid amount.");
  }
  return parseEther(value);
}

export function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  return value;
}

export function toJson(value: unknown, space = 2): string {
  return JSON.stringify(value, jsonReplacer, space);
}

export function isProbablyHtml(text: string): boolean {
  return /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text);
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function downloadText(
  content: string,
  filename: string,
  type = "application/json",
): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in Firefox and Safari.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function hexBytes(hex: string): number {
  return Math.max(0, (hex.length - 2) / 2);
}

export function isHexData(value: string): value is Hex {
  return /^0x[0-9a-fA-F]*$/.test(value);
}

/** One-line rendering of a decoded value, for collapsed rows. */
export function previewValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value === "" ? '""' : value;
  if (typeof value === "bigint" || typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  return toJson(value, 0);
}
