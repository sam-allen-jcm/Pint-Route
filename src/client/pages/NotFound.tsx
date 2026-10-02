import { Link } from "react-router-dom";

export function NotFound({ message = "We couldn't find that page." }: { message?: string }) {
  return (
    <main className="page narrow center">
      <div className="empty">
        <div className="empty-icon" aria-hidden>
          🍺
        </div>
        <h1>Last orders</h1>
        <p>{message}</p>
        <Link className="btn btn-primary" to="/">
          Back to Pint Route
        </Link>
      </div>
    </main>
  );
}
