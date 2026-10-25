import { Link } from "react-router-dom";
import { EmptyState } from "@/components/ui/EmptyState";

export function NotFoundPage() {
  return (
    <div className="page">
      <EmptyState
        title="Page not found"
        description="This link may be outdated or mistyped."
        action={
          <Link to="/" className="btn btn-primary">
            Go to contracts
          </Link>
        }
      />
    </div>
  );
}
