import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { isAddress, type Address } from "viem";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  ArrowLeft,
  Braces,
  FileWarning,
  Plus,
} from "lucide-react";
import type { AbiRevision, ContractBinding } from "@/features/abi/types";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import {
  abiReadFunctions,
  abiWriteFunctions,
} from "@/features/abi/utils";
import { bindingId } from "@/features/storage/workspace";
import { createReadClient } from "@/lib/rpc";
import { inspectContract } from "@/lib/proxy";
import { chainName } from "@/lib/chains";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ContractHeader } from "@/components/workspace/ContractHeader";
import { ChainBanner } from "@/components/workspace/ChainBanner";
import {
  ContractTabs,
  type ContractTab,
} from "@/components/workspace/ContractTabs";
import { OverviewPanel } from "@/components/workspace/OverviewPanel";
import { MethodList } from "@/components/workspace/MethodList";
import { TransactionsPanel } from "@/components/workspace/TransactionsPanel";
import { EventsPanel } from "@/components/workspace/EventsPanel";
import { AbiPanel } from "@/components/workspace/AbiPanel";

const TABS: ContractTab[] = [
  "overview",
  "read",
  "write",
  "events",
  "transactions",
  "abi",
];

function MissingContract({
  chainId,
  address,
}: {
  chainId: number | undefined;
  address: string | undefined;
}) {
  const valid = typeof chainId === "number" && Number.isFinite(chainId) && address !== undefined && isAddress(address);
  const prefill = valid
    ? `/import?chainId=${chainId}&address=${address}`
    : "/import";

  return (
    <div className="page contract-page">
      <EmptyState
        icon={<FileWarning size={24} />}
        eyebrow="NOT IN THIS WORKSPACE"
        title="This contract is not stored in this browser"
        description={
          valid ? (
            <>
              There is no local binding for{" "}
              <code className="mono">{address}</code> on{" "}
              <strong>{chainName(chainId)}</strong>. Import an ABI to open the
              read and write surface. Nothing is fetched from an explorer unless
              you explicitly choose that source.
            </>
          ) : (
            <>
              The address or chain in this link is not valid. Check the URL, or
              start from the import screen and bind a contract manually.
            </>
          )
        }
        action={
          <div className="empty-state-actions">
            <Link
              to={prefill}
              className="btn btn-primary"
            >
              <Plus size={15} /> Import this contract
            </Link>
            <Link to="/" className="btn btn-ghost">
              <ArrowLeft size={15} /> Back to contracts
            </Link>
          </div>
        }
      />
    </div>
  );
}

export function ContractPage() {
  const params = useParams();
  const { ready, bindings, txs, settings, revisionFor, getRevision, touchBinding, updateBinding } =
    useWorkspace();

  const chainId = Number(params.chainId);
  const address = params.address;

  const binding = useMemo<ContractBinding | undefined>(() => {
    if (!address || !isAddress(address) || !Number.isFinite(chainId)) {
      return undefined;
    }
    const id = bindingId(chainId, address);
    return bindings.find((entry) => entry.id === id);
  }, [bindings, chainId, address]);

  const revision = revisionFor(binding);
  const bindingRevisions = useMemo<AbiRevision[]>(() => {
    if (!binding) return [];
    const entries = binding.revisionIds
      .map((id) => getRevision(id))
      .filter((entry): entry is AbiRevision => entry !== undefined);
    if (revision && !entries.some((entry) => entry.id === revision.id)) {
      entries.push(revision);
    }
    return entries;
  }, [binding, getRevision, revision]);

  const codeQuery = useQuery({
    queryKey: [
      "contract-code",
      binding?.chainId,
      binding?.address,
      settings.rpcOverrides[binding?.chainId ?? 0] ?? "",
    ],
    enabled: Boolean(binding),
    retry: 1,
    staleTime: 20_000,
    queryFn: async () => {
      const client = createReadClient(
        binding!.chainId,
        settings.rpcOverrides,
      );
      return inspectContract(client, binding!.address as Address, binding!.chainId);
    },
  });

  useEffect(() => {
    if (!binding) return;
    touchBinding(binding.id);
    // Only touch when the binding identity changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding?.id]);

  useEffect(() => {
    if (!binding || !codeQuery.data) return;
    if (!binding.codeInfo) {
      updateBinding(binding.id, { codeInfo: codeQuery.data });
    }
    // A changed code hash is surfaced instead of being silently overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binding?.id, codeQuery.dataUpdatedAt]);

  if (!ready) {
    return (
      <div className="page-loading">
        <Spinner label="Loading contract" />
        <span>Loading local workspace…</span>
      </div>
    );
  }

  if (!binding) {
    return <MissingContract chainId={chainId} address={address} />;
  }

  if (!revision) {
    return (
      <div className="page contract-page">
        <EmptyState
          icon={<Braces size={24} />}
          eyebrow="MISSING ABI"
          title="This binding has no active ABI revision"
          description="The local record exists, but its ABI document is missing or was corrupted. Re-import the ABI to restore the workspace. The address and local transaction history are kept."
          action={
            <Link
              to={`/import?chainId=${binding.chainId}&address=${binding.address}`}
              className="btn btn-primary"
            >
              <Plus size={15} /> Re-import ABI
            </Link>
          }
        />
      </div>
    );
  }

  const tabParam = params.tab ?? "overview";
  const tab: ContractTab = TABS.includes(tabParam as ContractTab)
    ? (tabParam as ContractTab)
    : "overview";
  const basePath = `/contract/${binding.chainId}/${binding.address}`;
  const contractTxs = txs.filter((tx) => tx.contractId === binding.id);

  return (
    <div className="page contract-page">
      <ContractHeader binding={binding} revision={revision} />
      <ChainBanner contractChainId={binding.chainId} />
      <ContractTabs
        basePath={basePath}
        active={tab}
        counts={revision.counts}
        txCount={contractTxs.length}
      />

      <div className="workspace-body">
        {tab === "overview" && (
          <OverviewPanel
            binding={binding}
            revision={revision}
            revisions={bindingRevisions}
            txs={contractTxs}
            codeInfo={codeQuery.data}
            codeLoading={codeQuery.isFetching}
            codeError={codeQuery.error}
            onRecheck={() => {
              void codeQuery.refetch();
            }}
            onUpdateSnapshot={() => {
              if (!codeQuery.data) {
                toast.error("Re-check the deployed code first.");
                return;
              }
              updateBinding(binding.id, { codeInfo: codeQuery.data });
              toast.success("Code snapshot updated.");
            }}
          />
        )}

        {tab === "read" && (
          <MethodList
            contract={binding}
            revision={revision}
            functions={abiReadFunctions(revision.abi)}
            mode="read"
          />
        )}

        {tab === "write" && (
          <MethodList
            contract={binding}
            revision={revision}
            functions={abiWriteFunctions(revision.abi)}
            mode="write"
          />
        )}

        {tab === "events" && (
          <EventsPanel contract={binding} revision={revision} />
        )}

        {tab === "transactions" && (
          <TransactionsPanel contract={binding} txs={contractTxs} />
        )}

        {tab === "abi" && (
          <AbiPanel
            key={revision.id}
            contract={binding}
            revision={revision}
            revisions={bindingRevisions}
          />
        )}
      </div>

      <div className="workspace-footnote">
        <AlertTriangle size={13} />
        <span>
          The ABI hash proves what you imported, not that it matches the
          deployed bytecode. Always review calldata and simulate before signing.
        </span>
      </div>
    </div>
  );
}
