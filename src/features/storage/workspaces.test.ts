import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import type {
  ContractBinding,
  TxRecord,
  WorkspaceState,
} from "@/features/abi/types";
import { bindingId, DEFAULT_WORKSPACE_ID } from "./ids";
import {
  allWorkspaces,
  migrateProjects,
  removeWorkspace,
  renameWorkspace,
  resolveActiveWorkspaceId,
  uniqueWorkspaceName,
} from "./workspaces";

const ADDR = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

const binding = (over: Partial<ContractBinding> = {}): ContractBinding => ({
  id: bindingId(11155111, ADDR),
  name: "Token",
  chainId: 11155111,
  address: getAddress(ADDR),
  activeRevisionId: "rev1",
  revisionIds: ["rev1"],
  lastOpenedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const tx = (contractId: string): TxRecord =>
  ({ id: `tx-${contractId}`, contractId }) as TxRecord;

const state = (over: Partial<WorkspaceState> = {}): WorkspaceState => ({
  version: 2,
  bindings: [],
  revisions: [],
  txs: [],
  workspaces: [],
  settings: {
    theme: "dark",
    rpcOverrides: {},
    etherscanKey: "",
    rememberArgs: true,
    confirmValueThresholdWei: "0",
  },
  ...over,
});

describe("bindingId", () => {
  it("keeps the original id for the default workspace and prefixes others", () => {
    expect(bindingId(1, ADDR)).toBe(`1:${getAddress(ADDR)}`);
    expect(bindingId(1, ADDR, DEFAULT_WORKSPACE_ID)).toBe(bindingId(1, ADDR));
    expect(bindingId(1, ADDR, "ws1")).toBe(`ws1:1:${getAddress(ADDR)}`);
  });
});

describe("uniqueWorkspaceName", () => {
  it("appends a number only when the name is taken", () => {
    expect(uniqueWorkspaceName("app", [])).toBe("app");
    expect(uniqueWorkspaceName("app", ["App"])).toBe("app (2)");
    expect(uniqueWorkspaceName("app", ["app", "app (2)"])).toBe("app (3)");
    expect(uniqueWorkspaceName("  ", [])).toBe("Foundry project");
  });
});

describe("resolveActiveWorkspaceId", () => {
  it("defaults, and ignores a workspace that no longer exists", () => {
    const withWs = state({
      workspaces: [{ id: "ws1", name: "A", createdAt: "" }],
    });
    expect(resolveActiveWorkspaceId(withWs)).toBe(DEFAULT_WORKSPACE_ID);
    expect(
      resolveActiveWorkspaceId({
        ...withWs,
        settings: { ...withWs.settings, activeWorkspaceId: "ws1" },
      }),
    ).toBe("ws1");
    expect(
      resolveActiveWorkspaceId({
        ...withWs,
        settings: { ...withWs.settings, activeWorkspaceId: "gone" },
      }),
    ).toBe(DEFAULT_WORKSPACE_ID);
  });

  it("lists the default workspace first", () => {
    const list = allWorkspaces(
      state({ workspaces: [{ id: "ws1", name: "A", createdAt: "" }] }),
    );
    expect(list.map((item) => item.id)).toEqual([DEFAULT_WORKSPACE_ID, "ws1"]);
  });
});

describe("migrateProjects", () => {
  it("moves project-labelled contracts into a workspace per label", () => {
    const legacy = binding({ project: "contracts" });
    const other = binding({
      id: bindingId(11155111, OTHER),
      address: getAddress(OTHER),
      project: "contracts",
    });
    const plain = binding({
      id: bindingId(1, ADDR),
      chainId: 1,
    });
    const migrated = migrateProjects(
      state({
        bindings: [legacy, other, plain],
        txs: [tx(legacy.id), tx(plain.id)],
      }),
    );

    expect(migrated.workspaces).toHaveLength(1);
    expect(migrated.workspaces[0].name).toBe("contracts");
    const workspaceId = migrated.workspaces[0].id;

    const moved = migrated.bindings.filter((item) => item.workspaceId === workspaceId);
    expect(moved).toHaveLength(2);
    expect(moved.every((item) => item.project === undefined)).toBe(true);
    expect(moved[0].id).toBe(bindingId(11155111, ADDR, workspaceId));
    // History follows the contract to its new id; unrelated history is kept.
    expect(migrated.txs[0].contractId).toBe(moved[0].id);
    expect(migrated.txs[1].contractId).toBe(plain.id);
    // Unlabelled contracts stay in the default workspace.
    expect(migrated.bindings.find((item) => item.id === plain.id)?.workspaceId).toBeUndefined();
  });

  it("is idempotent and leaves modern data alone", () => {
    const once = migrateProjects(state({ bindings: [binding({ project: "p" })] }));
    expect(migrateProjects(once)).toBe(once);
    const untouched = state({ bindings: [binding()] });
    expect(migrateProjects(untouched)).toBe(untouched);
  });
});

describe("removeWorkspace / renameWorkspace", () => {
  const withWorkspace = () => {
    const inWs = binding({
      id: bindingId(11155111, ADDR, "ws1"),
      workspaceId: "ws1",
      revisionIds: ["rev-ws"],
      activeRevisionId: "rev-ws",
    });
    const inDefault = binding({
      id: bindingId(11155111, OTHER),
      address: getAddress(OTHER),
      revisionIds: ["rev-default"],
      activeRevisionId: "rev-default",
    });
    return state({
      workspaces: [{ id: "ws1", name: "Project", createdAt: "" }],
      bindings: [inWs, inDefault],
      revisions: [{ id: "rev-ws" }, { id: "rev-default" }] as never,
      txs: [tx(inWs.id), tx(inDefault.id)],
      settings: { ...state().settings, activeWorkspaceId: "ws1" },
    });
  };

  it("deletes a workspace with its contracts, history, and unused ABIs", () => {
    const next = removeWorkspace(withWorkspace(), "ws1");
    expect(next.workspaces).toEqual([]);
    expect(next.bindings.map((item) => item.revisionIds[0])).toEqual(["rev-default"]);
    expect(next.revisions.map((item) => item.id)).toEqual(["rev-default"]);
    expect(next.txs).toHaveLength(1);
    expect(next.settings.activeWorkspaceId).toBeUndefined();
  });

  it("never deletes the default workspace", () => {
    const base = withWorkspace();
    expect(removeWorkspace(base, DEFAULT_WORKSPACE_ID)).toBe(base);
  });

  it("renames, keeping names unique and ignoring blanks", () => {
    const base = withWorkspace();
    expect(renameWorkspace(base, "ws1", " Renamed ").workspaces[0].name).toBe("Renamed");
    expect(renameWorkspace(base, "ws1", "my contracts").workspaces[0].name).toBe("my contracts (2)");
    expect(renameWorkspace(base, "ws1", "   ")).toBe(base);
    expect(renameWorkspace(base, DEFAULT_WORKSPACE_ID, "x")).toBe(base);
  });
});
