import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, HeadersFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import {
  AppProvider as PolarisAppProvider,
  Button,
  Card,
  FormLayout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { login } from "../../shopify.server";

import { loginErrorMessage } from "./error.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

// Headers to ensure OAuth opens in main window (not iframe) - required for Firefox
export const headers: HeadersFunction = () => {
  return {
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "frame-ancestors 'none'",
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // Si la page est dans une iframe (embedded=1), retourner une page HTML qui force l'ouverture
  if (url.searchParams.get("embedded") === "1") {
    // Retirer le paramètre embedded
    url.searchParams.delete("embedded");
    const newUrl = url.pathname + url.search;
    
    // Retourner une page HTML qui force l'ouverture dans la fenêtre principale
    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting...</title>
  <meta http-equiv="X-Frame-Options" content="DENY">
  <meta http-equiv="Content-Security-Policy" content="frame-ancestors 'none'">
</head>
<body>
  <script>
    // Forcer l'ouverture dans la fenêtre principale
    if (window.top !== window.self) {
      // Si dans une iframe, essayer de rediriger la fenêtre parente
      try {
        window.top.location.href = "${newUrl}";
      } catch (e) {
        // Si bloqué (Firefox), ouvrir dans une nouvelle fenêtre
        window.open("${newUrl}", "_top");
      }
    } else {
      // Si déjà dans la fenêtre principale, rediriger normalement
      window.location.href = "${newUrl}";
    }
  </script>
  <noscript>
    <meta http-equiv="refresh" content="0;url=${newUrl}">
    <p>Redirecting... <a href="${newUrl}">Click here if you are not redirected</a></p>
  </noscript>
</body>
</html>`,
      {
        status: 200,
        headers: {
          "Content-Type": "text/html",
          "X-Frame-Options": "DENY",
          "Content-Security-Policy": "frame-ancestors 'none'",
        },
      }
    );
  }

  const errors = loginErrorMessage(await login(request));

  return { errors, polarisTranslations };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));

  return {
    errors,
  };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;

  return (
    <PolarisAppProvider i18n={loaderData.polarisTranslations}>
      <Page>
        <Card>
          <Form method="post">
            <FormLayout>
              <Text variant="headingMd" as="h2">
                Log in
              </Text>
              <TextField
                type="text"
                name="shop"
                label="Shop domain"
                helpText="example.myshopify.com"
                value={shop}
                onChange={setShop}
                autoComplete="on"
                error={errors.shop}
              />
              <Button submit>Log in</Button>
            </FormLayout>
          </Form>
        </Card>
      </Page>
    </PolarisAppProvider>
  );
}
