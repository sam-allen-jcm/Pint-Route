import { Link } from "react-router-dom";

declare global {
  interface Window {
    /** Provided by the CookieYes script: reopens the consent preferences. */
    revisitCkyConsent?: () => void;
  }
}

export function openCookieSettings() {
  if (typeof window.revisitCkyConsent === "function") window.revisitCkyConsent();
  else alert("Cookie settings couldn't be opened. If you use an ad or tracker blocker, it may be blocking them.");
}

/** Legal links, cookie settings and a responsible-drinking reminder. */
export function SiteFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={`site-footer ${compact ? "compact" : ""}`}>
      <nav aria-label="Legal">
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <Link to="/cookies">Cookies</Link>
        <button type="button" className="footer-link" onClick={openCookieSettings}>
          Cookie settings
        </button>
      </nav>
      <p>
        Please drink responsibly. For facts and advice, visit{" "}
        <a href="https://www.drinkaware.co.uk" target="_blank" rel="noreferrer">
          drinkaware.co.uk
        </a>
        .
      </p>
      {!compact && <p>© {new Date().getFullYear()} SA Consulting · Pint Route</p>}
    </footer>
  );
}
