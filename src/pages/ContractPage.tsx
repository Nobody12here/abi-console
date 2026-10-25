import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { isAddress, type Address } from "viem";
import toast from "react-hot-toast";
import { TriangleAlert } from "lucide-react";
import type { AbiRevision, ContractBinding } from "@/features/abi/types";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import {
  abiReadFunctions,
  abiWriteFunctions,
} from "@/features/abi/utils";
import { bindingId } from "@/features/storage/workspace";
import { createReadClient } from "@/lib/rpc";
import { inspectContract } from "@/lib/proxy";
import { chainName, getChain } from "@/lib/chains";
import { PageLoading } from "@/components/ui/PageLoading";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ContractHeader } from "@/components/workspace/ContractHeader";
import { ChainBanner } from "@/components/workspace/ChainBanner";
import { ContractTabs } from "@/components/workspace/ContractTabs";
import { CONTRACT_TABS, type ContractTab } from "@/components/workspace/tabs";
import { DetailsPanel } from "@/components/workspace/DetailsPanel";
import { MethodList } from "@/components/workspace/MethodList";
import { TransactionsPanel } from "@/components/workspace/TransactionsPanel";
import { EventsPanel } from "@/components/workspace/EventsPanel";
import { AbiPanel } from "@/components/workspace/AbiPanel";

function resolveTab(param: string | undefined): ContractTab {
  // "overview" was the old name of the details tab; keep old links working.
  if (param === "overview") return "details";
  return CONTRACT_TABS.some((tab) => tab.id === param)
    ? (param as ContractTab)
    : "read";
}

function MissingContract({
  chainId,
  address,
}: {
  chainId: number;
  address: string | undefined;
}) {
  const valid =
    getChain(chainId) !== undefined && address !== undefined && isAddress(address);

  return (
    <div className="page">
      <EmptyState
        title={valid ? "This contract isn’t saved here" : "Invalid contract link"}
        description={
          valid ? (
            <p>
              <code className="mono break">{address}</code> on{" "}
              {chainName(chainId)} isn’t saved in this browser. Add it with its
              ABI to use it.
            </p>
          ) : (
            <p>The network or address in this link isn’t valid.</p>
          )
        }
        action={
          <div className="button-row">
            <Link
              to={valid ? `/import?chainId=${chainId}&address=${address}` : "/import"}
              className="btn btn-primary"
            >
              Add this contract
            </Link>
            <Link to="/" className="btn btn-ghost">
              Back to contracts
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

  const contractTxs = useMemo(
    () => (binding ? txs.filter((tx) => tx.contractId === binding.id) : []),
    [txs, binding],
  );

  if (!ready) {
    return <PageLoading />;
  }

  if (!binding) {
    return <MissingContract chainId={chainId} address={address} />;
  }

  if (!revision) {
    return (
      <div className="page">
        <EmptyState
          title="This contract has no ABI"
          description="Its saved ABI is missing or damaged. Add the ABI again; the address and transaction history are kept."
          action={
            <Link
              to={`/import?chainId=${binding.chainId}&address=${binding.address}`}
              className="btn btn-primary"
            >
              Add ABI
            </Link>
          }
        />
      </div>
    );
  }

  const tab = resolveTab(params.tab);
  const basePath = `/contract/${binding.chainId}/${binding.address}`;
  const codeInfo = codeQuery.data;
  const codeMissing = codeInfo?.codeSize === 0;
  const codeChanged =
    Boolean(binding.codeInfo && codeInfo) &&
    binding.codeInfo?.codeHash !== codeInfo?.codeHash &&
    !codeMissing;

  return (
    <div className="page contract-page">
      <ContractHeader binding={binding} />
      <ChainBanner contractChainId={binding.chainId} />

      {codeMissing && (
        <div className="notice danger">
          <TriangleAlert size={16} />
          <div>
            <strong>No contract code at this address.</strong> It may have been
            destroyed, or it was saved on the wrong network.
          </div>
        </div>
      )}
      {codeChanged && (
        <div className="notice warning">
          <TriangleAlert size={16} />
          <div>
            <strong>The deployed code changed since you saved this contract.</strong>{" "}
            The ABI may be out of date.
          </div>
          <Button
            size="sm"
            onClick={() => {
              updateBinding(binding.id, { codeInfo });
              toast.success("Marked the new code as expected.");
            }}
          >
            Dismiss
          </Button>
        </div>
      )}

      <ContractTabs
        basePath={basePath}
        active={tab}
        counts={revision.counts}
        txCount={contractTxs.length}
      />

      <div className="tab-panel" key={binding.id}>
        {tab === "read" && (
          <MethodList
            key="read"
            contract={binding}
            revision={revision}
            functions={abiReadFunctions(revision.abi)}
            mode="read"
          />
        )}

        {tab === "write" && (
          <MethodList
            key="write"
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

        {tab === "details" && (
          <DetailsPanel
            binding={binding}
            revision={revision}
            revisions={bindingRevisions}
            codeInfo={codeInfo}
            codeLoading={codeQuery.isFetching}
            codeError={codeQuery.error}
            onRecheck={() => {
              void codeQuery.refetch();
            }}
          />
        )}
      </div>
    </div>
  );
}
