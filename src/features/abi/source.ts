import type { AbiSource } from "./types";

export function sourceLabel(source: AbiSource): string {
  switch (source.kind) {
    case "file":
      return source.fileName;
    case "paste":
      return "Pasted ABI";
    case "url":
      return source.url;
    case "explorer":
      return "Etherscan (verified)";
    case "legacy":
      return "Legacy import";
  }
}

export function sourceKindLabel(source: AbiSource): string {
  switch (source.kind) {
    case "file":
      return "File";
    case "paste":
      return "Pasted";
    case "url":
      return "URL";
    case "explorer":
      return "Explorer";
    case "legacy":
      return "Legacy";
  }
}
