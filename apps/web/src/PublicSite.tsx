import { useEffect, type ReactNode } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";

function configuredValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const supportEmail = configuredValue(import.meta.env.VITE_SUPPORT_EMAIL);
const privacyEmail = configuredValue(import.meta.env.VITE_PRIVACY_EMAIL) || supportEmail;
const operatorName = configuredValue(import.meta.env.VITE_OPERATOR_NAME);
const operatorAddress = configuredValue(import.meta.env.VITE_OPERATOR_ADDRESS);

function PageMeta({ title, description }: { title: string; description: string }) {
  const location = useLocation();

  useEffect(() => {
    document.title = `${title} | My Kitchen`;
    const descriptionTag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    descriptionTag?.setAttribute("content", description);
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    canonical?.setAttribute("href", `https://shoppingcart.at${location.pathname}`);
  }, [description, location.pathname, title]);

  return null;
}

function Header() {
  return <header className="public-header">
    <Link className="public-brand" to="/">
      <span className="public-brand-mark" aria-hidden="true">m</span>
      <span>my kitchen</span>
    </Link>
    <nav aria-label="Main navigation">
      <a href="/#features">Features</a>
      <Link to="/privacy">Privacy</Link>
      <Link to="/support">Support</Link>
      <a className="public-cta" href="/app">Open the app</a>
    </nav>
  </header>;
}

function Footer() {
  return <footer className="public-footer">
    <span>© {new Date().getFullYear()} My Kitchen</span>
    <nav aria-label="Legal and help">
      <Link to="/privacy">Privacy</Link>
      <Link to="/terms">Terms</Link>
      <Link to="/imprint">Imprint</Link>
      <Link to="/account-deletion">Account deletion</Link>
      <Link to="/support">Support</Link>
    </nav>
  </footer>;
}

function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="public-shell">
    <Header />
    {children}
    <Footer />
  </div>;
}

function LandingPage() {
  return <PublicLayout>
    <PageMeta
      title="A calmer kitchen, all in one place"
      description="Keep your pantry, shopping list, receipts and household spending together with My Kitchen."
    />
    <main className="landing-main">
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="public-eyebrow">LESS CHAOS. MORE HOME.</p>
          <h1>A calmer kitchen starts with a clearer picture.</h1>
          <p className="landing-lede">
            Keep track of what you have, what you need, and what your household spends — all in one private place.
          </p>
          <div className="landing-actions">
            <a className="public-button primary" href="/app">Open My Kitchen</a>
            <a className="public-button secondary" href="#features">Explore features</a>
          </div>
          <p className="landing-note">Sign in with Google. Invite your household when you’re ready.</p>
        </div>
        <div className="landing-art" aria-hidden="true">
          <div className="art-glow" />
          <div className="art-card art-pantry">
            <span className="art-icon">◒</span><span>Pantry</span><strong>Fresh & organized</strong>
            <div className="pantry-bars"><i /><i /><i /><i /></div>
          </div>
          <div className="art-card art-list">
            <span className="art-icon">✓</span><span>Shopping list</span>
            <p><i className="checked">✓</i> Äpfel</p><p><i /> Hafermilch</p><p><i /> Brot</p>
          </div>
          <div className="art-card art-spend">
            <span className="art-icon">↗</span><span>This month</span><strong>Spending, in focus</strong>
            <div className="spend-bars"><i /><i /><i /><i /><i /><i /><i /></div>
          </div>
          <span className="art-leaf leaf-one">✳</span>
          <span className="art-leaf leaf-two">✿</span>
        </div>
      </section>

      <section className="feature-section" id="features">
        <p className="public-eyebrow">EVERYDAY MADE EASIER</p>
        <h2>One little home for the kitchen details.</h2>
        <div className="feature-grid">
          <article className="feature-card"><span>01</span><h3>Know what’s in stock</h3><p>Keep pantry items up to date and see what needs adding to your shopping list.</p></article>
          <article className="feature-card"><span>02</span><h3>Shop with a plan</h3><p>Move items to your shopping list and check them off as you go.</p></article>
          <article className="feature-card"><span>03</span><h3>Keep receipts together</h3><p>Record household expenses manually or scan a German-language receipt for review.</p></article>
          <article className="feature-card"><span>04</span><h3>See spending clearly</h3><p>Review expenses, set budgets and get simple, non-judgmental summaries.</p></article>
        </div>
      </section>

      <section className="privacy-callout">
        <span className="privacy-mark" aria-hidden="true">✦</span>
        <div><h2>Your kitchen is yours.</h2><p>My Kitchen is private to your household. Receipt images are sent securely to the scanning provider for processing and are not saved as receipt images by the app.</p></div>
        <Link to="/privacy">Read our privacy policy <span aria-hidden="true">→</span></Link>
      </section>
      <section className="landing-bottom">
        <p className="public-eyebrow">READY WHEN YOU ARE</p>
        <h2>Make room for a little more ease.</h2>
        <a className="public-button primary" href="/app">Go to My Kitchen</a>
      </section>
    </main>
  </PublicLayout>;
}

function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return <PublicLayout>
    <PageMeta title={title} description={intro} />
    <main className="legal-main">
      <p className="public-eyebrow">MY KITCHEN · SHOPPINGCART.AT</p>
      <h1>{title}</h1>
      <p className="legal-intro">{intro}</p>
      <p className="legal-date">Last updated: 6 November 2026</p>
      <div className="legal-content">{children}</div>
    </main>
  </PublicLayout>;
}

function PrivacyPage() {
  return <LegalPage
    title="Privacy Policy"
    intro="This policy explains what My Kitchen processes when you use the website and household app."
  >
    <h2>Who is responsible</h2>
    <p>
      The operator of My Kitchen is responsible for personal data processed through the service. See the <Link to="/imprint">Imprint</Link> for the operator’s identity and contact details. For privacy requests, contact {privacyEmail
        ? <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>
        : "the privacy contact listed in the Imprint"}.
    </p>
    {!operatorName || !operatorAddress || !privacyEmail
      ? <p className="legal-setup-warning">Before publication, configure the operator’s legal name, postal address and privacy contact email. The Imprint currently identifies which details are still required.</p>
      : null}

    <h2>Information we process</h2>
    <ul>
      <li><strong>Account and household:</strong> Firebase Authentication provides your Google sign-in identity. The app uses your user ID, verified email and, when available, your profile display name and photo URL to manage household membership.</li>
      <li><strong>Web storage:</strong> the signed-in website uses Firebase Authentication’s browser persistence to keep your session active. The public landing and policy pages do not use advertising cookies or analytics trackers.</li>
      <li><strong>Kitchen records:</strong> pantry and shopping-list entries, receipt details you save (such as store, date, totals and line items), budgets, alerts and settings are stored in the household’s Firebase Firestore database.</li>
      <li><strong>Device notifications:</strong> if push notifications are configured and enabled, the app may store a device push token, platform and account ID to route kitchen notifications. You can also disable notifications in your device settings.</li>
      <li><strong>Notification content:</strong> when a notification is sent, its content is routed through Expo and the relevant platform push service. It can include the names of finished items or a budget name and spending amounts.</li>
      <li><strong>Technical data:</strong> Firebase, Google Cloud and service providers may process network, request and diagnostic data needed to operate, secure and troubleshoot the service.</li>
    </ul>

    <h2>Receipt scanning and AI insights</h2>
    <p>
      When you choose to scan a receipt, the selected image is sent to Anthropic’s API for extraction. The app does not save the image as a receipt; parsed receipt information is returned for you to review and save. Do not scan documents containing information you do not want processed by the scanning provider.
    </p>
    <p>
      If you request an AI spending summary, the service sends aggregate figures such as period totals, receipt counts, categories and budget names/progress to Anthropic. It does not send receipt images, store names or individual line-item names for that summary. AI summaries are optional and are not financial advice.
    </p>
    <p>
      Firebase/Google Cloud hosts authentication, database and backend services. Google processes sign-in. Anthropic processes receipt scans and requested AI summaries. Their processing is governed by their own terms and privacy documentation. Data may be processed in locations outside your country; consult those providers’ current terms for details.
    </p>

    <h2>Purposes and legal basis</h2>
    <p>
      We use these data to provide the kitchen, shopping, receipt, budget and household features you request; secure accounts and prevent abuse; and maintain the service. Where GDPR applies, the operator must assess the applicable legal basis for each purpose, such as providing a requested feature or the legitimate interests in service security and operation. Optional receipt scanning and AI analysis are initiated by you and can be avoided by not using those features.
    </p>

    <h2>Sharing and advertising</h2>
    <p>
      Household members can see shared kitchen records. We do not sell personal data or use it for third-party advertising. Data is shared with the infrastructure and feature providers described above, and where required by law or to protect the service and its users.
    </p>

    <h2>Retention and deletion</h2>
    <p>
      Kitchen records remain in the household while they are stored there. Leaving a household removes your membership, member settings and associated device registrations, but does not automatically erase shared receipts, pantry records or other household records. A member can request deletion of their My Kitchen account from Settings; deleting a member account does not delete the household’s shared data. The owner must transfer ownership before deleting their own account. To request deletion of the entire household’s data, contact the operator.
    </p>
    <p>Some technical records may remain for as long as needed for security, service operation or legal obligations. The service currently does not offer a self-service full-household export and deletion workflow.</p>

    <h2>Your rights</h2>
    <p>
      Depending on your location, you may have rights to access, correct, delete, restrict or object to processing of your personal data, and to receive a portable copy. Contact the operator using the details in the Imprint. You may also have the right to complain to your local data protection authority. Records shared with a household may need to be handled by the household owner.
    </p>

    <h2>Security and children</h2>
    <p>
      The service uses Firebase authentication and database access controls. No online service can guarantee absolute security. My Kitchen is designed for household users and is not intended for children to use independently.
    </p>

    <h2>Changes</h2>
    <p>We may update this policy when the service or its data practices change. The latest version and its effective date will be posted on this page.</p>
  </LegalPage>;
}

function TermsPage() {
  return <LegalPage
    title="Terms of Use"
    intro="These terms cover your use of the My Kitchen website and household app."
  >
    <h2>Using the service</h2>
    <p>My Kitchen helps households organize pantry items, shopping lists, receipts, budgets and spending summaries. You need a Google account and an invitation or owner authorization to access a household. Keep your sign-in credentials and invitation codes private.</p>
    <h2>Your content and household</h2>
    <p>You are responsible for the information you enter and for having the right to share it with household members and service providers. Other authorized members can see shared household records. Do not upload sensitive identity, payment-card or health information.</p>
    <h2>Receipt scanning and AI</h2>
    <p>Scanning and AI features are optional and rely on third-party providers. Results may be incomplete or inaccurate; review scanned information before saving. Spending summaries are informational only and are not financial, tax, legal or investment advice.</p>
    <h2>Availability and acceptable use</h2>
    <p>We work to keep the service available but do not guarantee uninterrupted operation. Do not misuse the service, bypass access controls, interfere with its operation or use it unlawfully.</p>
    <h2>Changes and termination</h2>
    <p>Features or these terms may change as the service develops. You can stop using the service at any time. Account deletion and household data handling are described in the <Link to="/privacy">Privacy Policy</Link>.</p>
    <h2>Contact</h2>
    <p>For questions about these terms, use the contact details in the <Link to="/imprint">Imprint</Link>.</p>
  </LegalPage>;
}

function ImprintPage() {
  const configured = Boolean(operatorName && operatorAddress && supportEmail);
  return <LegalPage
    title="Imprint"
    intro="Publisher information and contact details for shoppingcart.at."
  >
    <h2>Service provider</h2>
    {configured
      ? <address>{operatorName}<br />{operatorAddress.split(/\r?\n/).map((line) => <span key={line}>{line}<br /></span>)}</address>
      : <p className="legal-setup-warning">Publisher details are not configured. Before making this website public, add the publisher’s full legal name and postal address in the web hosting environment.</p>}
    <h2>Contact</h2>
    {supportEmail
      ? <p>Email: <a href={`mailto:${supportEmail}`}>{supportEmail}</a></p>
      : <p className="legal-setup-warning">Configure a monitored support email address before publication.</p>}
    <h2>Responsible for content</h2>
    <p>{operatorName || "The website operator listed above"} is responsible for the content of this website.</p>
    <p className="legal-note">The operator should review this notice for the applicable Austrian disclosure requirements before publication.</p>
  </LegalPage>;
}

function SupportPage() {
  return <LegalPage title="Support" intro="Help with signing in, household invitations and using My Kitchen.">
    <h2>Sign-in help</h2>
    <p>Use a verified Google account. If you are new to a household, ask its owner for an invitation code. The owner must first initialize the kitchen.</p>
    <h2>Receipt scanning</h2>
    <p>Use a clear, well-lit photo of a German-language receipt. Scanned details should be checked before saving. You can also enter an expense manually.</p>
    <h2>Contact</h2>
    <p>{supportEmail
      ? <>Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. Please do not include passwords, invitation codes, receipt photos or other sensitive information in a support request.</>
      : "The support email is being configured. Please check back soon."}</p>
  </LegalPage>;
}

function AccountDeletionPage() {
  return <LegalPage title="Account deletion" intro="How to request deletion of your My Kitchen account and understand what happens to household records.">
    <h2>Delete your member account</h2>
    <p>In the signed-in app, open Settings and choose “Delete my account.” The account is removed from the household and Firebase Authentication. You will lose access immediately.</p>
    <h2>Shared household data</h2>
    <p>Deleting a member account does not delete shared household records, including receipts and pantry items. Ask the household owner if you need a shared record removed.</p>
    <h2>Owner accounts</h2>
    <p>The owner must transfer ownership to another member before deleting their own account. Deleting the owner account does not delete the household’s data. Full household export and deletion are not currently available as a self-service feature; contact the operator to discuss a request.</p>
    <h2>Need help?</h2>
    <p>{supportEmail
      ? <>Email <a href={`mailto:${supportEmail}?subject=My%20Kitchen%20account%20deletion`}>{supportEmail}</a> from the email address associated with your account. Do not send your password or invitation code.</>
      : "The support contact is being configured. The in-app account deletion option is available to household members."}</p>
  </LegalPage>;
}

function NotFoundPage() {
  return <LegalPage title="Page not found" intro="That page could not be found.">
    <p>Try returning to the <Link to="/">My Kitchen home page</Link>.</p>
  </LegalPage>;
}

export default function PublicSite() {
  return <Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/privacy" element={<PrivacyPage />} />
    <Route path="/terms" element={<TermsPage />} />
    <Route path="/imprint" element={<ImprintPage />} />
    <Route path="/support" element={<SupportPage />} />
    <Route path="/account-deletion" element={<AccountDeletionPage />} />
    <Route path="*" element={<NotFoundPage />} />
  </Routes>;
}
