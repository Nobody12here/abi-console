import { Spinner } from "./Spinner";

export function PageLoading() {
  return (
    <div className="page-loading">
      <Spinner label="Loading" />
      <span>Loading…</span>
    </div>
  );
}
