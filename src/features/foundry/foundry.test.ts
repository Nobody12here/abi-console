import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { normalizeAbi } from "@/features/abi/normalize";
import type { WorkspaceState } from "@/features/abi/types";
import { applyProjectImport } from "@/features/storage/projectImport";
import { mergeDeployments, parseBroadcast, readDeployments } from "./broadcast";
import { fsDirFromFileList, type FsDir, type FsNode } from "./fs";
import {
  buildPlan,
  disambiguateNames,
  importStatus,
  loadArtifact,
  pickArtifact,
} from "./plan";
import {
  contractNameFromFile,
  parseOutDir,
  ProjectError,
  scanProject,
} from "./project";

const SEPOLIA = 11155111;

const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";
const C = "0x3333333333333333333333333333333333333333";
const D = "0x4444444444444444444444444444444444444444";
const HASH = `0x${"ab".repeat(32)}`;

type Tree = { [name: string]: string | Tree };

/** Build an in-memory folder; string values are file contents. */
function mem(name: string, tree: Tree): FsDir {
  return {
    kind: "directory",
    name,
    children: async () =>
      Object.entries(tree).map(([childName, value]): FsNode =>
        typeof value === "string"
          ? { kind: "file", name: childName, text: async () => value }
          : mem(childName, value),
      ),
  };
}

const tokenAbi = [
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
];

const artifact = (source: string, abi: unknown[] = tokenAbi) =>
  JSON.stringify({ abi, ast: { absolutePath: source } });

const broadcast = (transactions: unknown[], timestamp = 1_700_000_000_000) =>
  JSON.stringify({ transactions, chain: SEPOLIA, timestamp });

const create = (contractName: string | null, contractAddress: string) => ({
  hash: HASH,
  transactionType: "CREATE",
  contractName,
  contractAddress,
});

function project(overrides: Tree = {}): FsDir {
  return mem("my-protocol", {
    "foundry.toml": '[profile.default]\nsrc = "src"\nout = "out"\n',
    broadcast: {
      "Deploy.s.sol": {
        [SEPOLIA]: {
          "run-latest.json": broadcast([
            create("Token", A),
            create("Vault", B),
            { hash: HASH, transactionType: "CALL", contractName: "Vault", contractAddress: C },
          ]),
          "run-1700000000.json": broadcast([create("Old", D)]),
          "dry-run": { "run-latest.json": broadcast([create("Dry", D)]) },
        },
        "84532": { "run-latest.json": broadcast([create("Token", A)]) },
      },
    },
    out: {
      "Token.sol": { "Token.json": artifact("src/Token.sol") },
      "Vault.sol": { "Vault.json": artifact("src/Vault.sol") },
      "build-info": { "x.json": "{}" },
    },
    lib: { "forge-std": { "never-read.txt": "x" } },
    ...overrides,
  });
}

describe("parseOutDir / contractNameFromFile", () => {
  it("reads out from foundry.toml and defaults to out", () => {
    expect(parseOutDir('out = "build/artifacts/"')).toBe("build/artifacts");
    expect(parseOutDir("[profile.default]\nsrc = 'src'")).toBe("out");
    expect(parseOutDir(undefined)).toBe("out");
  });

  it("strips compiler-version suffixes", () => {
    expect(contractNameFromFile("Vault.json")).toBe("Vault");
    expect(contractNameFromFile("Vault.0.8.20.json")).toBe("Vault");
  });
});

describe("parseBroadcast", () => {
  it("keeps CREATE and CREATE2 and ignores calls", () => {
    const found = parseBroadcast(
      JSON.parse(
        broadcast([
          create("Token", A),
          { ...create("Salted", B), transactionType: "CREATE2" },
          { hash: HASH, transactionType: "CALL", contractAddress: C },
        ]),
      ),
      "Deploy.s.sol",
    );
    expect(found.map((item) => [item.contractName, item.address])).toEqual([
      ["Token", getAddress(A)],
      ["Salted", getAddress(B)],
    ]);
  });

  it("reports factory-created contracts without a name", () => {
    const found = parseBroadcast(
      JSON.parse(
        broadcast([
          {
            hash: HASH,
            transactionType: "CALL",
            additionalContracts: [{ transactionType: "CREATE", address: C }],
          },
        ]),
      ),
      "Deploy.s.sol",
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ address: getAddress(C), nested: true });
    expect(found[0].contractName).toBeUndefined();
  });

  it("skips invalid addresses, accepts qualified names, and tolerates junk", () => {
    const found = parseBroadcast(
      JSON.parse(
        broadcast([
          create("Bad", "0x1234"),
          create("src/Vault.sol:Vault", B),
          null,
          "nope",
        ]),
      ),
      "Deploy.s.sol",
    );
    expect(found.map((item) => item.contractName)).toEqual(["Vault"]);
    expect(parseBroadcast(null, "x")).toEqual([]);
    expect(parseBroadcast({ transactions: "no" }, "x")).toEqual([]);
  });

  it("normalises second timestamps to milliseconds", () => {
    const [found] = parseBroadcast(
      { transactions: [create("T", A)], timestamp: 1_700_000_000 },
      "s",
    );
    expect(found.timestamp).toBe(1_700_000_000_000);
  });
});

describe("mergeDeployments", () => {
  it("keeps the newest record per address and fills a missing name", () => {
    const older = parseBroadcast(
      { transactions: [create("Token", A)], timestamp: 1_000_000_000_000 },
      "Old.s.sol",
    );
    const newer = parseBroadcast(
      { transactions: [create(null, A), create("Vault", B)], timestamp: 2_000_000_000_000 },
      "New.s.sol",
    );
    const merged = mergeDeployments([...older, ...newer]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      address: getAddress(A),
      script: "New.s.sol",
      contractName: "Token",
    });
  });

  it("orders by time, then by position in the file", () => {
    const merged = mergeDeployments(
      parseBroadcast(
        { transactions: [create("First", A), create("Second", B)], timestamp: 5e12 },
        "s",
      ),
    );
    expect(merged.map((item) => item.contractName)).toEqual(["First", "Second"]);
  });
});

describe("scanProject", () => {
  it("finds only the target chain's latest run and indexes artifacts", async () => {
    const scan = await scanProject(project(), SEPOLIA);
    expect(scan.name).toBe("my-protocol");
    expect(scan.broadcasts.map((item) => item.script)).toEqual(["Deploy.s.sol"]);
    expect(scan.otherChains).toEqual([84532]);
    expect([...scan.artifactsByName.keys()].sort()).toEqual(["Token", "Vault"]);
    expect(scan.artifactsByName.get("Vault")?.[0].path).toBe("out/Vault.sol/Vault.json");

    const { deployments } = await readDeployments(scan);
    // The CALL, the timestamped history, and dry-run/ are all ignored.
    expect(deployments.map((item) => item.contractName)).toEqual(["Token", "Vault"]);
  });

  it("follows a custom out directory", async () => {
    const scan = await scanProject(
      project({
        "foundry.toml": 'out = "build/out"',
        out: {},
        build: { out: { "Token.sol": { "Token.json": artifact("src/Token.sol") } } },
      }),
      SEPOLIA,
    );
    expect(scan.artifacts[0].path).toBe("build/out/Token.sol/Token.json");
  });

  it("explains a missing broadcast folder and a non-Foundry folder", async () => {
    await expect(
      scanProject(mem("p", { "foundry.toml": "", out: {} }), SEPOLIA),
    ).rejects.toMatchObject({ code: "no-broadcast" });
    await expect(
      scanProject(mem("p", { "README.md": "hi" }), SEPOLIA),
    ).rejects.toBeInstanceOf(ProjectError);
  });

  it("does not open lib/", async () => {
    let opened = false;
    const root = project();
    const original = root.children;
    root.children = async () =>
      (await original()).map((node) =>
        node.name === "lib" && node.kind === "directory"
          ? {
              ...node,
              children: async () => {
                opened = true;
                return [];
              },
            }
          : node,
      );
    await scanProject(root, SEPOLIA);
    expect(opened).toBe(false);
  });
});

describe("buildPlan", () => {
  it("matches ABIs and reports missing artifacts and empty ABIs", async () => {
    const root = project({
      broadcast: {
        "Deploy.s.sol": {
          [SEPOLIA]: {
            "run-latest.json": broadcast([
              create("Token", A),
              create("Ghost", B),
              create("MathLib", C),
            ]),
          },
        },
      },
      out: {
        "Token.sol": { "Token.json": artifact("src/Token.sol") },
        "MathLib.sol": { "MathLib.json": artifact("src/MathLib.sol", []) },
      },
    });
    const scan = await scanProject(root, SEPOLIA);
    const { deployments } = await readDeployments(scan);
    const rows = await buildPlan(scan, deployments);

    const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
    expect(byName.Token.abi?.counts.functions).toBe(1);
    expect(byName.Ghost.abi).toBeUndefined();
    expect(byName.Ghost.abiError).toMatch(/forge build/);
    expect(byName.MathLib.abiError).toMatch(/empty/i);
  });

  it("offers every artifact for contracts Foundry did not name", async () => {
    const root = project({
      broadcast: {
        "Deploy.s.sol": {
          [SEPOLIA]: { "run-latest.json": broadcast([create(null, A)]) },
        },
      },
    });
    const scan = await scanProject(root, SEPOLIA);
    const { deployments } = await readDeployments(scan);
    const [row] = await buildPlan(scan, deployments);
    expect(row.artifact).toBeUndefined();
    expect(row.candidates.map((ref) => ref.name)).toEqual(["Token", "Vault"]);

    const result = await loadArtifact(row.candidates[0]);
    expect("imported" in result).toBe(true);
  });

  it("prefers the src/ artifact when a name is ambiguous", async () => {
    const root = mem("p", {
      "foundry.toml": "",
      broadcast: {},
      out: {
        "Token.t.sol": { "Token.json": artifact("test/Token.t.sol") },
        "Token.sol": { "Token.json": artifact("src/Token.sol") },
        "Other.sol": { "Token.json": artifact("lib/dep/Token.sol") },
      },
    });
    const scan = await scanProject(root, SEPOLIA);
    const candidates = scan.artifactsByName.get("Token")!;
    expect(candidates).toHaveLength(3);
    const best = await pickArtifact(candidates);
    expect(best?.sourceDir).toBe("Token.sol");
  });

  it("tells two deployments of one contract apart", () => {
    const row = (key: string) =>
      ({ key, name: "MockERC20", candidates: [], deployment: {} }) as never;
    const names = disambiguateNames([row(getAddress(A)), row(getAddress(B))]).map(
      (item) => item.name,
    );
    expect(names[0]).not.toBe(names[1]);
    expect(names[0]).toMatch(/^MockERC20 \(0x/);
  });
});

describe("importStatus", () => {
  const abi = normalizeAbi(tokenAbi);
  it("distinguishes new, same, and changed ABIs", () => {
    expect(importStatus({ abi }, undefined)).toBe("new");
    expect(importStatus({ abi }, { activeRevisionHash: abi.hash })).toBe("same");
    expect(importStatus({ abi }, { activeRevisionHash: "0xother" })).toBe("update");
  });
});

describe("fsDirFromFileList", () => {
  function file(path: string, content: string): File {
    const value = new File([content], path.split("/").pop()!);
    Object.defineProperty(value, "webkitRelativePath", { value: path });
    return value;
  }

  it("rebuilds the tree from relative paths", async () => {
    const root = fsDirFromFileList([
      file("proj/foundry.toml", "out = 'o'"),
      file("proj/broadcast/Deploy.s.sol/11155111/run-latest.json", "{}"),
      file("proj/o/A.sol/A.json", "{}"),
    ])!;
    expect(root.name).toBe("proj");
    const scan = await scanProject(root, SEPOLIA);
    expect(scan.outDir).toBe("o");
    expect(scan.broadcasts).toHaveLength(1);
    expect(scan.artifacts[0].path).toBe("o/A.sol/A.json");
  });

  it("returns nothing for an empty selection", () => {
    expect(fsDirFromFileList([])).toBeUndefined();
  });
});

describe("applyProjectImport", () => {
  const empty = (): WorkspaceState => ({
    version: 2,
    bindings: [],
    revisions: [],
    txs: [],
    settings: {
      theme: "dark",
      rpcOverrides: {},
      etherscanKey: "",
      rememberArgs: true,
      confirmValueThresholdWei: "0",
    },
  });
  const abiA = normalizeAbi(tokenAbi);
  const abiB = normalizeAbi([
    ...tokenAbi,
    { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  ]);
  const source = { kind: "foundry" as const, artifactPath: "out/T.sol/T.json", script: "Deploy.s.sol" };

  it("saves many contracts at once and shares identical ABIs", () => {
    const { state, result } = applyProjectImport(empty(), {
      project: "  my-protocol ",
      chainId: SEPOLIA,
      entries: [
        { name: "Token", address: A, imported: abiA, source },
        { name: "Token2", address: B, imported: abiA, source },
        { name: "Vault", address: C, imported: abiB, source },
      ],
    });
    expect(result).toEqual({ added: 3, updated: 0, unchanged: 0 });
    expect(state.bindings.map((item) => item.name)).toEqual(["Token", "Token2", "Vault"]);
    expect(state.bindings.every((item) => item.project === "my-protocol")).toBe(true);
    expect(state.revisions).toHaveLength(2);
    expect(state.bindings[0].activeRevisionId).toBe(state.bindings[1].activeRevisionId);
  });

  it("updates changed ABIs, keeps names, and leaves identical ones alone", () => {
    const first = applyProjectImport(empty(), {
      project: "p",
      chainId: SEPOLIA,
      entries: [
        { name: "Token", address: A, imported: abiA, source },
        { name: "Vault", address: B, imported: abiA, source },
      ],
    }).state;
    const renamed = {
      ...first,
      bindings: first.bindings.map((item) =>
        item.address === getAddress(A) ? { ...item, name: "My renamed token" } : item,
      ),
    };

    const { state, result } = applyProjectImport(renamed, {
      project: "p",
      chainId: SEPOLIA,
      entries: [
        { name: "Token", address: A, imported: abiB, source },
        { name: "Vault", address: B, imported: abiA, source },
        { name: "New", address: C, imported: abiA, source },
      ],
    });

    expect(result).toEqual({ added: 1, updated: 1, unchanged: 1 });
    const token = state.bindings.find((item) => item.address === getAddress(A))!;
    expect(token.name).toBe("My renamed token");
    expect(token.revisionIds).toHaveLength(2);
    expect(token.activeRevisionId).not.toBe(first.bindings[0].activeRevisionId);
    expect(state.bindings[0].name).toBe("New");
  });

  it("leaves contracts ungrouped when the project name is blank", () => {
    const { state } = applyProjectImport(empty(), {
      project: "   ",
      chainId: SEPOLIA,
      entries: [{ name: "", address: A, imported: abiA, source }],
    });
    expect(state.bindings[0].project).toBeUndefined();
    expect(state.bindings[0].name).toBe(getAddress(A));
  });
});
