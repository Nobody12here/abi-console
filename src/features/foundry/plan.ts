import { shortenAddress } from "@/lib/format";
import { mapLimit } from "@/lib/async";
import { AbiValidationError, normalizeAbi } from "@/features/abi/normalize";
import type { ImportedAbi } from "@/features/abi/types";
import type { Deployment } from "./broadcast";
import type { ArtifactRef, ProjectScan } from "./project";

export type PlanRow = {
  /** Checksummed address; unique within a plan. */
  key: string;
  deployment: Deployment;
  /** Editable display name. */
  name: string;
  /** Artifacts the user can choose between for this row. */
  candidates: ArtifactRef[];
  artifact?: ArtifactRef;
  abi?: ImportedAbi;
  abiError?: string;
};

export type ImportStatus = "new" | "update" | "same";

type ArtifactResult = { imported: ImportedAbi } | { error: string };

const jsonCache = new WeakMap<ArtifactRef, Promise<unknown>>();

function readArtifactJson(ref: ArtifactRef): Promise<unknown> {
  let cached = jsonCache.get(ref);
  if (!cached) {
    cached = ref.file.text().then((text) => JSON.parse(text) as unknown);
    jsonCache.set(ref, cached);
  }
  return cached;
}

export async function loadArtifact(ref: ArtifactRef): Promise<ArtifactResult> {
  let json: unknown;
  try {
    json = await readArtifactJson(ref);
  } catch {
    return { error: "The artifact file is not valid JSON." };
  }
  try {
    return { imported: normalizeAbi(json) };
  } catch (error) {
    if (error instanceof AbiValidationError) {
      const empty = error.issues[0] === "The ABI is empty.";
      return {
        error: empty
          ? "The ABI is empty (a library or a contract with no public functions)."
          : error.issues[0],
      };
    }
    return { error: "The ABI could not be read." };
  }
}

/** Source file that produced an artifact, e.g. "src/Vault.sol". */
async function sourcePathOf(ref: ArtifactRef): Promise<string | undefined> {
  try {
    const json = (await readArtifactJson(ref)) as {
      ast?: { absolutePath?: unknown };
      metadata?: { settings?: { compilationTarget?: Record<string, unknown> } };
    };
    if (typeof json.ast?.absolutePath === "string") return json.ast.absolutePath;
    const target = json.metadata?.settings?.compilationTarget;
    return target ? Object.keys(target)[0] : undefined;
  } catch {
    return undefined;
  }
}

/** Lower is better: real contracts beat tests, scripts, and dependencies. */
function sourceRank(path: string | undefined, ref: ArtifactRef): number {
  const value = path ?? ref.sourceDir;
  if (value.startsWith("lib/") || value.startsWith("node_modules/")) return 4;
  if (/\.t\.sol$/.test(value) || value.startsWith("test/")) return 3;
  if (/\.s\.sol$/.test(value) || value.startsWith("script/")) return 2;
  if (value.startsWith("src/") || value.startsWith("contracts/")) return 0;
  return 1;
}

/** Choose between artifacts that share a contract name. */
export async function pickArtifact(
  candidates: ArtifactRef[],
): Promise<ArtifactRef | undefined> {
  if (candidates.length <= 1) return candidates[0];
  const ranked = await Promise.all(
    candidates.map(async (ref) => ({
      ref,
      rank: sourceRank(await sourcePathOf(ref), ref),
    })),
  );
  ranked.sort((a, b) => a.rank - b.rank);
  return ranked[0].ref;
}

/** Artifacts offered for a contract with no name in the broadcast file. */
export function selectableArtifacts(scan: ProjectScan): ArtifactRef[] {
  return scan.artifacts.filter((ref) => !/\.(t|s)\.sol$/.test(ref.sourceDir));
}

/** Turn deployments into rows: match ABIs, load them, and make names unique. */
export async function buildPlan(
  scan: ProjectScan,
  deployments: Deployment[],
): Promise<PlanRow[]> {
  const rows = await mapLimit(deployments, 8, async (deployment): Promise<PlanRow> => {
    const row: PlanRow = {
      key: deployment.address,
      deployment,
      name: deployment.contractName ?? "",
      candidates: [],
    };

    if (!deployment.contractName) {
      row.candidates = selectableArtifacts(scan);
      row.abiError = deployment.nested
        ? "Created by another contract, so Foundry did not record its name. Choose its ABI."
        : "Foundry did not record a name. Choose its ABI.";
      return row;
    }

    row.candidates = scan.artifactsByName.get(deployment.contractName) ?? [];
    const artifact = await pickArtifact(row.candidates);
    if (!artifact) {
      row.abiError = "No compiled artifact found. Run “forge build” and choose the folder again.";
      return row;
    }

    row.artifact = artifact;
    const result = await loadArtifact(artifact);
    if ("imported" in result) row.abi = result.imported;
    else row.abiError = result.error;
    return row;
  });

  return disambiguateNames(rows);
}

/** Two deployments of the same contract get their address appended. */
export function disambiguateNames(rows: PlanRow[]): PlanRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.name) counts.set(row.name, (counts.get(row.name) ?? 0) + 1);
  }
  return rows.map((row) =>
    row.name && (counts.get(row.name) ?? 0) > 1
      ? { ...row, name: `${row.name} (${shortenAddress(row.key, 4)})` }
      : row,
  );
}

/** What importing this row would do, given the contract already saved at this address. */
export function importStatus(
  row: Pick<PlanRow, "abi">,
  existing: { activeRevisionHash?: string } | undefined,
): ImportStatus {
  if (!existing) return "new";
  return row.abi && existing.activeRevisionHash === row.abi.hash
    ? "same"
    : "update";
}
