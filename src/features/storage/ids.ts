import { getAddress } from "viem";

/** The built-in workspace every manually added contract lives in. */
export const DEFAULT_WORKSPACE_ID = "default";

/**
 * Stable identity of a saved contract. The same address can be saved in more
 * than one workspace, so non-default workspaces are part of the id. Default
 * workspace ids keep the original "chainId:address" form.
 */
export function bindingId(
  chainId: number,
  address: string,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): string {
  const base = `${chainId}:${getAddress(address)}`;
  return workspaceId === DEFAULT_WORKSPACE_ID ? base : `${workspaceId}:${base}`;
}
