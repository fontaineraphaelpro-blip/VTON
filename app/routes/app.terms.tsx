import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { AdminDocShell } from "../components/AdminDocShell";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export default function Terms() {
  const updatedAt = new Date().toLocaleDateString();

  return (
    <AdminDocShell
      titleBar="Terms of Service - VTON Magic"
      title="Terms of Service"
      subtitle="Subscription, usage limits, and responsibilities when using VTON Magic."
      updatedAt={updatedAt}
    >
      <section className="vton-doc__section">
        <h2>1. Acceptance of terms</h2>
        <p>
          By installing and using the Virtual Try-On application (&quot;the App&quot;), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the App.
        </p>
      </section>

      <section className="vton-doc__section">
        <h2>2. Description of service</h2>
        <p>
          The App provides virtual try-on functionality for your Shopify store, allowing customers to visualize products on themselves using AI-powered image generation.
        </p>
      </section>

      <section className="vton-doc__section">
        <h2>3. Subscription and billing</h2>
        <p>The App operates on a subscription basis with different pricing tiers:</p>
        <ul>
          <li>
            <strong>Free plan:</strong> 4 try-ons per month with watermark
          </li>
          <li>
            <strong>Paid plans:</strong> Various monthly quotas available
          </li>
        </ul>
        <p>
          Subscriptions are billed monthly through Shopify&apos;s billing system. You can cancel your subscription at any time through your Shopify admin.
        </p>
      </section>

      <section className="vton-doc__section">
        <h2>4. Usage limits</h2>
        <p>
          Each subscription plan has a monthly quota of try-ons. Once the quota is reached, the service will be unavailable until the next billing cycle. Quotas reset automatically each month.
        </p>
      </section>

      <section className="vton-doc__section">
        <h2>5. User responsibilities</h2>
        <p>You agree to:</p>
        <ul>
          <li>Use the App only for lawful purposes</li>
          <li>Not upload inappropriate or offensive content</li>
          <li>Comply with all applicable laws and regulations</li>
          <li>Maintain the security of your account</li>
        </ul>
      </section>

      <section className="vton-doc__section">
        <h2>6. Intellectual property</h2>
        <p>
          The App and all its content, features, and functionality are owned by us and are protected by international copyright, trademark, and other intellectual property laws.
        </p>
      </section>

      <section className="vton-doc__section">
        <h2>7. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses.
        </p>
      </section>

      <section className="vton-doc__section">
        <h2>8. Service availability</h2>
        <p>
          We strive to maintain high availability of the App, but we do not guarantee uninterrupted access. The App may be temporarily unavailable due to maintenance, updates, or unforeseen circumstances.
        </p>
      </section>

      <section className="vton-doc__section">
        <h2>9. Termination</h2>
        <p>
          You may terminate your use of the App at any time by uninstalling it from your Shopify store. We reserve the right to suspend or terminate your access to the App if you violate these Terms of Service.
        </p>
      </section>

      <section className="vton-doc__section">
        <h2>10. Changes to terms</h2>
        <p>
          We reserve the right to modify these Terms of Service at any time. We will notify you of any material changes by posting the updated terms in the App. Your continued use of the App after such changes constitutes acceptance of the new terms.
        </p>
      </section>

      <section className="vton-doc__section">
        <h2>11. Contact information</h2>
        <p>If you have questions about these Terms of Service, please contact us at:</p>
        <p>
          <strong>Email:</strong>{" "}
          <a href="mailto:fontaineraphaelpro@gmail.com">fontaineraphaelpro@gmail.com</a>
        </p>
      </section>
    </AdminDocShell>
  );
}
