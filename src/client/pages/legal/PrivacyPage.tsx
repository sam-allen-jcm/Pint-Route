import { Link } from "react-router-dom";
import { LEGAL } from "../../legal/config";
import { LegalEmail, LegalLayout } from "./LegalLayout";

export function PrivacyPage() {
  const { operator, email, service, site } = LEGAL;
  return (
    <LegalLayout title="Privacy Policy">
      <p>
        This policy explains what personal data {service} ({site}) collects, why, who we share it with, how long we keep
        it, and the rights you have. We've tried to keep it plain and specific to what the app actually does.
      </p>

      <h2>1. Who we are</h2>
      <p>
        {service} is operated by <strong>{operator}</strong> ("we", "us"). We are the <strong>controller</strong> of your
        personal data under the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018. For any
        privacy question or request, email <LegalEmail email={email} />.
      </p>

      <h2>2. What we collect and why</h2>
      <table className="legal-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Why we use it</th>
            <th>Lawful basis</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>Account details</strong>: your name, email address and password (stored only as a salted,
              one-way hash we can't reverse)
            </td>
            <td>To create and run your account, log you in, and let you reset your password</td>
            <td>Contract (providing the service you signed up for)</td>
          </tr>
          <tr>
            <td>
              <strong>Agreement record</strong>: the date and version of the Terms and this policy you accepted
            </td>
            <td>To show what you agreed to</td>
            <td>Legitimate interests; legal obligation</td>
          </tr>
          <tr>
            <td>
              <strong>Your crawls</strong>: crawl names, the pubs you add and any meeting point you choose (stored as
              Google Place IDs), their order, the dates you tick them off, any notes, the country and town you
              choose, and any start date and time
            </td>
            <td>To provide the crawl planner, and to sync your crawls across your devices if you have an account</td>
            <td>Contract</td>
          </tr>
          <tr>
            <td>
              <strong>Login sessions</strong>: a random session identifier (stored only in hashed form) and its expiry
            </td>
            <td>To keep you logged in securely</td>
            <td>Contract; legitimate interests (security)</td>
          </tr>
          <tr>
            <td>
              <strong>Password reset requests</strong>: a hashed, single-use token and when it expires
            </td>
            <td>To let you reset a forgotten password</td>
            <td>Contract</td>
          </tr>
          <tr>
            <td>
              <strong>Your location</strong>, only when you tap "near me" or "Show my location"
            </td>
            <td>
              <strong>"Near me"</strong>: to find pubs near you. It's sent to our server and Google to run that search
              and isn't stored against you (a rounded version may be cached for up to 5 minutes to speed up repeat
              searches).
              <br />
              <strong>"Show my location"</strong>: to show you as a dot on the map, updating as you walk while the page
              is open. Your location stays on your device and is never sent to us. When the map follows you, Google
              loads map images for the area around you, as it does for any part of the map you view. Tap the button
              again to stop.
            </td>
            <td>Consent (your browser asks permission first; you can say no)</td>
          </tr>
          <tr>
            <td>
              <strong>Technical data</strong>: IP address, browser and device details, and request logs
            </td>
            <td>
              To run, secure and debug the service, including limiting repeated login attempts to protect accounts
            </td>
            <td>Legitimate interests (security and keeping the service working)</td>
          </tr>
          <tr>
            <td>
              <strong>Usage statistics</strong>: anonymous daily counts of actions in the app (for example "12
              crawls created today", or how many crawls were created per country), and how many times each crawl has
              been opened through its share link
            </td>
            <td>
              To understand how {service} is used and improve it. These counts aren't linked to you, your account, your
              IP address or a particular crawl, except the share-link count stored on the crawl itself
            </td>
            <td>Legitimate interests (improving the service)</td>
          </tr>
          <tr>
            <td>
              <strong>Website analytics</strong>: pages visited, the site you came from, your browser, device type
              and approximate country
            </td>
            <td>
              To see how many people visit and how fast the site loads, using Cloudflare Web Analytics. It doesn't use
              cookies, doesn't track you across other sites, and doesn't build a profile of you
            </td>
            <td>Legitimate interests (improving the service)</td>
          </tr>
          <tr>
            <td>
              <strong>Cookie choices</strong>
            </td>
            <td>To remember which cookies you've allowed</td>
            <td>Legal obligation; legitimate interests</td>
          </tr>
          <tr>
            <td>
              <strong>Emails you send us</strong>
            </td>
            <td>To answer your questions and requests</td>
            <td>Legitimate interests</td>
          </tr>
        </tbody>
      </table>
      <p>
        You can use {service} without an account. If you do, we don't know who you are: your crawls are linked to a
        private edit link stored in your browser, not to your identity.
      </p>
      <p>
        We do <strong>not</strong> sell your personal data, use it for advertising, or make decisions about you based
        solely on automated processing.
      </p>

      <h2>3. Crawls you share</h2>
      <p>
        Every crawl has a share link. <strong>Anyone with the link can see the crawl</strong>, including its name, the
        meeting point, the start date and time, the pubs on it, which ones have been ticked off and when, and any notes. Don't put anything in a crawl you wouldn't
        want the people you share it with to see. Anyone with the private edit link can change the crawl, so only share
        that with people you trust.
      </p>

      <h2>4. Who we share data with</h2>
      <p>We use these service providers ("processors") to run {service}. They may only use your data to provide their service to us:</p>
      <ul>
        <li>
          <strong>Cloudflare, Inc.</strong>: hosting, our database (Cloudflare D1), security, request logs and
          cookieless website analytics (Cloudflare Web Analytics). All traffic to the site passes through Cloudflare.{" "}
          <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">
            Privacy policy
          </a>
        </li>
        <li>
          <strong>Google LLC (Google Maps Platform)</strong>: pub search, pub details, opening hours, photos, walking
          routes and the map. Searches (and your location, if you tap "near me") are sent to Google. When you view the
          map or pub photos, your browser connects to Google directly, so Google receives your IP address. Google's use
          of this data is governed by the{" "}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
            Google Privacy Policy
          </a>
          .
        </li>
        <li>
          <strong>Resend, Inc.</strong>: sends our emails, such as password reset links, so it receives your email
          address and the email's content.{" "}
          <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noreferrer">
            Privacy policy
          </a>
        </li>
        <li>
          <strong>CookieYes Limited</strong>: shows the cookie banner and records your cookie choices.{" "}
          <a href="https://www.cookieyes.com/privacy-policy/" target="_blank" rel="noreferrer">
            Privacy policy
          </a>
        </li>
      </ul>
      <p>
        We may also disclose data if the law requires it, to protect people's safety, or to defend legal claims. If{" "}
        {service} is ever sold or transferred, your data may pass to the new operator, who must keep honouring this
        policy.
      </p>

      <h2>5. International transfers</h2>
      <p>
        Some of these providers process data outside the UK, including in the United States. Where they do, we rely on
        UK-approved safeguards: the UK Extension to the EU–US Data Privacy Framework where the provider is certified,
        or the UK International Data Transfer Agreement or Addendum to the EU Standard Contractual Clauses.
      </p>

      <h2>6. How long we keep it</h2>
      <ul>
        <li>
          <strong>Account details</strong>: until you ask us to delete your account. We then delete them within 30
          days, except anything we must keep by law.
        </li>
        <li>
          <strong>Crawls</strong>: until they're deleted by you (or by anyone with the edit link). Crawls in a deleted
          account are deleted with it. We may delete crawls that haven't been used for a long time.
        </li>
        <li>
          <strong>Login sessions</strong>: 30 days, or until you log out or reset your password.
        </li>
        <li>
          <strong>Password reset links</strong>: valid for 1 hour, and deleted once used or replaced.
        </li>
        <li>
          <strong>Usage statistics</strong>: the anonymous daily counts are kept for as long as they're useful,
          because they can't identify anyone.
        </li>
        <li>
          <strong>Server and security logs</strong>: kept for a short period (typically up to 30 days), unless we need
          them to investigate a security problem.
        </li>
        <li>
          <strong>Emails to us</strong>: as long as needed to deal with your request, and then for up to 2 years in
          case of follow-up.
        </li>
      </ul>

      <h2>7. Cookies and storage on your device</h2>
      <p>
        We use a small number of cookies and browser storage, mostly to keep you logged in and remember your crawls.
        See our <Link to="/cookies">Cookie Policy</Link> for the full list and how to change your choices.
      </p>

      <h2>8. Keeping your data safe</h2>
      <p>
        Everything is sent over encrypted HTTPS. Passwords are stored only as salted, slow one-way hashes. Session and
        reset tokens are stored only in hashed form. Repeated login attempts are rate-limited. No system is perfectly
        secure, but if a breach puts your rights at risk we'll tell you and the Information Commissioner's Office as
        the law requires.
      </p>

      <h2>9. Your rights</h2>
      <p>Under UK data protection law you have the right to:</p>
      <ul>
        <li>access the personal data we hold about you and get a copy of it</li>
        <li>have inaccurate data corrected</li>
        <li>have your data deleted</li>
        <li>restrict or object to how we use it, including where we rely on legitimate interests</li>
        <li>receive your data in a portable format</li>
        <li>withdraw consent at any time, where we rely on consent (e.g. location or optional cookies)</li>
      </ul>
      <p>
        To use any of these rights, including deleting your account, email <LegalEmail email={email} /> from the email
        address on your account. We'll respond within one month. It's free, unless a request is clearly unfounded or
        excessive.
      </p>
      <p>
        If you're unhappy with how we've handled your data, please tell us first so we can try to put it right. You also
        have the right to complain to the{" "}
        <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noreferrer">
          Information Commissioner's Office (ICO)
        </a>
        , the UK data protection regulator, on 0303 123 1113.
      </p>

      <h2>10. Age</h2>
      <p>
        {service} is only for people who are of legal drinking age where they live (18 in the UK). We don't knowingly
        collect data from anyone younger. If you think someone underage has given us their data, contact us and we'll
        delete it.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        We'll update this policy when the app or the services we use change. The date at the top shows the latest
        version. If we make significant changes, we'll let account holders know, for example by email or in the app.
      </p>

      <h2>12. Contact</h2>
      <p>
        {operator}, operator of {service}. Email: <LegalEmail email={email} />
      </p>
    </LegalLayout>
  );
}
