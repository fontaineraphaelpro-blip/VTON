import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  // For embedded apps, don't show login form
  // Authentication happens via OAuth automatically
  return { showForm: false };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Try-On StyleLab</h1>
        <p className={styles.text}>
          Virtual try-on powered by AI for your Shopify store.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>AI-Powered Try-On</strong>. Let customers try on products
            virtually using advanced AI technology.
          </li>
          <li>
            <strong>Easy Integration</strong>. Seamlessly integrated with your
            Shopify store and products.
          </li>
          <li>
            <strong>Real-time Results</strong>. Get instant try-on results for
            your customers.
          </li>
        </ul>
      </div>
    </div>
  );
}
