import { getAddress } from "viem";
import type {
  AbiRevision,
  AbiSource,
  CodeInfo,
  ContractBinding,
  ImportedAbi,
  Workspace,
  WorkspaceState,
} from "@/features/abi/types";
import { makeId } from "@/lib/format";
import { bindingId } from "./ids";
import { uniqueWorkspaceName, workspaceNames } from "./workspaces";

export type ProjectImportEntry = {
  name: string;
  address: string;
  imported: ImportedAbi;
  source: AbiSource;
  codeInfo?: CodeInfo;
};

export type ProjectImportInput = {
  /** Desired workspace name; made unique if it is already taken. */
  name: string;
  chainId: number;
  entries: ProjectImportEntry[];
};

export type ProjectImportResult = {
  workspaceId: string;
  workspaceName: string;
  added: number;
};

/**
 * Every project import gets its own new workspace and becomes the active one,
 * in a single state transition. Nothing in other workspaces is touched, even
 * if the same address is already saved there.
 */
export function applyProjectImport(
  state: WorkspaceState,
  input: ProjectImportInput,
): { state: WorkspaceState; result: ProjectImportResult } {
  const now = new Date().toISOString();

  const workspace: Workspace = {
    id: makeId(),
    name: uniqueWorkspaceName(input.name, workspaceNames(state)),
    createdAt: now,
  };

  const revisions = [...state.revisions];
  const revisionByHash = new Map(revisions.map((rev) => [rev.hash, rev]));
  const created: ContractBinding[] = [];
  const seen = new Set<string>();

  for (const entry of input.entries) {
    const address = getAddress(entry.address);
    const id = bindingId(input.chainId, address, workspace.id);
    if (seen.has(id)) continue;
    seen.add(id);

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

    created.push({
      id,
      name: entry.name.trim() || address,
      chainId: input.chainId,
      address,
      activeRevisionId: revision.id,
      revisionIds: [revision.id],
      codeInfo: entry.codeInfo,
      workspaceId: workspace.id,
      lastOpenedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  return {
    state: {
      ...state,
      workspaces: [...state.workspaces, workspace],
      revisions,
      bindings: [...created, ...state.bindings],
      settings: { ...state.settings, activeWorkspaceId: workspace.id },
    },
    result: {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      added: created.length,
    },
  };
}
