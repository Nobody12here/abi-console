import { Link } from "react-router-dom";
import { ArrowLeft, Compass } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export function NotFoundPage() {
  return (
    <div className="page notfound-page">
      <EmptyState
        icon={<Compass size={24} />}
        eyebrow="404 · NO ROUTE"
        title="That page does not exist"
        description="The link may be outdated or malformed. Contracts live under /contract/:chainId/:address, and every other workflow starts from the workspace."
        action={
          <Link to="/" className="btn btn-primary">
            <ArrowLeft size={15} /> Back to contracts
          </Link>
        }
      />
    </div>
  );
}
