import { createStore, del, get, set } from "idb-keyval";
import { getAddress, isAddress } from "viem";
import { normalizeAbi } from "@/features/abi/normalize";
import type {
  AbiRevision,
  ContractBinding,
  Settings,
  ThemeMode,
  WorkspaceState,
} from "@/features/abi/types";
import { makeId } from "@/lib/format";

const store = createStore("abiconsole", "workspace-v2");
const STATE_KEY = "state";
const FALLBACK_KEY = "abiconsole:v2:state";
const LEGACY_KEY = "abi-console-contracts";
const MIGRATION_FLAG = "abiconsole:v2:migrated";
const QUARANTINE_KEY = "abiconsole:v2:quarantine";
export const THEME_KEY = "abiconsole:theme";

export type LoadResult = {
  state: WorkspaceState;
  migrated: number;
  quarantined: number;
};

export function defaultSettings(): Settings {
  const storedTheme =
    typeof localStorage !== "undefined"
      ? localStorage.getItem(THEME_KEY)
      : null;
  const theme: ThemeMode =
    storedTheme === "light" || storedTheme === "dark" || storedTheme === "system"
      ? storedTheme
      : "dark";

  return {
    theme,
    lastChainId: undefined,
    rpcOverrides: {},
    etherscanKey: "",
    rememberArgs: true,
    confirmValueThresholdWei: "0",
  };
}

export function defaultState(): WorkspaceState {
  return {
    version: 2,
    bindings: [],
    revisions: [],
    txs: [],
    settings: defaultSettings(),
  };
}

export function bindingId(chainId: number, address: string): string {
  return `${chainId}:${getAddress(address)}`;
}

function hydrateState(value: unknown): WorkspaceState {
  if (!value || typeof value !== "object") return defaultState();
  const candidate = value as Partial<WorkspaceState>;
  if (candidate.version !== 2) return defaultState();
  return {
    version: 2,
    bindings: Array.isArray(candidate.bindings) ? candidate.bindings : [],
    revisions: Array.isArray(candidate.revisions) ? candidate.revisions : [],
    txs: Array.isArray(candidate.txs) ? candidate.txs : [],
    settings: {
      ...defaultSettings(),
      ...(candidate.settings ?? {}),
      rpcOverrides: {
        ...(candidate.settings?.rpcOverrides ?? {}),
      },
    },
  };
}

function migrateLegacy(): {
  revisions: AbiRevision[];
  bindings: ContractBinding[];
  quarantined: number;
} {
  const revisions: AbiRevision[] = [];
  const bindings: ContractBinding[] = [];
  let quarantined = 0;

  let parsed: unknown;
  try {
    parsed = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "[]");
  } catch {
    parsed = [];
  }

  if (!Array.isArray(parsed)) {
    return { revisions, bindings, quarantined };
  }

  const quarantine: unknown[] = [];

  for (const entry of parsed) {
    try {
      if (!entry || typeof entry !== "object") throw new Error("Invalid entry");
      const record = entry as Record<string, unknown>;
      const chainId = Number(record.networkId);
      const address = String(record.address ?? "");
      if (!Number.isFinite(chainId) || !isAddress(address)) {
        throw new Error("Invalid chain or address");
      }

      const imported = normalizeAbi(record.abi);
      const now = new Date().toISOString();
      const revision: AbiRevision = {
        id: makeId(),
        hash: imported.hash,
        raw: imported.raw,
        abi: imported.abi,
        source: { kind: "legacy" },
        counts: imported.counts,
        warnings: imported.warnings,
        normalizerVersion: 1,
        createdAt: now,
      };
      const binding: ContractBinding = {
        id: bindingId(chainId, address),
        name:
          typeof record.name === "string" && record.name.trim()
            ? record.name.trim()
            : address,
        chainId,
        address: getAddress(address),
        activeRevisionId: revision.id,
        revisionIds: [revision.id],
        lastOpenedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      if (!bindings.some((item) => item.id === binding.id)) {
        revisions.push(revision);
        bindings.push(binding);
      }
    } catch {
      quarantined += 1;
      quarantine.push(entry);
    }
  }

  if (quarantine.length > 0) {
    try {
      localStorage.setItem(QUARANTINE_KEY, JSON.stringify(quarantine));
    } catch {
      // Quarantine is a best-effort convenience.
    }
  }

  try {
    localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
  } catch {
    // Continue; migration will simply be retried next time.
  }

  return { revisions, bindings, quarantined };
}

async function readState(): Promise<unknown> {
  try {
    const value = await get<unknown>(STATE_KEY, store);
    if (value !== undefined) return value;
  } catch {
    // IndexedDB can be unavailable in private or hardened contexts.
  }

  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (raw) return JSON.parse(raw) as unknown;
  } catch {
    // Fall through to defaults.
  }

  return undefined;
}

export async function loadWorkspace(): Promise<LoadResult> {
  const stored = await readState();
  if (stored !== undefined) {
    return {
      state: hydrateState(stored),
      migrated: 0,
      quarantined: 0,
    };
  }

  const alreadyMigrated =
    typeof localStorage !== "undefined" &&
    localStorage.getItem(MIGRATION_FLAG) !== null;

  if (!alreadyMigrated && typeof localStorage !== "undefined") {
    const legacy = migrateLegacy();
    if (legacy.bindings.length > 0) {
      const state: WorkspaceState = {
        ...defaultState(),
        bindings: legacy.bindings,
        revisions: legacy.revisions,
      };
      await saveWorkspace(state);
      return {
        state,
        migrated: legacy.bindings.length,
        quarantined: legacy.quarantined,
      };
    }
    return {
      state: defaultState(),
      migrated: 0,
      quarantined: legacy.quarantined,
    };
  }

  return { state: defaultState(), migrated: 0, quarantined: 0 };
}

export async function saveWorkspace(state: WorkspaceState): Promise<void> {
  const serializable = {
    ...state,
    version: 2 as const,
  };

  try {
    await set(STATE_KEY, serializable, store);
    return;
  } catch {
    // Try the localStorage fallback below.
  }

  localStorage.setItem(FALLBACK_KEY, JSON.stringify(serializable));
}

export async function clearWorkspaceStorage(): Promise<void> {
  try {
    await del(STATE_KEY, store);
  } catch {
    // Ignore and clear the fallback.
  }
  localStorage.removeItem(FALLBACK_KEY);
  localStorage.removeItem(QUARANTINE_KEY);
}

export function saveTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Theme persistence is optional.
  }
}
