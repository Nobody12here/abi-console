# ABI Console — Product & Technical Specification

Status: Draft for implementation
Last updated: 2026-10-24

## 1. Product definition

ABI Console is a local-first workbench for interacting with deployed EVM contracts **using an ABI you already have**, without requiring source-code verification on a block explorer.

It is not an explorer, a source-verification service, or a wallet. It never stores private keys. It binds an ABI document to a chain + contract address, validates the pair as far as possible, and gives the developer a safe, explicit interface for reads and writes.

### One-line positioning

> Inspect and call any deployed contract with your own ABI — no explorer verification required.

### Primary promise

- Bring an ABI from a local build, a file, a URL, or the clipboard.
- Bind it to any address on any supported EVM chain.
- See exactly what will be called, simulate every write, and keep a local audit trail.
- Never send an ABI, address, or key to a third party unless the user explicitly chooses an online source.

## 2. Goals and non-goals

### Goals

1. **Unverified-first.** The default path must not depend on Etherscan verification.
2. **Correct execution.** Overloads, tuples, arrays, payable methods, custom errors, and all ABI item kinds work correctly.
3. **Explicit safety.** Address/chain validation, bytecode presence checks, ABI hashing, selector/calldata preview, and simulation before every write.
4. **Local-first privacy.** Contract data lives in the browser. Online lookups are opt-in and clearly labeled.
5. **Fast developer workflow.** Import → inspect → call in under a minute; deep links and persisted history.
6. **Trustworthy UI.** No dead controls, no false “verified” claims, no hidden background requests.

### Non-goals (MVP)

- Verifying source code or publishing to explorers.
- Custodying keys, seed phrases, or signing on the user's behalf.
- Indexing every chain or replacing a block explorer.
- Team accounts, cloud sync, or a hosted ABI registry.
- Compiling Solidity in-app (deferred to a later phase).
- Automatic decompilation of arbitrary bytecode (deferred; selector discovery is the first step).

## 3. Users and jobs

| User | Job |
| --- | --- |
| Smart-contract developer | Test a freshly deployed contract whose source is not verified yet. |
| Security researcher | Attach a known ABI to an address and inspect what is actually callable. |
| Integrator / backend engineer | Run read methods and send controlled writes without a custom script. |
| QA / support engineer | Reproduce a transaction against a specific chain and contract. |

### Core jobs to be done

1. “I have `MyContract.json` from Foundry/Hardhat. Let me use it against the deployed address now.”
2. “This contract is not verified. I have the ABI from the team. Load it safely.”
3. “I need to check whether the ABI I have matches the deployed contract before sending funds.”
4. “I sent a transaction and need the hash, status, and decoded revert reason.”
5. “I need to come back to this contract tomorrow and continue where I left off.”

## 4. Product principles

1. **ABI is data, not trust.** Always show the ABI hash and the real 4-byte selector. A name can lie; a selector cannot.
2. **No silent actions.** Never auto-switch chains, auto-save on fetch, or auto-sign. Every state-changing step is explicit.
3. **Local by default.** No telemetry. No background uploads. Online imports are labeled with their origin.
4. **Progressive disclosure.** A method is compact until opened, then becomes a validated form with a calldata preview.
5. **Recoverable.** Every failure has an explanation and a next action; partial input is never silently discarded.
6. **Precision over decoration.** Dense, quiet, monospace contract data; color reserved for chain, type, and status.

## 5. Core flows

### Flow A — Import a local artifact (primary)

1. User opens **Import**.
2. Selects **File** and drops a Foundry/Hardhat/Truffle artifact, a bare ABI array, or a JSON object with an `abi` key.
3. App parses and validates the ABI, computes its hash, and shows item counts (functions, events, errors, constructor).
4. User enters a contract address and selects a chain.
5. App validates the address, checks `eth_getCode`, and detects common proxy patterns.
6. User reviews a summary: chain, address, ABI hash, code status, proxy warning, item counts.
7. User clicks **Open workspace**. The binding is saved and the workspace opens.

No explorer request is required. Existing contracts can be updated without losing transaction history.

### Flow B — Import from a URL / clipboard / explorer

- **URL:** fetch a JSON artifact from an HTTPS URL; show the origin and size before accepting. Reject non-HTTPS by default.
- **Paste:** paste a JSON array or artifact; same validation.
- **Explorer (optional convenience):** fetch the published ABI from Etherscan/Sourcify for **verified** contracts only. The UI must say “Requires a verified contract” and must not be the primary tab.
- **Signature database (later):** resolve function selectors to signatures for a partial ABI.

### Flow C — Read a method

1. User opens the **Read** tab and finds a method by name, signature, or selector.
2. Expands one method. Inputs are rendered by Solidity type.
3. Values are validated.
4. User clicks **Query**. The call runs against the selected chain (wallet not required).
5. Result displays every output with its name and type; values are copyable; the call can be refreshed at a specific block.

### Flow D — Write a method

1. User connects a wallet and selects the matching chain.
2. Opens a write method; fills validated inputs; enters native value if payable.
3. Calldata preview shows selector, signature, encoded arguments, value, and target.
4. User clicks **Simulate**. The app runs `simulateContract` and shows success or a decoded revert reason.
5. Only after a successful simulation is **Send transaction** enabled.
6. Wallet prompts. App records `Awaiting signature → Pending → Confirmed/Failed`.
7. On confirmation, show hash, block, gas used, and explorer link. On failure, decode the revert if possible.
8. The transaction is saved to this contract’s history.

### Flow E — Revisit and share

- `/c/:chainId/:address` restores the bound contract and last tab from local storage.
- If the contract is not in local storage, show an import screen prefilled with chain and address.
- **Export** downloads a JSON bundle (contract metadata + ABI + optionally history).
- **Share** copies a link containing only chain and address by default. Sharing an ABI uses a separate compressed bundle file to avoid oversized URLs.

### Flow F — Proxy / multiple ABIs

- On binding, detect EIP-1167 minimal proxy, EIP-1967 implementation/beacon, and EIP-1822.
- Show “Proxy detected” with the implementation address when readable.
- Offer **Add implementation ABI** and **Merge ABIs** (user selects which source wins for duplicate selectors).
- Never silently call the implementation ABI at the proxy address.

## 6. Functional requirements

### 6.1 ABI ingestion

- FR-ABI-1: Accept JSON array, Hardhat artifact (`{ abi, ... }`), Foundry artifact (`{ abi, bytecode, ... }`), Truffle artifact, and a JSON object with a nested `abi`.
- FR-ABI-2: Accept files up to 5 MB. Reject binaries and non-JSON with a clear error.
- FR-ABI-3: Support all ABI item kinds: `function`, `event`, `error`, `constructor`, `fallback`, `receive`.
- FR-ABI-4: Reconstruct each item with viem’s `formatAbiItem` + `parseAbiItem` and reject invalid types. Report the offending path (e.g., `abi[12].inputs[1].type`).
- FR-ABI-5: Preserve the original raw ABI for export exactly as imported, plus a normalized copy for execution.
- FR-ABI-6: Compute a canonical ABI hash: recursively sort object keys, preserve array order, `keccak256(utf8(JSON.stringify(canonical)))`, prefixed with `0x`. Display the short form with copy/expand.
- FR-ABI-7: Detect exact duplicate signatures and warn; block duplicate identical definitions but allow legitimate overloads.
- FR-ABI-8: Show a source badge: `File`, `Paste`, `URL`, `Explorer (verified)`, `Compiled (future)`, `Bytecode (partial)`, `Legacy`.
- FR-ABI-9: Let the user edit the raw ABI, re-validate, and save a new revision. Keep previous revisions for diffing (at least the last 10).
- FR-ABI-10: A failed fetch or parse must never clear the currently loaded ABI.

### 6.2 Binding and validation

- FR-BIND-1: Validate addresses with viem `isAddress`; normalize to EIP-55 checksum. Reject empty, malformed, and zero addresses (warn for zero).
- FR-BIND-2: Require a chain selection. Default to the wallet chain if connected, otherwise the last used chain, otherwise a clearly labeled default (Ethereum mainnet).
- FR-BIND-3: Check `eth_getCode`. If `0x`, block saving as a callable contract and show “No contract code at this address on <chain>.”
- FR-BIND-4: Show the code size and a short code hash (`keccak256(code)`) in the overview. Re-check on every workspace open; warn if it changed.
- FR-BIND-5: If the address already exists for the same chain, offer **Open**, **Update ABI**, or **Replace**. Never silently overwrite.
- FR-BIND-6: Contract names are optional; default to `<short address>`. Escape all user text.
- FR-BIND-7: Detect and surface proxies, but do not require a proxy ABI to save.
- FR-BIND-8: Bindings are identified by `chainId + checksummed address`; renaming does not create a duplicate.

### 6.3 Method resolution and inputs

- FR-EXEC-1: The stable method key is the canonical signature, e.g. `balanceOf(address,uint256)`, not the bare name.
- FR-EXEC-2: For every call, resolve a single ABI item by signature and pass only that item to viem, or use `getAbiItem` with the full argument list.
- FR-EXEC-3: Input state is keyed by input path (`0`, `1.owner`, `2.0`), never by name or type. Unnamed inputs are labeled `arg0`, `arg1`, etc.
- FR-EXEC-4: Build the args array in ABI declaration order, independent of the order fields were edited.
- FR-EXEC-5: Validate each type before simulation:
  - `address`: checksum, non-zero warning.
  - `bool`: explicit true/false control.
  - `uintN`/`intN`: decimal or hex, range-checked to N bits.
  - `bytesN`: exact hex length; `bytes`: even-length hex.
  - `string`: raw UTF-8.
  - Arrays: repeatable rows; nested arrays supported; empty arrays allowed.
  - Tuples: nested groups using `components`, with named fields and correct order.
  - `function`: 24-byte hex.
- FR-EXEC-6: Payable methods show a native-value field with a wei/native toggle and balance check. Non-payable methods send zero.
- FR-EXEC-7: Provide “paste JSON args” and “copy JSON args” for complex inputs.
- FR-EXEC-8: Remember the last successful args per signature per contract (opt-in, local only).
- FR-EXEC-9: A calldata preview is always available before sending: selector, signature, encoded args, target, chain, value.
- FR-EXEC-10: Run `encodeFunctionData` before simulation to catch encoding errors locally.

### 6.4 Reads

- FR-READ-1: Reads work without a wallet.
- FR-READ-2: Use TanStack Query with a key of chain, address, signature, args, and block number.
- FR-READ-3: Show per-method loading, not a global overlay.
- FR-READ-4: Display all outputs with names/types; render arrays and tuples structurally; preserve bigint precision.
- FR-READ-5: Provide copy-per-value and copy-all-as-JSON.
- FR-READ-6: Manual refresh; optional “pin block” input for reproducible reads.
- FR-READ-7: Decode custom errors from the ABI on failure; fall back to the raw revert data.
- FR-READ-8: Never cache a failure as a successful result.

### 6.5 Writes

- FR-WRITE-1: Require a connected wallet and a matching chain before enabling simulation.
- FR-WRITE-2: `simulateContract` is mandatory. “Send” stays disabled until the simulation succeeds.
- FR-WRITE-3: The simulation result is shown before sending, including any returned value and gas estimate.
- FR-WRITE-4: Record a transaction record at “Awaiting signature”, then update to pending/confirmed/failed.
- FR-WRITE-5: Do not block the whole app while a transaction is pending. The method card and history show live status.
- FR-WRITE-6: On success show hash, block, gas used, and an explorer link. On failure decode the revert reason.
- FR-WRITE-7: Handle user rejection, chain switch rejection, replacement, and timeout without leaving a stuck spinner.
- FR-WRITE-8: Never auto-retry a write.
- FR-WRITE-9: Require an explicit confirmation for writes above a user-configured native-value threshold (default: any value, i.e. always show a confirm step).

### 6.6 Transactions

- FR-TX-1: Transactions are stored per binding and persist across reloads.
- FR-TX-2: Fields: id, contractId, chainId, address, signature, selector, args JSON, value, hash, status, block, gas used, error, createdAt, updatedAt.
- FR-TX-3: Statuses: `awaiting-signature`, `pending`, `confirmed`, `failed`, `rejected`, `replaced`.
- FR-TX-4: Show the newest first; filter by status; link to the chain explorer.
- FR-TX-5: “Clear history” requires confirmation and does not touch the contract binding.
- FR-TX-6: On load, reconcile pending records by receipt lookup; never leave a stale pending record without a “Check status” action.

### 6.7 Chain and RPC

- FR-CHAIN-1: Ship a static registry of supported chains, including Ethereum, major L2s, BSC, Polygon, Sepolia, Base Sepolia, and local Anvil/Hardhat (`31337`, `1337`).
- FR-CHAIN-2: Allow a custom HTTPS RPC override per chain, stored locally. Show a warning for HTTP RPCs.
- FR-CHAIN-3: Test a custom RPC with `eth_chainId` before saving; reject mismatched chain IDs.
- FR-CHAIN-4: Show a persistent chain-mismatch banner when the wallet chain differs from the contract chain, with an explicit **Switch wallet** action.
- FR-CHAIN-5: Never auto-switch the wallet on page load or on contract open. Auto-switch only after an explicit user action.
- FR-CHAIN-6: Handle unsupported wallet chains gracefully.
- FR-CHAIN-7: Support adding a fully custom chain in a later phase by rebuilding the wagmi config; document the limitation.

### 6.8 Storage and sharing

- FR-STORE-1: Use IndexedDB (`idb-keyval`) for ABIs, bindings, revisions, settings, and transactions; migrate existing `abi-console-contracts` data from localStorage.
- FR-STORE-2: Version the schema (`abiconsole:v2`). Unknown versions show a recovery screen rather than crashing.
- FR-STORE-3: Guard every write; on quota failure, show a clear message and offer export/cleanup.
- FR-STORE-4: No secrets in exported bundles. API keys are never included.
- FR-STORE-5: Export a versioned JSON bundle containing bindings, ABI documents, and optionally transaction history.
- FR-STORE-6: Import a bundle with a preview and duplicate-resolution choices.
- FR-STORE-7: Share links contain chain + address only by default. ABI sharing uses a compressed fragment with a size cap or a downloaded bundle.

### 6.9 Online sources and keys

- FR-API-1: Every online request has an explicit trigger and a visible origin.
- FR-API-2: Explorer lookups are labeled “verified contracts only” and are secondary to manual import.
- FR-API-3: Support two deployment modes:
  - **Hosted proxy (recommended):** a tiny serverless endpoint holds the explorer key, rate-limits, and caches. The client never receives the key.
  - **Bring your own key:** the user enters an Etherscan key in Settings; it is stored locally and sent only to Etherscan.
- FR-API-4: Remove `VITE_ETHERSCAN_*` and `VITE_INFURA_*` secrets from the client bundle for production. The WalletConnect project ID may remain public.
- FR-API-5: Handle rate limits with a retry-after message; never loop aggressively.
- FR-API-6: Do not send contract addresses to analytics. There is no analytics by default.

## 7. Data model

```ts
type ChainConfig = {
  chainId: number;
  name: string;
  shortName: string;
  rpcUrl: string;            // effective RPC (custom override or default)
  explorerUrl?: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  isCustom: boolean;
  isTestnet: boolean;
};

type AbiSource =
  | { kind: "file"; fileName: string }
  | { kind: "paste" }
  | { kind: "url"; url: string; fetchedAt: string }
  | { kind: "explorer"; provider: "etherscan" | "sourcify"; verified: true }
  | { kind: "bytecode"; partial: true }
  | { kind: "legacy" };

type AbiRevision = {
  id: string;
  abiHash: string;           // 0x + 64 hex
  raw: unknown[];            // original imported array
  normalized: Abi;           // validated viem ABI
  itemCounts: { functions: number; events: number; errors: number };
  source: AbiSource;
  createdAt: string;
};

type ProxyInfo =
  | { kind: "eip1167"; implementation: Address }
  | { kind: "eip1967"; implementation?: Address; beacon?: Address }
  | { kind: "eip1822"; implementation?: Address }
  | { kind: "unknown" };

type ContractBinding = {
  id: string;                // `${chainId}:${checksummedAddress}`
  name: string;
  chainId: number;
  address: Address;          // checksummed
  activeAbiRevisionId: string;
  abiRevisionIds: string[];
  codeHash?: string;         // keccak256(deployed bytecode)
  codeSize?: number;
  proxy?: ProxyInfo;
  lastOpenedAt: string;
  createdAt: string;
  updatedAt: string;
};

type TxRecord = {
  id: string;
  contractId: string;
  chainId: number;
  address: Address;
  signature: string;         // balanceOf(address,uint256)
  selector: string;          // 0x00fdd58e
  args: unknown[];           // JSON-safe representation
  value: string;             // wei as decimal string
  hash?: `0x${string}`;
  status: "awaiting-signature" | "pending" | "confirmed" | "failed" | "rejected" | "replaced";
  blockNumber?: string;
  gasUsed?: string;
  error?: { message: string; decodedName?: string; decodedArgs?: unknown[] };
  createdAt: string;
  updatedAt: string;
};

type Settings = {
  theme: "dark" | "light" | "system";
  lastChainId?: number;
  rpcOverrides: Record<number, string>;
  etherscanKey?: string;     // only in BYOK mode; local only
  confirmValueThresholdWei: string; // default "0"
  rememberArgs: boolean;
};
```

Constraints:

- The ABI document is immutable per revision; edits create a new revision.
- Bindings reference revisions; transactions reference bindings.
- JSON-safe arg serialization: bigint → decimal string, bytes → hex. On reuse, re-parse from the ABI types.

## 8. ABI trust and security model

### What the app can and cannot prove

- It **can** prove that the ABI hash matches what the user imported and that code exists at the address.
- It **cannot** prove that the ABI matches the deployed bytecode. Say this explicitly in the UI.
- The selector is the ground truth for what is executed; always display it next to the friendly name.

### Threat model

| Threat | Mitigation |
| --- | --- |
| Malicious/mislabelled ABI | Show selector + calldata; simulate; show ABI hash/source; never auto-sign. |
| Wrong chain or address | Checksum validation, code check, persistent chain banner, chain shown in calldata preview and confirmation. |
| Stale ABI after upgrade | Code hash re-check on open; warn on change; ABI revision history/diff. |
| Proxy confusion | Detect proxies; show implementation; require explicit ABI merge. |
| XSS via ABI/name | Render as text only; never use `dangerouslySetInnerHTML`; sanitize URLs; CSP. |
| Key leakage | No keys in the client bundle; proxy or BYOK; never export keys. |
| Malicious RPC | HTTPS by default; chain-id check; warning for custom endpoints; read-only fallback. |
| Phishing share links | Share links contain only chain/address; show a confirmation before opening unknown links. |
| Local data loss | Export/import bundles; quota errors handled; versioned storage. |

### Explicit UI disclaimers

- “Unverified ABI — the app cannot confirm this ABI matches the deployed bytecode.”
- “Simulation succeeded” means the call did not revert; it is not a safety guarantee.
- “Explorer ABI” means the explorer has verified source; it does not make the contract trustworthy.

## 9. Screen specifications

### 9.1 Home / Contracts

- Header: brand, settings, theme, wallet.
- Left: searchable contract list with chain badge, address, ABI hash short form, last opened. Keyboard navigable.
- Main: title, primary **Import contract**, secondary **Import bundle**; recent contracts; counts.
- Empty state explains three sources (file, paste, URL) and explicitly says “No explorer verification required.”
- No dead buttons.

### 9.2 Import wizard

Use a three-step, single-page flow rather than three independent sidebar modes:

1. **Source**
   - Tabs: File, Paste, URL, Explorer (verified only).
   - File drop zone with accepted formats.
   - Paste editor with “Format” and live validation.
   - URL input with preview-before-fetch and origin display.
   - Explorer tab: address + chain + explicit “Requires verified contract” note.
2. **Bind**
   - Contract name (optional), address, chain.
   - Address validation, code check, proxy detection results.
   - ABI summary: counts, hash, source, warnings.
3. **Review & open**
   - Sticky summary card: chain, address, code status, proxy, ABI hash, item counts.
   - Primary **Open workspace**; secondary **Save without opening**.
   - Duplicate handling appears inline, not as a blocking alert.

Failure behavior: the wizard preserves all inputs; an ABI fetch failure shows an inline error and never clears the existing ABI.

### 9.3 Workspace

Header:

```text
SEPOLIA · 0x1234…abcd                    [ABI 0x9f3c…] [Copy] [Export] [⋮]
Treasury
Proxy detected: implementation 0x…
Wallet on Ethereum · [Switch wallet]        ← only when mismatched
```

Tabs: Overview · Read (n) · Write (n) · Events · Transactions · ABI.

**Overview**

- ABI hash + source + last updated.
- Code size/hash and a “Re-check” action.
- Proxy card with implementation/beacon and ABI merge action.
- Counts and last transaction.
- Warnings (unverified ABI, code changed, chain mismatch).

**Read / Write**

- Toolbar: search by name/signature/selector, filter, “Expand all” (optional), “Refresh” for reads.
- Method row: signature, selector, badges (`READ`, `PAYABLE`, `PROXY`), output type.
- One method expands at a time by signature (allow pinning multiple if requested later).
- Card body: typed inputs, validation, encoded preview, actions, result/timeline.

**Events** (phase 2)

- Event list from ABI, block range, indexed filters, decoded results, pagination. Disabled with an explanation if no events exist.

**Transactions**

- Per-contract, persisted, newest first, status chips, hash, function, time, explorer link, error details.
- Empty state: “Transactions sent from this console will appear here.”

**ABI**

- Tree grouped by kind; filter; expand item to see full JSON.
- Raw editor with validate/save; copy/download; revision history and diff.
- Prominent ABI hash.

### 9.4 Settings

- Theme (dark/light/system).
- RPC overrides per chain with test/save.
- Add custom chain (later; show as disabled with explanation in MVP).
- Explorer API key (BYOK) or “Using hosted proxy”.
- Remember arguments toggle.
- Export/import all data; clear all data (typed confirmation).
- About/version.

### 9.5 Method card states

```text
Collapsed
  [>] balanceOf(address owner, uint256 id) -> uint256   0x00fdd58e   READ

Expanded / read
  owner   address  [0x…                    ]
  id      uint256  [                        ]
  Calldata 0x00fdd58e…                                   [Copy]
  [Query]                                      Block: latest

Expanded / write
  …inputs…
  Value  [0.0] ETH   (= 0 wei)
  Calldata 0x…                                           [Copy]
  [Simulate]  →  success, gas 54,321
  [Send transaction]  (disabled until simulation succeeds)
  Timeline: Simulated · Awaiting signature · Pending · Confirmed 0x… ↗
```

## 10. Interaction and accessibility requirements

- All controls keyboard reachable; visible focus.
- Tabs use `role="tablist"`, `role="tab"`, `aria-selected`, and arrow-key navigation.
- No nested interactive elements. Contract rows become `<div role="link">` plus sibling action buttons, or a row with separate hit targets.
- Icon-only buttons have accessible names and tooltips.
- Monospace data at no less than 12px on desktop, 13px for primary data; contrast meets WCAG AA.
- Color is never the only status indicator; pair with text/icons.
- Respect `prefers-reduced-motion`; no layout shift on expand.
- Announce async status changes with `aria-live="polite"` (not the whole page).
- Responsive: single column under 840px; import and workspace remain fully usable; sticky action bar on mobile.
- Keyboard shortcuts (optional): `/` search, `g h` home, `g i` import, `Esc` close modal.

## 11. Technical architecture

### Stack decisions

- Keep React 19 + Vite + TypeScript + Tailwind.
- Keep wagmi/viem/RainbowKit for wallet and chain access; use viem directly for encoding, validation, code checks, and proxy reads.
- Add `react-router-dom` for real routes and deep links.
- Add `@tanstack/react-query` already present for reads and RPC queries.
- Add `idb-keyval` for IndexedDB.
- Do not add a form library initially; use a small recursive value tree + pure validators. If complexity grows, add `react-hook-form` with a resolver later.
- Use viem `formatAbiItem` + `parseAbiItem` for ABI item validation; `encodeFunctionData`, `decodeFunctionResult`, `decodeErrorResult`, `getAbiItem`, `getAddress`, `isAddress`, `keccak256`, `toHex` for execution and hashing.

### Suggested structure

```text
src/
  app/
    router.tsx
    providers.tsx
    error-boundary.tsx
  features/
    abi/
      types.ts
      normalize.ts        # format/parse/validate, counts
      hash.ts             # canonical JSON + keccak
      sources.ts          # file/paste/url/explorer adapters
      revisions.ts
    contracts/
      bindings.ts         # validate, duplicate resolution
      code.ts             # getCode, code hash
      proxy.ts            # EIP-1167/1967/1822 detection
    execution/
      method-key.ts
      args.ts             # recursive values, validate, encode
      reads.ts
      writes.ts
      errors.ts           # decoded reverts
    transactions/
      store.ts
      reconcile.ts
    settings/
      store.ts
      chains.ts
  components/
    ui/                   # existing primitives
    contract-guard/
    method-card/
    typed-input/
    result-view/
    tx-timeline/
    chain-banner/
    abi-editor/
  lib/
    storage/
      db.ts
      migrations.ts
    format.ts             # bigint, units, addresses
    urls.ts               # explorer links, safe URL parsing
  pages/
    home.tsx
    import.tsx
    workspace.tsx
    settings.tsx
    not-found.tsx
```

### Execution rules

- Resolve a method by canonical signature to one ABI item.
- Do not pass the full ABI plus a bare name to viem when overloads exist; pass a narrowed ABI or resolved item.
- Build args from the ABI input array, not from object values.
- Encode locally first; then simulate; then write.
- For reads, pass `chainId` explicitly and use the contract chain's client.
- For writes, pass the connected account explicitly.
- Use `getAddress` for normalization and `isAddress` for validation.

### Storage rules

- `abiconsole:v2:bindings`, `:abis`, `:revisions`, `:txs`, `:settings`.
- Migrate the legacy `abi-console-contracts` key once, mark source `legacy`, and keep the old key for one release.
- All writes wrapped in try/catch with user-visible quota errors.
- Keep a maximum of 10 revisions per binding; allow manual deletion.
- Store raw ABI + normalized ABI; recompute normalized on load if the normalizer version changes.

### API/key architecture

- Preferred production: small serverless `/api/abi` proxy with a server-only explorer key, 5 req/min per IP, 24h cache, and no address logging beyond aggregate counts.
- Alternative/local: BYOK in Settings; key stored in IndexedDB; sent only to the selected explorer.
- Remove `VITE_ETHERSCAN_ABI_API` and `VITE_INFURA_KEY` from the production client build. Keep only the WalletConnect project ID.
- Add a strict CSP and `Referrer-Policy: no-referrer`.

## 12. Migration from the current app

1. On first load, read `abi-console-contracts`.
2. For each entry, create a binding with id `${networkId}:${checksum(address)}`, mark source `legacy`, preserve name and function ABI.
3. Validate the address; invalid legacy entries are imported into a quarantine list with an explanation and an edit action.
4. Do not attempt to recover transactions (they were never persisted).
5. Keep the legacy key untouched until the user confirms the migration or 30 days pass.
6. Show a one-time “Imported N contracts” notice.

## 13. Edge cases to handle

- Empty ABI (valid JSON but no items).
- ABI with only events or errors.
- 500+ functions; search and rendering remain responsive.
- Overloaded functions with identical names and different arities.
- Unnamed inputs; duplicate input names; nested tuples with duplicate field names.
- Very large `uint256` values; negative ints; hex input.
- Arrays of tuples and nested arrays.
- Payable function with value exceeding balance.
- Contract self-destructed or no code.
- Proxy with no implementation slot; beacon with failing call.
- Wallet on unsupported chain; chain switch rejected.
- User rejects signature; transaction replaced or dropped.
- RPC rate limit/timeout/offline.
- Explorer ABI returns an object or a stringified ABI.
- Etherscan V2 returning a proxy ABI for a proxy address.
- LocalStorage/IndexedDB unavailable or full.
- Corrupted stored data.
- Direct deep link to unknown contract.
- Share link with a malformed or mismatched chain/address.
- Multiple tabs editing the same binding (last write wins; show a reload hint).

## 14. Testing and quality

### Unit

- ABI canonicalization and hash stability.
- Artifact shape detection (bare array, `abi`, Foundry, Hardhat, Truffle).
- ABI item validation and error paths.
- Method-key generation and overload resolution.
- Recursive arg validation/encoding for every type.
- Address normalization and duplicate detection.
- Proxy slot decoding.
- Storage migration from the legacy key.
- Error decoding.

### Integration / component

- Import wizard happy path and failure preservation.
- Overloaded cards expand independently and keep separate values.
- Payable form validates balance.
- Read result rendering for arrays/tuples/bigints.
- Write timeline transitions with mocked wallet.
- Chain mismatch banner and switch action.

### E2E (Playwright)

- Import a Foundry artifact → bind to an Anvil contract → read → write → receipt → persisted history.
- Import an unverified contract with a pasted ABI (no explorer request).
- Refresh a deep link and restore the workspace.
- Export/import a bundle.

### CI

- `bun run lint`
- `bun run build`
- `bun run test`
- No secrets in the bundle: scan `dist/` for the Etherscan/Infura keys.

## 15. Milestones and acceptance criteria

### M0 — Foundation

- Build and lint pass.
- Routes, error boundary, theme provider, storage adapter, and migration are in place.
- Dead files and dead header controls removed.
- **Acceptance:** `bun run build` passes; no unused-variable lint warnings; deep links render.

### M1 — Import and bind (unverified MVP)

- File/paste/URL import, ABI validation, hash, source badges, code check, proxy detection, duplicate handling, review step.
- Explorer import is secondary and labeled.
- **Acceptance:** a Foundry artifact can be imported, validated, bound to a local Anvil address, saved, and reopened after refresh with zero explorer calls.

### M2 — Correct execution

- Full ABI model, signature-based keys, typed inputs, arrays/tuples, payable value, calldata preview, all outputs, custom errors.
- **Acceptance:** overloaded ERC-1155 `balanceOf` calls target the correct method; tuple/array calls succeed; a payable call sends the entered value.

### M3 — Safe writes and history

- Simulation gate, explicit send, per-contract persisted transaction timeline, receipt reconciliation, explorer links, chain mismatch banner, no global blocker.
- **Acceptance:** reject/success/failure flows leave no stuck state; history survives refresh and stays scoped to the contract.

### M4 — Trust and workflow

- ABI hash pinning/diff, code hash re-check, selector/calldata display everywhere, revisions, export/import bundles, share links.
- **Acceptance:** ABI changes are visible; the selector shown matches `encodeFunctionData`; an exported bundle restores a workspace.

### M5 — Hardening

- Tests, CI, CSP, key proxy/BYOK, rate-limit handling, accessibility pass, documentation.
- **Acceptance:** CI green; no production secrets in `dist/`; keyboard-only import and read flow; WCAG AA spot check.

### Later

- Solidity compilation in-browser.
- Bytecode selector discovery + signature database.
- Diamond/facet ABI merging.
- Event logs viewer and multicall reads.
- Team sync (explicitly opt-in).

## 16. Success measures

- Time from artifact to first successful read: under 30 seconds.
- Zero explorer calls required for the primary flow.
- Zero invalid-address bindings.
- 100% of writes simulated and calldata-previewed.
- Zero secrets in the production bundle.
- Every transaction has a status and a resolvable explorer link.
- 500-function ABI remains usable (search responsive; no input lag).

## 17. Open decisions

1. **Hosted proxy vs BYOK:** default to BYOK for a pure static deployment; switch to a proxy when a backend exists. This affects deployment and key handling.
2. **Custom chains:** static registry + RPC overrides in MVP; dynamic chain creation later because it requires rebuilding the wagmi config.
3. **URL sharing with ABI:** decide between compressed fragments and downloadable bundles. Recommendation: bundles for large ABIs, chain/address-only links by default.
4. **Compiler:** whether to add in-browser `solc` in phase 2 or keep it out of scope until the manual-import workflow is solid.
5. **Event logs:** confirm whether this is required for MVP or can move to M4/M5.
