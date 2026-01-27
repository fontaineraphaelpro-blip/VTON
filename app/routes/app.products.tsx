import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useState, useEffect, useMemo, useCallback } from "react";
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
import { getProductTryonCounts, setProductTryonSetting, getProductTryonSettingsBatch } from "../lib/services/db.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request);

    if (!session || !session.shop) {
      return json({ 
        products: [], 
        shop: null,
        error: "Invalid session. Please refresh the page to re-authenticate.",
        requiresAuth: true,
      });
    }

    const productsQuery = `#graphql
      query getProducts {
        products(first: 100) {
          edges { node { id title handle featuredImage { url altText } totalInventory status } }
        }
      }`;
    const [response] = await Promise.all([
      admin.graphql(productsQuery),
      ensureTables(),
    ]);

    // Check if response is OK
    if (!response.ok) {
      // Handle 401 Unauthorized - authentication required
      if (response.status === 401) {
        const reauthUrl = response.headers.get('x-shopify-api-request-failure-reauthorize-url');
        // Authentication required - log only in development
        if (process.env.NODE_ENV !== "production") {
          console.error("Authentication required (401) for products query");
        }
        return json({ 
          products: [], 
          shop: session.shop, 
          error: "Your session has expired. Please refresh the page to re-authenticate.",
          requiresAuth: true,
          reauthUrl: reauthUrl || null,
        });
      }
      
      const errorText = await response.text().catch(() => `HTTP ${response.status} ${response.statusText}`);
      // Log only in development
      if (process.env.NODE_ENV !== "production") {
        console.error("GraphQL request failed:", response.status, errorText);
      }
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
      // Log only in development
      if (process.env.NODE_ENV !== "production") {
        console.error("Failed to parse JSON response:", jsonError);
      }
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
      // Log only in development
      if (process.env.NODE_ENV !== "production") {
        console.error("GraphQL errors:", errorMessages);
      }
      return json({ 
        products: [], 
        shop: session.shop, 
        error: `GraphQL error: ${errorMessages}` 
      });
    }

    const products =
      responseJson.data?.products?.edges?.map((edge: any) => edge.node) || [];

    // Products loaded (log only in development)
    
    const shop = session.shop;
    let tryonCounts: Record<string, number> = {};
    let productSettings: Record<string, boolean> = {};
    
    // Load product settings and try-on counts (ensureTables already ran in parallel with GraphQL)
    try {
      const productIds = products.map((p: any) => p.id);
      const [countsRes, batchSettings] = await Promise.all([
        getProductTryonCounts(shop, productIds).catch(() => ({})),
        getProductTryonSettingsBatch(shop, productIds).catch(() => ({})),
      ]);
      tryonCounts = countsRes;
      productIds.forEach((productId: string) => {
        productSettings[productId] = batchSettings[productId] !== false;
      });
    } catch (dbError) {
      // Log only in development
      if (process.env.NODE_ENV !== "production") {
        console.error("Error loading product settings:", dbError);
      }
      // Continue even if database queries fail
    }
    
    return json({ 
      products, 
      shop, 
      tryonCounts: tryonCounts || {},
      productSettings: productSettings || {},
    });
  } catch (error) {
    // Log only in development
    if (process.env.NODE_ENV !== "production") {
      console.error("Error in products loader:", error);
    }
    
    // If authenticate.admin throws a Response (redirect), propagate it
    if (error instanceof Response) {
      throw error;
    }
    
    let errorMessage: string;
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = String(error.message);
    } else {
      errorMessage = "Unknown error occurred";
    }
    return json({ 
      products: [], 
      shop: null, 
      error: errorMessage 
    });
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
    const productHandle = formData.get("productHandle") as string;
    const enabled = formData.get("enabled") === "true";
    
    if (!productId) {
      return json({ success: false, error: "Product ID is required" });
    }
    
    try {
      await ensureTables();
      await setProductTryonSetting(shop, productId, enabled, productHandle);
      return json({ success: true, productId, enabled });
    } catch (error) {
      // Log only in development
      if (process.env.NODE_ENV !== "production") {
        console.error("Error toggling product try-on:", error);
      }
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
  
  // State for managing success/error notifications
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [showErrorBanner, setShowErrorBanner] = useState(false);
  
  // Show success banner when fetcher.data?.success changes
  useEffect(() => {
    if (fetcher.data?.success) {
      setShowSuccessBanner(true);
      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        setShowSuccessBanner(false);
      }, 5000);
      return () => clearTimeout(timer);
    } else if (fetcher.state === 'idle' && !fetcher.data?.success) {
      // Reset banner when fetcher is idle and no success
      setShowSuccessBanner(false);
    }
  }, [fetcher.data?.success, fetcher.state]);
  
  // Show error banner when fetcher.data?.error changes
  useEffect(() => {
    if ((fetcher.data as any)?.error) {
      setShowErrorBanner(true);
      // Auto-hide after 7 seconds (errors stay a bit longer)
      const timer = setTimeout(() => {
        setShowErrorBanner(false);
      }, 7000);
      return () => clearTimeout(timer);
    } else if (fetcher.state === 'idle' && !(fetcher.data as any)?.error) {
      // Reset banner when fetcher is idle and no error
      setShowErrorBanner(false);
    }
  }, [(fetcher.data as any)?.error, fetcher.state]);

  // Memoize productRows to prevent recalculation on every render
  const productRows = useMemo(() => {
    return products.map((product: any) => {
      if (!product || !product.id) {
        return null;
      }
      
      const productId = product.id.replace("gid://shopify/Product/", "");
      const tryonEnabled = productSettings[product.id] !== false; // null or true means enabled, only false means disabled
      const tryonCount = tryonCounts[product.id] || 0;
      
      // ADDED: Handle toggle
      const handleToggle = (checked: boolean) => {
        const formData = new FormData();
        formData.append("intent", "toggle-product-tryon");
        formData.append("productId", product.id);
        if (product.handle) {
          formData.append("productHandle", product.handle);
        }
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
    }).filter((row: (React.ReactNode | null)[]) => row !== null);
  }, [products, productSettings, tryonCounts, fetcher]);

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
                    {(showSuccessBanner || fetcher.data?.success) && (
                      <Banner 
                        tone="success" 
                        onDismiss={() => {
                          setShowSuccessBanner(false);
                          // Clear fetcher data to prevent re-showing
                          if (fetcher.data?.success) {
                            fetcher.load('/app/products');
                          }
                        }}
                      >
                        Product try-on setting updated successfully
                      </Banner>
                    )}
                    {(showErrorBanner || (fetcher.data as any)?.error) && (
                      <Banner 
                        tone="critical" 
                        onDismiss={() => {
                          setShowErrorBanner(false);
                          // Clear fetcher data to prevent re-showing
                          if ((fetcher.data as any)?.error) {
                            fetcher.load('/app/products');
                          }
                        }}
                      >
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
