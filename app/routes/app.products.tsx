import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  DataTable,
  Button,
  InlineStack,
  EmptyState,
  Thumbnail,
  Badge,
  Divider,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    const response = await admin.graphql(
      `#graphql
        query getProducts {
          products(first: 100) {
            edges {
              node {
                id
                title
                handle
                featuredImage {
                  url
                  altText
                }
                totalInventory
                status
              }
            }
          }
        }`
    );

    // Check if response is OK
    if (!response.ok) {
      // Handle 401 Unauthorized - authentication required
      if (response.status === 401) {
        const reauthUrl = response.headers.get('x-shopify-api-request-failure-reauthorize-url');
        console.error("Authentication required (401) for products query");
        return json({ 
          products: [], 
          shop: session.shop, 
          error: "Your session has expired. Please refresh the page to re-authenticate.",
          requiresAuth: true,
          reauthUrl: reauthUrl || null,
        });
      }
      
      const errorText = await response.text().catch(() => `HTTP ${response.status} ${response.statusText}`);
      console.error("GraphQL request failed:", response.status, errorText);
      return json({ 
        products: [], 
        shop: session.shop, 
        error: `Shopify API error (${response.status}): ${errorText.substring(0, 200)}` 
      });
    }

    let responseJson;
    try {
      responseJson = await response.json();
    } catch (jsonError) {
      console.error("Failed to parse JSON response:", jsonError);
      const errorText = await response.text().catch(() => "Unable to read response");
      return json({ 
        products: [], 
        shop: session.shop, 
        error: `Invalid response from Shopify: ${errorText.substring(0, 200)}` 
      });
    }

    // Check for GraphQL errors
    if (responseJson.errors) {
      const errorMessages = responseJson.errors.map((e: any) => e.message || String(e)).join(", ");
      console.error("GraphQL errors:", errorMessages);
      return json({ 
        products: [], 
        shop: session.shop, 
        error: `GraphQL error: ${errorMessages}` 
      });
    }

    const products =
      responseJson.data?.products?.edges?.map((edge: any) => edge.node) || [];

    console.log(`Loaded ${products.length} products for shop ${session.shop}`);
    return json({ products, shop: session.shop });
  } catch (error) {
    console.error("Error fetching products:", error);
    let errorMessage: string;
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = String(error.message);
    } else if (error && typeof error === 'object' && 'toString' in error) {
      errorMessage = error.toString();
    } else {
      errorMessage = "Unknown error occurred";
    }
    return json({ products: [], shop: session.shop, error: errorMessage });
  }
};

export default function Products() {
  const loaderData = useLoaderData<typeof loader>();
  const products = Array.isArray(loaderData?.products) ? loaderData.products : [];
  const error = loaderData?.error;

  const productRows = products.map((product: any) => {
    if (!product || !product.id) {
      return null;
    }
    
    const productId = product.id.replace("gid://shopify/Product/", "");
    return [
      <InlineStack key={product.id} gap="300" align="start">
        {product.featuredImage?.url && (
          <Thumbnail
            source={product.featuredImage.url}
            alt={product.featuredImage.altText || product.title || "Product"}
            size="small"
          />
        )}
        <BlockStack gap="050">
          <Text variant="bodyMd" fontWeight="semibold" as="span">
            {product.title || "Untitled Product"}
          </Text>
          {product.handle && (
            <Text variant="bodySm" tone="subdued" as="span">
              /{product.handle}
            </Text>
          )}
        </BlockStack>
      </InlineStack>,
      <Badge
        key={`status-${product.id}`}
        tone={product.status === "ACTIVE" ? "success" : "warning"}
      >
        {product.status || "UNKNOWN"}
      </Badge>,
      <Text key={`inventory-${product.id}`} variant="bodyMd" as="span">
        {product.totalInventory ?? 0}
      </Text>,
      <Button
        key={`btn-${product.id}`}
        url={`shopify:admin/products/${productId}`}
        target="_blank"
        variant="plain"
      >
        View
      </Button>,
    ];
  }).filter((row) => row !== null);

  return (
    <Page>
      <TitleBar title="Products - VTON Magic" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            {error && (
              <Banner 
                tone="critical" 
                title={loaderData?.requiresAuth ? "Authentication Required" : "Error"}
                action={loaderData?.requiresAuth && loaderData?.reauthUrl ? {
                  content: "Re-authenticate",
                  url: loaderData.reauthUrl,
                  target: "_top",
                } : undefined}
              >
                {error}
              </Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingLg" fontWeight="semibold">
                      Your Products
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      {products.length} product{products.length > 1 ? "s" : ""} available
                    </Text>
                  </BlockStack>
                  <Button
                    url="shopify:admin/products/new"
                    target="_blank"
                    variant="primary"
                  >
                    Create Product
                  </Button>
                </InlineStack>

                <Divider />

                {products.length === 0 ? (
                  <EmptyState
                    heading="No Products"
                    action={{
                      content: "Create Product",
                      url: "shopify:admin/products/new",
                      target: "_blank",
                    }}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>
                      Start by creating a product in Shopify. The Try-On widget will be automatically available once the product is created.
                    </p>
                  </EmptyState>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "numeric", "text"]}
                    headings={["Product", "Status", "Inventory", "Actions"]}
                    rows={productRows}
                  />
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
