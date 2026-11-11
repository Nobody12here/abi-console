import { mapLimit } from "@/lib/async";
import type { FsDir, FsFile, FsNode } from "./fs";

export type ProjectErrorCode =
  | "not-foundry"
  | "no-broadcast"
  | "no-deployments"
  | "no-artifacts";

export class ProjectError extends Error {
  code: ProjectErrorCode;

  constructor(code: ProjectErrorCode, message: string) {
    super(message);
    this.name = "ProjectError";
    this.code = code;
  }
}

export type ArtifactRef = {
  /** Path relative to the project root, e.g. "out/Vault.sol/Vault.json". */
  path: string;
  /** Contract name, e.g. "Vault". */
  name: string;
  /** Folder name inside out/, e.g. "Vault.sol". */
  sourceDir: string;
  file: FsFile;
};

export type BroadcastRef = { script: string; file: FsFile };

export type ProjectScan = {
  name: string;
  outDir: string;
  chainId: number;
  broadcasts: BroadcastRef[];
  /** Chains with broadcasts other than the target chain. */
  otherChains: number[];
  artifactsByName: Map<string, ArtifactRef[]>;
  artifacts: ArtifactRef[];
};

const isDir = (node: FsNode): node is FsDir => node.kind === "directory";
const isFile = (node: FsNode): node is FsFile => node.kind === "file";

/** `out = "build/out"` from foundry.toml; falls back to Foundry's default. */
export function parseOutDir(toml: string | undefined): string {
  const match = toml?.match(/^\s*out\s*=\s*["']([^"']+)["']/m);
  const value = match?.[1]?.trim().replace(/^\.\//, "").replace(/\/+$/, "");
  return value || "out";
}

/** "Vault.0.8.20.json" -> "Vault" (extra artifacts from other solc versions). */
export function contractNameFromFile(fileName: string): string {
  return fileName
    .replace(/\.json$/i, "")
    .replace(/\.\d+\.\d+\.\d+(?:[-+][\w.]+)?$/, "");
}

async function descend(root: FsDir, path: string): Promise<FsDir | undefined> {
  let current: FsDir = root;
  for (const part of path.split("/").filter(Boolean)) {
    const next = (await current.children()).find(
      (node): node is FsDir => isDir(node) && node.name === part,
    );
    if (!next) return undefined;
    current = next;
  }
  return current;
}

async function indexArtifacts(
  out: FsDir,
  outPath: string,
): Promise<ArtifactRef[]> {
  const sourceDirs = (await out.children()).filter(
    (node): node is FsDir => isDir(node) && node.name !== "build-info",
  );
  const lists = await mapLimit(sourceDirs, 12, async (sourceDir) =>
    (await sourceDir.children()).filter(isFile).flatMap((file): ArtifactRef[] =>
      file.name.endsWith(".json") && !file.name.endsWith(".metadata.json")
        ? [
            {
              path: `${outPath}/${sourceDir.name}/${file.name}`,
              name: contractNameFromFile(file.name),
              sourceDir: sourceDir.name,
              file,
            },
          ]
        : [],
    ),
  );
  return lists.flat().sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Locate the broadcast files for `chainId` and index the compiled artifacts.
 * Only broadcast/ and the output folder are opened; lib/, node_modules/ and
 * cache/ are never touched.
 */
export async function scanProject(
  root: FsDir,
  chainId: number,
): Promise<ProjectScan> {
  const top = await root.children();
  const toml = top.find(
    (node): node is FsFile => isFile(node) && node.name === "foundry.toml",
  );
  const broadcast = top.find(
    (node): node is FsDir => isDir(node) && node.name === "broadcast",
  );

  if (!toml && !broadcast) {
    throw new ProjectError(
      "not-foundry",
      "This doesn’t look like a Foundry project. Choose the folder that contains foundry.toml.",
    );
  }
  if (!broadcast) {
    throw new ProjectError(
      "no-broadcast",
      "There is no broadcast/ folder. Deploy with “forge script … --broadcast” first, then choose the project folder again.",
    );
  }

  const outDir = parseOutDir(toml ? await toml.text() : undefined);

  const broadcasts: BroadcastRef[] = [];
  const otherChains = new Set<number>();
  for (const scriptDir of (await broadcast.children()).filter(isDir)) {
    const chainDirs = (await scriptDir.children()).filter(isDir);
    for (const chainDir of chainDirs) {
      if (!/^\d+$/.test(chainDir.name)) continue;
      if (Number(chainDir.name) !== chainId) {
        otherChains.add(Number(chainDir.name));
        continue;
      }
      // Only run-latest.json: dry-run/ and the timestamped history are ignored.
      const latest = (await chainDir.children()).find(
        (node): node is FsFile => isFile(node) && node.name === "run-latest.json",
      );
      if (latest) broadcasts.push({ script: scriptDir.name, file: latest });
    }
  }

  const out = await descend(root, outDir);
  const artifacts = out ? await indexArtifacts(out, outDir) : [];
  const artifactsByName = new Map<string, ArtifactRef[]>();
  for (const artifact of artifacts) {
    const list = artifactsByName.get(artifact.name) ?? [];
    list.push(artifact);
    artifactsByName.set(artifact.name, list);
  }

  return {
    name: root.name,
    outDir,
    chainId,
    broadcasts,
    otherChains: [...otherChains].sort((a, b) => a - b),
    artifactsByName,
    artifacts,
  };
}
