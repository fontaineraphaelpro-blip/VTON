import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useState } from "react";
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
import { unauthenticated } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // For embedded apps, redirect to /auth for OAuth flow
  // This route is mainly for development/testing
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  
  if (shop) {
    // If shop parameter is provided, redirect to OAuth
    return redirect(`/auth?shop=${shop}`);
  }

  return { errors: {}, polarisTranslations };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const shop = formData.get("shop") as string;

  if (shop) {
    // Redirect to OAuth flow with shop parameter
    return redirect(`/auth?shop=${shop}`);
  }

  return {
    errors: { shop: "Please enter your shop domain" },
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
