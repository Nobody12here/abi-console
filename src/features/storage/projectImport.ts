import { getAddress } from "viem";
import type {
  AbiRevision,
  AbiSource,
  CodeInfo,
  ContractBinding,
  ImportedAbi,
  WorkspaceState,
} from "@/features/abi/types";
import { makeId } from "@/lib/format";
import { bindingId } from "./ids";

export type ProjectImportEntry = {
  name: string;
  address: string;
  imported: ImportedAbi;
  source: AbiSource;
  codeInfo?: CodeInfo;
};

export type ProjectImportInput = {
  /** Group label; empty or undefined leaves contracts ungrouped. */
  project?: string;
  chainId: number;
  entries: ProjectImportEntry[];
};

export type ProjectImportResult = {
  added: number;
  updated: number;
  unchanged: number;
};

/**
 * Save many contracts in one state transition. Existing contracts keep their
 * name (the user may have renamed them) and get the new ABI as a new revision.
 */
export function applyProjectImport(
  state: WorkspaceState,
  input: ProjectImportInput,
): { state: WorkspaceState; result: ProjectImportResult } {
  const now = new Date().toISOString();
  const project = input.project?.trim() || undefined;
  const result: ProjectImportResult = { added: 0, updated: 0, unchanged: 0 };

  const revisions = [...state.revisions];
  const revisionByHash = new Map(revisions.map((rev) => [rev.hash, rev]));
  const bindings = new Map(state.bindings.map((binding) => [binding.id, binding]));
  const created: ContractBinding[] = [];

  for (const entry of input.entries) {
    const address = getAddress(entry.address);
    const id = bindingId(input.chainId, address);

    let revision = revisionByHash.get(entry.imported.hash);
    if (!revision) {
      revision = {
        id: makeId(),
        hash: entry.imported.hash,
        raw: entry.imported.raw,
        abi: entry.imported.abi,
        source: entry.source,
        counts: entry.imported.counts,
        warnings: entry.imported.warnings,
        normalizerVersion: 1,
        createdAt: now,
      } satisfies AbiRevision;
      revisions.push(revision);
      revisionByHash.set(revision.hash, revision);
    }

    const existing = bindings.get(id);
    if (existing) {
      const nextProject = project ?? existing.project;
      if (
        existing.activeRevisionId === revision.id &&
        existing.project === nextProject
      ) {
        result.unchanged += 1;
        continue;
      }
      bindings.set(id, {
        ...existing,
        activeRevisionId: revision.id,
        revisionIds: existing.revisionIds.includes(revision.id)
          ? existing.revisionIds
          : [...existing.revisionIds, revision.id],
        project: nextProject,
        updatedAt: now,
      });
      result.updated += 1;
    } else {
      const binding: ContractBinding = {
        id,
        name: entry.name.trim() || address,
        chainId: input.chainId,
        address,
        activeRevisionId: revision.id,
        revisionIds: [revision.id],
        codeInfo: entry.codeInfo,
        project,
        lastOpenedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      bindings.set(id, binding);
      created.push(binding);
      result.added += 1;
    }
  }

  const createdIds = new Set(created.map((binding) => binding.id));
  const next: WorkspaceState = {
    ...state,
    revisions,
    // New contracts first, in deployment order, then everything that was there.
    bindings: [
      ...created,
      ...[...bindings.values()].filter((binding) => !createdIds.has(binding.id)),
    ],
  };
  return { state: next, result };
}
