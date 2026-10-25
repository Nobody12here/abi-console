import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import toast from "react-hot-toast";
import { getAddress, isAddress } from "viem";
import type {
  AbiRevision,
  AbiSource,
  CodeInfo,
  ContractBinding,
  ImportedAbi,
  Settings,
  TxRecord,
  TxStatus,
  WorkspaceState,
} from "@/features/abi/types";
import { bindingId, defaultState, loadWorkspace, saveTheme, saveWorkspace } from "@/features/storage/workspace";
import { makeId } from "@/lib/format";
import { createReadClient } from "@/lib/rpc";
import { errorMessage } from "@/features/execution/errors";

type SaveContractInput = {
  name: string;
  chainId: number;
  address: string;
  revisionId: string;
  codeInfo?: CodeInfo;
};

type WorkspaceContextValue = {
  ready: boolean;
  bindings: ContractBinding[];
  revisions: AbiRevision[];
  txs: TxRecord[];
  settings: Settings;
  resolvedTheme: "dark" | "light";
  migrated: number;
  quarantined: number;
  getRevision: (id: string | undefined) => AbiRevision | undefined;
  getBinding: (id: string | undefined) => ContractBinding | undefined;
  revisionFor: (binding: ContractBinding | undefined) => AbiRevision | undefined;
  createRevision: (imported: ImportedAbi, source: AbiSource) => AbiRevision;
  saveContract: (input: SaveContractInput) => ContractBinding;
  updateBinding: (
    id: string,
    patch: Partial<Omit<ContractBinding, "id">>,
  ) => void;
  removeBinding: (id: string) => void;
  setActiveRevision: (id: string, revisionId: string) => void;
  touchBinding: (id: string) => void;
  addTx: (
    tx: Omit<TxRecord, "id" | "createdAt" | "updatedAt"> & { id?: string },
  ) => TxRecord;
  updateTx: (id: string, patch: Partial<TxRecord>) => void;
  clearTxs: (bindingId: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  exportData: () => WorkspaceState & { exportedAt: string };
  importData: (value: unknown) => {
    bindings: number;
    revisions: number;
    txs: number;
  };
  resetWorkspace: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function mergeUnique<T>(current: T[], incoming: T[], key: (item: T) => string): T[] {
  const seen = new Set(current.map(key));
  const merged = [...current];
  for (const item of incoming) {
    const itemKey = key(item);
    if (!seen.has(itemKey)) {
      seen.add(itemKey);
      merged.push(item);
    }
  }
  return merged;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>(() => defaultState());
  const stateRef = useRef(state);
  stateRef.current = state;
  const [ready, setReady] = useState(false);
  const [migrated, setMigrated] = useState(0);
  const [quarantined, setQuarantined] = useState(0);
  const [systemDark, setSystemDark] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
  });
  const started = useRef(false);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  /**
   * Apply a state transition and update the ref synchronously. Several actions
   * need to read the result immediately (for example creating a revision and
   * returning it to the import screen), so side effects inside a setState
   * updater are not sufficient.
   */
  const apply = useCallback(
    (updater: (current: WorkspaceState) => WorkspaceState): WorkspaceState => {
      const next = updater(stateRef.current);
      stateRef.current = next;
      setState(next);
      return next;
    },
    [],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void loadWorkspace()
      .then((result) => {
        setState(result.state);
        setMigrated(result.migrated);
        setQuarantined(result.quarantined);
        setReady(true);
        if (result.migrated > 0) {
          toast.success(`Imported ${result.migrated} legacy contract${result.migrated === 1 ? "" : "s"}.`);
        }
        if (result.quarantined > 0) {
          toast.error(`${result.quarantined} legacy contract${result.quarantined === 1 ? " was" : "s were"} skipped because the address or ABI was invalid.`);
        }
      })
      .catch((error: unknown) => {
        setReady(true);
        toast.error(`Could not load local workspace: ${errorMessage(error)}`);
      });
  }, []);

  useEffect(() => {
    if (!ready) return;
    writeQueue.current = writeQueue.current
      .then(() => saveWorkspace(state))
      .catch((error: unknown) => {
        toast.error(`Could not save workspace: ${errorMessage(error)}`);
      });
  }, [ready, state]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener?.("change", listener);
    return () => media.removeEventListener?.("change", listener);
  }, []);

  const resolvedTheme: "dark" | "light" =
    state.settings.theme === "system"
      ? systemDark
        ? "dark"
        : "light"
      : state.settings.theme;

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", resolvedTheme === "dark" ? "#141517" : "#ffffff");
    saveTheme(state.settings.theme);
  }, [resolvedTheme, state.settings.theme]);

  // Reconcile transactions left pending from a previous session.
  useEffect(() => {
    if (!ready) return;
    const pending = state.txs.filter(
      (tx) => tx.status === "pending" && tx.hash,
    );
    if (pending.length === 0) return;

    let cancelled = false;
    void (async () => {
      for (const tx of pending) {
        try {
          const client = createReadClient(tx.chainId, state.settings.rpcOverrides);
          const receipt = await client.getTransactionReceipt({ hash: tx.hash! });
          if (cancelled) return;
          setState((current) => ({
            ...current,
            txs: current.txs.map((entry) =>
              entry.id === tx.id && entry.status === "pending"
                ? {
                    ...entry,
                    status: receipt.status === "success" ? "confirmed" : "failed",
                    blockNumber: receipt.blockNumber.toString(),
                    gasUsed: receipt.gasUsed.toString(),
                    updatedAt: new Date().toISOString(),
                  }
                : entry,
            ),
          }));
        } catch {
          // A missing receipt is expected for a still-pending transaction.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Run once after hydration. Later transactions are reconciled by their sender.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const getRevision = useCallback(
    (id: string | undefined) =>
      id ? state.revisions.find((revision) => revision.id === id) : undefined,
    [state.revisions],
  );

  const getBinding = useCallback(
    (id: string | undefined) =>
      id ? state.bindings.find((binding) => binding.id === id) : undefined,
    [state.bindings],
  );

  const revisionFor = useCallback(
    (binding: ContractBinding | undefined) =>
      binding
        ? state.revisions.find(
            (revision) => revision.id === binding.activeRevisionId,
          )
        : undefined,
    [state.revisions],
  );

  const createRevision = useCallback(
    (imported: ImportedAbi, source: AbiSource): AbiRevision => {
      const existing = stateRef.current.revisions.find(
        (revision) => revision.hash === imported.hash,
      );
      if (existing) return existing;

      const revision: AbiRevision = {
        id: makeId(),
        hash: imported.hash,
        raw: imported.raw,
        abi: imported.abi,
        source,
        counts: imported.counts,
        warnings: imported.warnings,
        normalizerVersion: 1,
        createdAt: new Date().toISOString(),
      };
      apply((current) => ({
        ...current,
        revisions: [...current.revisions, revision],
      }));
      return revision;
    },
    [apply],
  );

  const saveContract = useCallback(
    (input: SaveContractInput): ContractBinding => {
      if (!isAddress(input.address)) {
        throw new Error("Enter a valid contract address.");
      }
      const address = getAddress(input.address);
      const id = bindingId(input.chainId, address);
      const now = new Date().toISOString();
      const existing = stateRef.current.bindings.find(
        (binding) => binding.id === id,
      );

      const saved: ContractBinding = existing
        ? {
            ...existing,
            name: input.name.trim() || existing.name,
            activeRevisionId: input.revisionId,
            revisionIds: existing.revisionIds.includes(input.revisionId)
              ? existing.revisionIds
              : [...existing.revisionIds, input.revisionId],
            codeInfo: input.codeInfo ?? existing.codeInfo,
            lastOpenedAt: now,
            updatedAt: now,
          }
        : {
            id,
            name: input.name.trim() || address,
            chainId: input.chainId,
            address,
            activeRevisionId: input.revisionId,
            revisionIds: [input.revisionId],
            codeInfo: input.codeInfo,
            lastOpenedAt: now,
            createdAt: now,
            updatedAt: now,
          };

      apply((current) => ({
        ...current,
        bindings: existing
          ? current.bindings.map((binding) =>
              binding.id === id ? saved : binding,
            )
          : [saved, ...current.bindings],
      }));

      return saved;
    },
    [apply],
  );

  const updateBinding = useCallback(
    (id: string, patch: Partial<Omit<ContractBinding, "id">>) => {
      apply((current) => ({
        ...current,
        bindings: current.bindings.map((binding) =>
          binding.id === id
            ? {
                ...binding,
                ...patch,
                updatedAt: new Date().toISOString(),
              }
            : binding,
        ),
      }));
    },
    [apply],
  );

  const removeBinding = useCallback(
    (id: string) => {
      apply((current) => {
        const bindings = current.bindings.filter((binding) => binding.id !== id);
        // Revisions are shared by hash, so keep any another contract still uses.
        const inUse = new Set(bindings.flatMap((binding) => binding.revisionIds));
        return {
          ...current,
          bindings,
          revisions: current.revisions.filter((revision) => inUse.has(revision.id)),
          txs: current.txs.filter((tx) => tx.contractId !== id),
        };
      });
    },
    [apply],
  );

  const setActiveRevision = useCallback(
    (id: string, revisionId: string) => {
      apply((current) => ({
        ...current,
        bindings: current.bindings.map((binding) =>
          binding.id === id
            ? {
                ...binding,
                activeRevisionId: revisionId,
                revisionIds: binding.revisionIds.includes(revisionId)
                  ? binding.revisionIds
                  : [...binding.revisionIds, revisionId],
                updatedAt: new Date().toISOString(),
              }
            : binding,
        ),
      }));
    },
    [apply],
  );

  const touchBinding = useCallback(
    (id: string) => {
      apply((current) => ({
        ...current,
        bindings: current.bindings.map((binding) =>
          binding.id === id
            ? { ...binding, lastOpenedAt: new Date().toISOString() }
            : binding,
        ),
      }));
    },
    [apply],
  );

  const addTx = useCallback(
    (
      input: Omit<TxRecord, "id" | "createdAt" | "updatedAt"> & { id?: string },
    ): TxRecord => {
      const now = new Date().toISOString();
      const tx: TxRecord = {
        ...input,
        id: input.id ?? makeId(),
        createdAt: now,
        updatedAt: now,
      };
      apply((current) => ({
        ...current,
        txs: [tx, ...current.txs],
      }));
      return tx;
    },
    [apply],
  );

  const updateTx = useCallback(
    (id: string, patch: Partial<TxRecord>) => {
      apply((current) => ({
        ...current,
        txs: current.txs.map((tx) =>
          tx.id === id
            ? { ...tx, ...patch, updatedAt: new Date().toISOString() }
            : tx,
        ),
      }));
    },
    [apply],
  );

  const clearTxs = useCallback(
    (contractId: string) => {
      apply((current) => ({
        ...current,
        txs: current.txs.filter((tx) => tx.contractId !== contractId),
      }));
    },
    [apply],
  );

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      apply((current) => ({
        ...current,
        settings: {
          ...current.settings,
          ...patch,
          rpcOverrides: patch.rpcOverrides
            ? { ...patch.rpcOverrides }
            : current.settings.rpcOverrides,
        },
      }));
    },
    [apply],
  );

  const exportData = useCallback(
    (): WorkspaceState & { exportedAt: string } => ({
      ...state,
      settings: { ...state.settings, etherscanKey: "" },
      exportedAt: new Date().toISOString(),
    }),
    [state],
  );

  const importData = useCallback((value: unknown) => {
    if (!value || typeof value !== "object") {
      throw new Error("The selected file is not an ABI Console export.");
    }
    const bundle = value as Partial<WorkspaceState>;
    if (bundle.version !== 2) {
      throw new Error("Unsupported workspace export version.");
    }
    if (
      !Array.isArray(bundle.bindings) ||
      !Array.isArray(bundle.revisions)
    ) {
      throw new Error("The export is missing contracts or ABI revisions.");
    }

    const counts = {
      bindings: 0,
      revisions: 0,
      txs: 0,
    };

    apply((current) => {
      const revisions = mergeUnique(
        current.revisions,
        bundle.revisions as AbiRevision[],
        (revision) => revision.hash,
      );
      const bindings = mergeUnique(
        current.bindings,
        bundle.bindings as ContractBinding[],
        (binding) => binding.id,
      );
      const txs = mergeUnique(
        current.txs,
        Array.isArray(bundle.txs) ? (bundle.txs as TxRecord[]) : [],
        (tx) => tx.id,
      );
      counts.revisions = revisions.length - current.revisions.length;
      counts.bindings = bindings.length - current.bindings.length;
      counts.txs = txs.length - current.txs.length;

      return {
        ...current,
        revisions,
        bindings,
        txs,
        settings: current.settings,
      };
    });

    return counts;
  }, [apply]);

  const resetWorkspace = useCallback(() => {
    apply(() => defaultState());
    toast.success("Local workspace cleared.");
  }, [apply]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      ready,
      bindings: state.bindings,
      revisions: state.revisions,
      txs: state.txs,
      settings: state.settings,
      resolvedTheme,
      migrated,
      quarantined,
      getRevision,
      getBinding,
      revisionFor,
      createRevision,
      saveContract,
      updateBinding,
      removeBinding,
      setActiveRevision,
      touchBinding,
      addTx,
      updateTx,
      clearTxs,
      updateSettings,
      exportData,
      importData,
      resetWorkspace,
    }),
    [
      ready,
      state.bindings,
      state.revisions,
      state.txs,
      state.settings,
      resolvedTheme,
      migrated,
      quarantined,
      getRevision,
      getBinding,
      revisionFor,
      createRevision,
      saveContract,
      updateBinding,
      removeBinding,
      setActiveRevision,
      touchBinding,
      addTx,
      updateTx,
      clearTxs,
      updateSettings,
      exportData,
      importData,
      resetWorkspace,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider.");
  }
  return context;
}

export type { TxStatus };
