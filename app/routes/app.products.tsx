import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
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
  Checkbox,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { ensureTables } from "../lib/db-init.server";
import { getProductTryonCounts, setProductTryonSetting, getProductTryonSetting } from "../lib/services/db.service";

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
    const responseData = responseJson as any;
    if (responseData.errors) {
      const errorMessages = responseData.errors.map((e: any) => e.message || String(e)).join(", ");
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
    
    // ADDED: Load product settings and try-on counts
    await ensureTables();
    const shop = session.shop;
    
    // Get product IDs
    const productIds = products.map((p: any) => p.id);
    
    // Get try-on counts for all products
    const tryonCounts = await getProductTryonCounts(shop, productIds).catch(() => ({}));
    
    // Get product settings (try-on enabled/disabled)
    const productSettings: Record<string, boolean> = {};
    for (const product of products) {
      const setting = await getProductTryonSetting(shop, product.id).catch(() => null);
      // Default to true if not set
      productSettings[product.id] = setting !== false;
    }
    
    return json({ 
      products, 
      shop, 
      tryonCounts: tryonCounts || {},
      productSettings: productSettings || {},
    });
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

// ADDED: Action handler for toggling product try-on
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  
  if (intent === "toggle-product-tryon") {
    const productId = formData.get("productId") as string;
    const enabled = formData.get("enabled") === "true";
    
    if (!productId) {
      return json({ success: false, error: "Product ID is required" });
    }
    
    try {
      await ensureTables();
      await setProductTryonSetting(shop, productId, enabled);
      return json({ success: true, productId, enabled });
    } catch (error) {
      console.error("Error toggling product try-on:", error);
      return json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to update product setting" 
      });
    }
  }
  
  return json({ success: false, error: "Invalid action" });
};

export default function Products() {
  const loaderData = useLoaderData<typeof loader>();
  const products = Array.isArray((loaderData as any)?.products) ? (loaderData as any).products : [];
  const error = (loaderData as any)?.error || null;
  const tryonCounts = (loaderData as any)?.tryonCounts || {};
  const productSettings = (loaderData as any)?.productSettings || {};
  const fetcher = useFetcher<typeof action>();

  const productRows = products.map((product: any) => {
    if (!product || !product.id) {
      return null;
    }
    
    const productId = product.id.replace("gid://shopify/Product/", "");
    const tryonEnabled = productSettings[product.id] !== false; // Default to true
    const tryonCount = tryonCounts[product.id] || 0;
    
    // ADDED: Handle toggle
    const handleToggle = (checked: boolean) => {
      const formData = new FormData();
      formData.append("intent", "toggle-product-tryon");
      formData.append("productId", product.id);
      formData.append("enabled", checked ? "true" : "false");
      fetcher.submit(formData, { method: "post" });
    };
    
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
      // ADDED: Try-on usage count
      <Text key={`tryon-count-${product.id}`} variant="bodyMd" as="span">
        {tryonCount.toLocaleString("en-US")}
      </Text>,
      // ADDED: Try-on toggle checkbox
      <Checkbox
        key={`checkbox-${product.id}`}
        checked={tryonEnabled}
        onChange={handleToggle}
        disabled={fetcher.state === "submitting"}
        label=""
        labelHidden
      />,
      <Button
        key={`btn-${product.id}`}
        url={`shopify:admin/products/${productId}`}
        target="_blank"
        variant="plain"
      >
        View
      </Button>,
    ];
  }).filter((row: any) => row !== null);

  return (
    <Page>
      <TitleBar title="Products - VTON Magic" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            {error && (
              <Banner 
                tone="critical" 
                title={(loaderData as any)?.requiresAuth ? "Authentication Required" : "Error"}
                action={(loaderData as any)?.requiresAuth && (loaderData as any)?.reauthUrl ? {
                  content: "Re-authenticate",
                  url: (loaderData as any).reauthUrl,
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
                  <>
                    {fetcher.data?.success && (
                      <Banner tone="success" onDismiss={() => {}}>
                        Product try-on setting updated successfully
                      </Banner>
                    )}
                    {(fetcher.data as any)?.error && (
                      <Banner tone="critical" onDismiss={() => {}}>
                        {(fetcher.data as any).error}
                      </Banner>
                    )}
                    <DataTable
                      columnContentTypes={["text", "text", "numeric", "numeric", "text", "text"]}
                      headings={["Product", "Status", "Inventory", "Try-On Usage", "Try-On Enabled", "Actions"]}
                      rows={productRows}
                    />
                  </>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
