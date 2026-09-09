import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const shortenAddress = (address: string) =>
  address.length > 12
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;

export const formatContractError = (
  error: unknown,
  functionName: string,
  isWrite: boolean,
) => {
  if (!(error instanceof Error)) {
    return `${isWrite ? "Write" : "Read"} ${functionName} failed: Unknown error`;
  }

  const viemError = error as Error & {
    shortMessage?: string;
    details?: string;
    docs?: string;
    metaMessages?: string[];
  };
  const reason = viemError.shortMessage ?? error.message;
  const lines = [
    `${isWrite ? "Write" : "Read"} ${functionName} failed`,
    `Reason: ${reason}`,
  ];

  if (viemError.details && viemError.details !== reason) {
    lines.push(`Details: ${viemError.details}`);
  }
  if (viemError.metaMessages?.length) {
    lines.push(...viemError.metaMessages);
  }
  if (viemError.docs) {
    lines.push(`Docs: ${viemError.docs}`);
  }

  return lines.join("\n");
};
