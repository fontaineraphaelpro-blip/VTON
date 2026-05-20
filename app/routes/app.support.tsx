import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link } from "@remix-run/react";
import { Page } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { AdminPage } from "../components/AdminPage";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export default function Support() {
  return (
    <Page>
      <TitleBar title="Support - VTON Magic" />
      <div className="app-container">
        <AdminPage
          title="Support & contact"
          subtitle="Questions, bugs, or feedback — we're here to help."
        >
          <article className="vton-panel vton-doc">
            <div className="vton-doc__body">
              <section className="vton-doc__section">
                <h2>Get help</h2>
                <p>
                  If you have any questions, issues, or feedback about the Virtual Try-On app, please don&apos;t hesitate to reach out.
                </p>
              </section>

              <section className="vton-doc__section">
                <h2>Contact us</h2>
                <p>
                  <strong>Email:</strong>{" "}
                  <a href="mailto:fontaineraphaelpro@gmail.com">fontaineraphaelpro@gmail.com</a>
                </p>
                <p>We typically respond within 24–48 hours during business days.</p>
              </section>

              <section className="vton-doc__section">
                <h2>Report an issue</h2>
                <p>
                  If you encounter a bug or technical issue, please email us with:
                </p>
                <ul>
                  <li>A description of the issue</li>
                  <li>Steps to reproduce the problem</li>
                  <li>Screenshots or error messages (if applicable)</li>
                </ul>
              </section>

              <section className="vton-doc__section">
                <h2>Legal</h2>
                <div className="vton-doc__links">
                  <Link to="/app/privacy">Privacy Policy</Link>
                  <Link to="/app/terms">Terms of Service</Link>
                </div>
              </section>
            </div>
          </article>

          <article className="vton-panel vton-doc vton-doc--faq">
            <h2 className="vton-panel-title vton-panel-title--mb">Common questions</h2>
            <div className="vton-doc__body">
              <div className="vton-doc__faq-item">
                <h3>How do I set up the widget?</h3>
                <p>
                  The widget is automatically installed when you enable the app. Go to the Widget settings page to customize the button text and colors.
                </p>
              </div>
              <div className="vton-doc__faq-item">
                <h3>How do I enable try-on for specific products?</h3>
                <p>
                  Go to the Products page and toggle try-on on or off for each product individually.
                </p>
              </div>
              <div className="vton-doc__faq-item">
                <h3>What happens when I reach my monthly quota?</h3>
                <p>
                  When you reach your monthly quota or run out of generations, new try-ons pause until
                  your billing cycle resets or you upgrade on the Plans page. You can also turn
                  the widget off per product from Products.
                </p>
              </div>
              <div className="vton-doc__faq-item">
                <h3>Can I upgrade or downgrade my plan?</h3>
                <p>
                  Yes. Go to the Plans page to view available plans and upgrade or downgrade at any time.
                </p>
              </div>
            </div>
          </article>
        </AdminPage>
      </div>
    </Page>
  );
}
