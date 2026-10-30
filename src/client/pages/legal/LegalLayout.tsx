import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { SiteFooter } from "../../components/SiteFooter";
import { LEGAL_UPDATED } from "../../legal/config";

export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Pint Route`;
    window.scrollTo(0, 0);
    return () => {
      document.title = "Pint Route";
    };
  }, [title]);

  return (
    <main className="page narrow legal">
      <header className="auth-header">
        <Link to="/" className="auth-brand">
          🍺 Pint Route
        </Link>
      </header>
      <article className="card legal-card">
        <h1>{title}</h1>
        <p className="muted small">Last updated: {LEGAL_UPDATED}</p>
        {children}
      </article>
      <SiteFooter />
    </main>
  );
}

/** mailto link for the legal contact address. */
export function LegalEmail({ email }: { email: string }) {
  return <a href={`mailto:${email}`}>{email}</a>;
}
