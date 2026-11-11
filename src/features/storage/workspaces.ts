import type {
  ContractBinding,
  Workspace,
  WorkspaceState,
} from "@/features/abi/types";
import { makeId } from "@/lib/format";
import { bindingId, DEFAULT_WORKSPACE_ID } from "./ids";

export { DEFAULT_WORKSPACE_ID };
export const DEFAULT_WORKSPACE_NAME = "My contracts";

export function bindingWorkspaceId(binding: ContractBinding): string {
  return binding.workspaceId ?? DEFAULT_WORKSPACE_ID;
}

/** The default workspace first, then the ones created by imports. */
export function allWorkspaces(state: Pick<WorkspaceState, "workspaces">): Workspace[] {
  return [
    { id: DEFAULT_WORKSPACE_ID, name: DEFAULT_WORKSPACE_NAME, createdAt: "" },
    ...state.workspaces,
  ];
}

/** Falls back to the default workspace if the saved choice no longer exists. */
export function resolveActiveWorkspaceId(
  state: Pick<WorkspaceState, "workspaces" | "settings">,
): string {
  const wanted = state.settings.activeWorkspaceId;
  return wanted && state.workspaces.some((workspace) => workspace.id === wanted)
    ? wanted
    : DEFAULT_WORKSPACE_ID;
}

/** "contracts" -> "contracts (2)" when that name is taken (case-insensitive). */
export function uniqueWorkspaceName(
  desired: string,
  existingNames: readonly string[],
): string {
  const base = desired.trim() || "Foundry project";
  const taken = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

export function workspaceNames(
  state: Pick<WorkspaceState, "workspaces">,
): string[] {
  return allWorkspaces(state).map((workspace) => workspace.name);
}

/**
 * Contracts saved before workspaces existed may carry a `project` label.
 * Give each label its own workspace and move its contracts (and their
 * transaction history) there. Safe to run repeatedly.
 */
export function migrateProjects(state: WorkspaceState): WorkspaceState {
  if (!state.bindings.some((binding) => binding.project && !binding.workspaceId)) {
    return state;
  }

  const workspaces = [...state.workspaces];
  const byName = new Map(
    workspaces.map((workspace) => [workspace.name.toLowerCase(), workspace]),
  );
  const renamed = new Map<string, string>();

  const bindings = state.bindings.map((binding) => {
    if (!binding.project || binding.workspaceId) return binding;

    const key = binding.project.trim().toLowerCase();
    let workspace = byName.get(key);
    if (!workspace) {
      workspace = {
        id: makeId(),
        name: uniqueWorkspaceName(binding.project, workspaceNames({ workspaces })),
        createdAt: binding.createdAt,
      };
      workspaces.push(workspace);
      byName.set(key, workspace);
    }

    const { project: _legacy, ...rest } = binding;
    const id = bindingId(binding.chainId, binding.address, workspace.id);
    renamed.set(binding.id, id);
    return { ...rest, id, workspaceId: workspace.id };
  });

  return {
    ...state,
    workspaces,
    bindings,
    txs: state.txs.map((tx) =>
      renamed.has(tx.contractId)
        ? { ...tx, contractId: renamed.get(tx.contractId)! }
        : tx,
    ),
  };
}

/** Remove a workspace with its contracts, their history, and unused ABIs. */
export function removeWorkspace(
  state: WorkspaceState,
  workspaceId: string,
): WorkspaceState {
  if (workspaceId === DEFAULT_WORKSPACE_ID) return state;

  const bindings = state.bindings.filter(
    (binding) => bindingWorkspaceId(binding) !== workspaceId,
  );
  const removedIds = new Set(
    state.bindings
      .filter((binding) => bindingWorkspaceId(binding) === workspaceId)
      .map((binding) => binding.id),
  );
  // ABI revisions are shared by hash, so keep any another contract still uses.
  const inUse = new Set(bindings.flatMap((binding) => binding.revisionIds));

  return {
    ...state,
    workspaces: state.workspaces.filter((workspace) => workspace.id !== workspaceId),
    bindings,
    revisions: state.revisions.filter((revision) => inUse.has(revision.id)),
    txs: state.txs.filter((tx) => !removedIds.has(tx.contractId)),
    settings:
      state.settings.activeWorkspaceId === workspaceId
        ? { ...state.settings, activeWorkspaceId: undefined }
        : state.settings,
  };
}

export function renameWorkspace(
  state: WorkspaceState,
  workspaceId: string,
  name: string,
): WorkspaceState {
  const trimmed = name.trim();
  if (!trimmed || workspaceId === DEFAULT_WORKSPACE_ID) return state;
  const others = allWorkspaces(state)
    .filter((workspace) => workspace.id !== workspaceId)
    .map((workspace) => workspace.name);
  const finalName = uniqueWorkspaceName(trimmed, others);
  return {
    ...state,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === workspaceId ? { ...workspace, name: finalName } : workspace,
    ),
  };
}
