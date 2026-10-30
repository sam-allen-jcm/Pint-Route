import { Link } from "react-router-dom";
import { LEGAL } from "../../legal/config";
import { LegalEmail, LegalLayout } from "./LegalLayout";

export function TermsPage() {
  const { operator, email, service, site, governingLaw } = LEGAL;
  return (
    <LegalLayout title="Terms of Use">
      <p>
        These terms apply to your use of {service} at {site} (the "service"), which is operated by{" "}
        <strong>{operator}</strong> ("we", "us"). By using the service, with or without an account, you agree to these
        terms. If you don't agree, please don't use it. Our <Link to="/privacy">Privacy Policy</Link> and{" "}
        <Link to="/cookies">Cookie Policy</Link> explain how we handle your data.
      </p>

      <h2>1. Who can use Pint Route</h2>
      <p>
        You must be <strong>of legal drinking age in the country where you live</strong> (18 in the UK) to use{" "}
        {service}. By using it, you confirm that you are.
      </p>

      <h2>2. What Pint Route is (and isn't)</h2>
      <p>
        {service} is a free tool for planning pub crawls: finding venues, putting them in order, seeing walking routes
        and ticking them off. We don't sell alcohol, run any venue, or organise events, and we're not responsible for
        the venues you choose or what happens at them.
      </p>
      <p>
        Venue information (names, addresses, opening hours, whether a venue is open, photos) comes from Google and
        other sources, and may be out of date or wrong. Always check with the venue before relying on it.
      </p>

      <h2>3. Drink responsibly and stay safe</h2>
      <ul>
        <li>
          You are responsible for your own drinking, behaviour and safety. Please drink responsibly, know your limits,
          and never drink and drive. For advice, visit{" "}
          <a href="https://www.drinkaware.co.uk" target="_blank" rel="noreferrer">
            drinkaware.co.uk
          </a>
          .
        </li>
        <li>Venues can refuse entry or service, and may ask for ID.</li>
        <li>
          Walking routes, times and distances, and estimated arrival times (and whether a venue will be open
          then), are <strong>estimates only</strong>. For stops very close together, we
          may show a direct line instead of the official route. Routes may not reflect road conditions, closures,
          accessibility or safety. Use your own judgement, follow the law and road signs, and{" "}
          <strong>use proper crossings</strong>.
        </li>
        <li>Plan how you'll get home safely before you set out.</li>
      </ul>

      <h2>4. Your account</h2>
      <p>
        You can use {service} without an account. If you create one, give us accurate details and keep your password
        secret: you're responsible for what happens under your account. Tell us straight away at{" "}
        <LegalEmail email={email} /> if you think someone else has accessed it. You can ask us to delete your account at
        any time.
      </p>

      <h2>5. Your crawls and content</h2>
      <ul>
        <li>
          You own what you write in the service (such as crawl names and notes). You give us permission to store,
          display and share it as needed to run the service, for example showing it to people you share a crawl with.
        </li>
        <li>
          <strong>Share links are public to anyone who has them.</strong> Anyone with a crawl's private edit link can
          change or delete that crawl. Only share links with people you trust.
        </li>
        <li>
          Don't add content that is unlawful, harmful, threatening, abusive, hateful, defamatory, obscene, infringes
          anyone's rights, or contains other people's personal information without permission.
        </li>
        <li>We may remove content, or crawls, that break these terms.</li>
      </ul>

      <h2>6. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use the service for anything unlawful, or to encourage underage or irresponsible drinking</li>
        <li>
          scrape, copy or harvest data from the service, or use it to build a database or competing service, including
          extracting Google Maps content
        </li>
        <li>
          overload, attack, probe or interfere with the service, try to get around its security or rate limits, or
          access accounts or crawls you're not entitled to
        </li>
        <li>use automated tools to access the service, except a normal web browser</li>
        <li>reverse engineer the service, except where the law allows</li>
        <li>impersonate anyone, or use the service to harass anyone</li>
      </ul>

      <h2>7. Google Maps</h2>
      <p>
        {service} uses Google Maps Platform for maps, venue information and walking routes. By using these features you
        also agree to the{" "}
        <a href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noreferrer">
          Google Maps/Google Earth Additional Terms of Service
        </a>{" "}
        (including the{" "}
        <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer">
          Google Terms of Service
        </a>
        ), and Google's use of data is covered by the{" "}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
          Google Privacy Policy
        </a>
        .
      </p>

      <h2>8. Our service</h2>
      <p>
        {service} is provided free of charge. We work to keep it running and accurate, but we can't promise it will
        always be available, uninterrupted, error-free or secure. We may change, suspend or withdraw any part of it.
        We'll try to give reasonable notice of significant changes where we can.
      </p>
      <p>
        The {service} name, design and software belong to us or our licensors. Apart from using the service as
        intended, these terms don't give you any rights in them.
      </p>

      <h2>9. Our responsibility to you</h2>
      <p>
        Nothing in these terms limits or excludes our liability for death or personal injury caused by our negligence,
        for fraud or fraudulent misrepresentation, or for anything else that can't be limited or excluded by law. Nor do
        they affect your legal rights as a consumer.
      </p>
      <p>Subject to that:</p>
      <ul>
        <li>
          We're not responsible for venues or third parties, or for anything that happens on a pub crawl, including what
          you drink, how you get around, or how you behave.
        </li>
        <li>
          We're not responsible for losses caused by inaccurate venue, opening-hours or route information, as long as
          we've used reasonable care and skill.
        </li>
        <li>
          We're only responsible for losses that were a foreseeable result of us breaking these terms or failing to use
          reasonable care and skill. The service is for domestic and private use, so we're not liable for business
          losses.
        </li>
        <li>
          Because the service is free, our total liability to you for any claim is limited to £100.
        </li>
      </ul>

      <h2>10. Suspending or ending your use</h2>
      <p>
        You can stop using {service} at any time. We may suspend or close an account, or remove crawls, if we
        reasonably believe these terms have been broken, or to protect the service, its users or others.
      </p>

      <h2>11. Changes to these terms</h2>
      <p>
        We may update these terms as the service changes or the law requires. The date at the top shows the latest
        version. If we make significant changes, we'll let account holders know. Continuing to use the service after
        changes take effect means you accept them.
      </p>

      <h2>12. General</h2>
      <ul>
        <li>
          These terms are governed by the law of {governingLaw}. You can bring proceedings in the courts of{" "}
          {governingLaw}. If you live in Scotland or Northern Ireland, you can also bring proceedings in your local
          courts.
        </li>
        <li>If any part of these terms is found to be unenforceable, the rest still applies.</li>
        <li>If we don't enforce a term straight away, we can still enforce it later.</li>
        <li>Nobody other than you and us has any rights under these terms.</li>
      </ul>

      <h2>13. Contact</h2>
      <p>
        Questions or complaints: <LegalEmail email={email} />. {operator}, operator of {service}.
      </p>
    </LegalLayout>
  );
}
