import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { AdminDocShell } from "../components/AdminDocShell";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export default function Privacy() {
  const updatedAt = new Date().toLocaleDateString();

  return (
    <AdminDocShell
      titleBar="Privacy Policy - VTON Magic"
      title="Privacy Policy"
      subtitle="How we collect, use, and protect your store and customer data."
      updatedAt={updatedAt}
    >
      <section className="vton-doc__section">
        <h2>1. Information we collect</h2>
        <p>When you use our Virtual Try-On application, we collect the following information:</p>
        <ul>
          <li>
            <strong>Shop information:</strong> Your Shopify shop domain and basic shop settings
          </li>
          <li>
            <strong>Product data:</strong> Product IDs and images that you enable for virtual try-on
          </li>
          <li>
            <strong>Usage statistics:</strong> Aggregated data about try-on usage, conversion rates, and widget interactions
          </li>
          <li>
            <strong>Customer photos:</strong> Photos uploaded by customers for virtual try-on are processed securely and deleted immediately after generation. We do not store customer photos.
          </li>
        </ul>
      </section>

      <section className="vton-doc__section">
        <h2>2. How we use your information</h2>
        <p>We use the information we collect to:</p>
        <ul>
          <li>Provide and improve our virtual try-on service</li>
          <li>Process customer photos for virtual try-on generation</li>
          <li>Generate usage statistics and analytics for your shop</li>
          <li>Communicate with you about your account and our services</li>
        </ul>
      </section>

      <section className="vton-doc__section">
        <h2>3. Data storage and security</h2>
        <p>We take data security seriously:</p>
        <ul>
          <li>All data is stored securely using industry-standard encryption</li>
          <li>Customer photos are processed through secure APIs and deleted immediately after generation</li>
          <li>We do not share your data with third parties except as necessary to provide our service</li>
        </ul>
      </section>

      <section className="vton-doc__section">
        <h2>4. Your rights</h2>
        <p>Under GDPR and other privacy laws, you have the right to:</p>
        <ul>
          <li>Access your personal data</li>
          <li>Request correction of inaccurate data</li>
          <li>Request deletion of your data</li>
          <li>Object to processing of your data</li>
        </ul>
        <p>
          To exercise these rights, please contact us at{" "}
          <a href="mailto:fontaineraphaelpro@gmail.com">fontaineraphaelpro@gmail.com</a>
        </p>
      </section>

      <section className="vton-doc__section">
        <h2>5. Data retention</h2>
        <p>
          We retain your shop data for as long as your account is active. When you uninstall the app, all your data is permanently deleted within 30 days.
        </p>
      </section>

      <section className="vton-doc__section">
        <h2>6. Contact us</h2>
        <p>If you have questions about this Privacy Policy, please contact us at:</p>
        <p>
          <strong>Email:</strong>{" "}
          <a href="mailto:fontaineraphaelpro@gmail.com">fontaineraphaelpro@gmail.com</a>
        </p>
      </section>
    </AdminDocShell>
  );
}
