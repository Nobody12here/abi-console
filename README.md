# ABI Console

A local-first workbench for talking to any deployed EVM contract **with an ABI you already have** — no explorer verification, no hosted backend, and no private keys.

> Bind an ABI. Talk to the chain.

## What it does

- **Import an interface from anywhere.** Foundry/Hardhat/Truffle artifacts, a bare ABI array, a JSON file, a URL, or an optional Etherscan lookup with your own API key.
- **Bind it to a deployed address.** Static chain registry (13 networks, including Anvil/localhost), EIP-55 validation, and a bytecode presence check with proxy hints.
- **Read with confidence.** Typed argument fields for tuples and nested arrays, calldata preview, selector display, block pinning, and structured results.
- **Write safely.** Every write must pass `eth_call` simulation first. Value is checked against your balance, large values require explicit confirmation, and errors are decoded against the ABI. Writes are never auto-retried.
- **Keep a local audit trail.** Transactions, statuses, hashes, gas, decoded reverts, and per-contract history live in IndexedDB. Nothing is uploaded.
- **Explore events.** A declarative event catalog plus user-triggered `eth_getLogs` queries over a bounded block range, decoded with the active ABI.
- **Version the ABI itself.** Editing raw JSON creates an immutable revision with its own canonical hash. Activating a revision changes the whole workspace surface without deleting history.
- **Portable by design.** Export/import a versioned workspace bundle. Etherscan keys are never exported.

## Quick start

Requirements: Node 20+ or Bun, and a browser wallet for write methods.

```bash
bun install        # or npm install / pnpm install / yarn
bun run dev        # http://localhost:5173
```

```bash
bun run build      # type-check + production build
bun run lint       # oxlint
bun run test       # vitest
bun run preview    # serve the production build
```

There is no server component. The only optional build-time setting is `VITE_WALLET_CONNECT_PROJECT_ID`, a public identifier used by WalletConnect-based mobile wallets; injected browser wallets work without it. Your Etherscan key is never a build setting — add it in **Settings**.

## Bring your own keys

| Key / endpoint | Required? | Used for | Stored where |
| --- | --- | --- | --- |
| Etherscan API key | Optional | Verified-ABI lookup only | IndexedDB / localStorage, excluded from exports |
| RPC URL override | Optional | Archival reads, higher limits, local nodes | Same local workspace |
| Wallet | Writes only | Signing | Never leaves your wallet |

The default RPCs are public endpoints baked into the static chain registry. Each override is tested with `eth_chainId` before it is saved.

Only `VITE_WALLET_CONNECT_PROJECT_ID` is read at build time. Legacy `VITE_ETHERSCAN_*` and `VITE_INFURA_*` variables are unused and can be deleted.

## Supported chains

Ethereum, Sepolia, Base, Base Sepolia, Arbitrum One, Arbitrum Sepolia, Optimism, OP Sepolia, Polygon, Polygon Amoy, BNB Smart Chain, BNB Testnet, and Anvil/localhost (31337).

Custom chain creation is intentionally deferred because it requires rebuilding the wallet connector registry; use an RPC override on a supported chain instead.

## Architecture

```
src/
  App.tsx                    route shell, toaster
  main.tsx                   providers: wagmi → query → workspace → RainbowKit → router
  pages/                     Home, Import, Contract, Settings, NotFound
  components/
    layout/                  top bar, brand, page header, error boundary
    ui/                      Button, ChainBadge, CopyButton, Dialog, Spinner, EmptyState
    contracts/               contract row
    workspace/               contract header/tabs, method list + card, argument form,
                             result view, transactions, events, ABI and details panels
  features/
    abi/                     types, source metadata, normalization + hashing, selectors
    execution/               recursive argument trees, error decoding
    storage/                 IndexedDB workspace with localStorage fallback + legacy migration
    workspace/               React context, revisions, bindings, transactions, settings
  lib/                       chain registry, RPC clients, proxy inspection, explorer, formatting
  styles/app.css             visual system and responsive layout
docs/product-spec.md         the implementation contract
```

### Key invariants

- **A method key is its canonical signature**, never a bare function name. Overloads are distinct and do not share UI state.
- **ABI revisions are immutable.** Bindings reference revision IDs; the active revision is a pointer.
- **The ABI hash is local evidence, not trust.** It proves what you imported, not that it matches deployed bytecode.
- **Simulation precedes sending** and uses the connected account. A successful simulation is not a guarantee.
- **Argument order comes from the ABI tree**, never from `Object.values` on a form state.

## Data model

A workspace is a versioned object containing:

- `bindings[]` — `id`, `name`, `chainId`, `address`, `activeRevisionId`, `revisionIds[]`, `codeInfo`, timestamps
- `revisions[]` — `id`, `hash`, raw JSON, normalized ABI, source metadata, counts, warnings
- `txs[]` — `id`, `contractId`, signature, selector, args, value, status, hash, receipt data, decoded errors
- `settings` — theme, last chain, RPC overrides, Etherscan key, argument memory, confirmation threshold

Legacy records under the `abi-console-contracts` localStorage key are migrated once on first load; invalid entries are quarantined rather than silently dropped.

## Security notes

- No analytics, no hosted API proxy, no shared API keys.
- No private keys or seed phrases are requested or stored.
- The console shows calldata, selector, chain, and native value before every signature.
- Explorer and URL imports are explicit, user-initiated network requests.
- Treat imported ABIs and contract bytecode as untrusted input.

## Contributing

The product and technical contract lives in [`docs/product-spec.md`](docs/product-spec.md). Read it before changing architecture, storage format, or the safety model. Keep changes typed, tested, and accessible.
