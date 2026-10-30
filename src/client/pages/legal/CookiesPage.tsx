import { Link } from "react-router-dom";
import { openCookieSettings } from "../../components/SiteFooter";
import { LEGAL } from "../../legal/config";
import { LegalEmail, LegalLayout } from "./LegalLayout";

export function CookiesPage() {
  const { service, email } = LEGAL;
  return (
    <LegalLayout title="Cookie Policy">
      <p>
        Cookies are small files a website stores on your device. Browser storage ("local storage") works in a similar
        way. This page lists what {service} stores on your device and why. More about how we use personal data is in
        our <Link to="/privacy">Privacy Policy</Link>.
      </p>

      <h2>Our approach</h2>
      <p>
        {service} only uses cookies and storage that the app needs to work, or that remember choices you've made. We
        don't use advertising cookies or analytics cookies. If we ever add cookies that aren't strictly necessary, we'll
        ask for your consent first and update this page.
      </p>

      <h2>What we store</h2>
      <table className="legal-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Purpose</th>
            <th>How long</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>pr_session</code>
            </td>
            <td>Cookie (strictly necessary)</td>
            <td>Keeps you logged in. Only set when you log in or sign up. Can't be read by scripts on the page.</td>
            <td>30 days, or until you log out</td>
          </tr>
          <tr>
            <td>
              <code>cookieyes-consent</code>
            </td>
            <td>Cookie (strictly necessary)</td>
            <td>Remembers your cookie choices so we don't ask every time. Set by CookieYes.</td>
            <td>1 year</td>
          </tr>
          <tr>
            <td>
              <code>pint-route:crawls</code>
            </td>
            <td>Local storage (strictly necessary)</td>
            <td>
              Remembers the crawls you've created on this device, and their private edit links, so you can edit them.
            </td>
            <td>Until you clear your browser data or log out</td>
          </tr>
          <tr>
            <td>
              <code>pint-route:last-country</code>
            </td>
            <td>Local storage (functional)</td>
            <td>Remembers the country you last chose for a new crawl.</td>
            <td>Until you clear your browser data</td>
          </tr>
        </tbody>
      </table>

      <h2>Analytics without cookies</h2>
      <p>
        To understand how {service} is used, we count actions (such as crawls created or pubs added) on our own server
        as anonymous daily totals, and we use{" "}
        <a href="https://www.cloudflare.com/web-analytics/" target="_blank" rel="noreferrer">
          Cloudflare Web Analytics
        </a>{" "}
        for visits and page speed. Neither sets cookies, stores anything on your device, or tracks you across other
        websites. See our <Link to="/privacy">Privacy Policy</Link> for details.
      </p>

      <h2>Third-party services</h2>
      <ul>
        <li>
          <strong>Google Maps</strong>: when you view the map or pub photos, your browser loads them from Google. Google
          may use cookies or similar technologies under its own policies. See{" "}
          <a href="https://policies.google.com/technologies/cookies" target="_blank" rel="noreferrer">
            how Google uses cookies
          </a>
          .
        </li>
        <li>
          <strong>Cloudflare</strong>: hosts the site and may set cookies needed for security, such as protecting
          against bots. Its Web Analytics script (from <code>static.cloudflareinsights.com</code>) doesn't set
          cookies. See{" "}
          <a href="https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/" target="_blank" rel="noreferrer">
            Cloudflare's cookies
          </a>
          .
        </li>
        <li>
          <strong>CookieYes</strong>: provides the cookie banner and stores your choices (see above).
        </li>
      </ul>

      <h2>Changing your choices</h2>
      <p>
        You can change your cookie choices at any time:{" "}
        <button type="button" className="text-btn inline" onClick={openCookieSettings}>
          open cookie settings
        </button>
        . You can also block or delete cookies and local storage in your browser settings. If you block strictly
        necessary ones, parts of {service} won't work: you won't be able to stay logged in, or edit crawls you created
        on this device.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about cookies: <LegalEmail email={email} />.
      </p>
    </LegalLayout>
  );
}
