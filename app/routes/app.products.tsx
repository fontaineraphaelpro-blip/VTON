import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useMemo, useCallback } from "react";
import {
  Page,
  BlockStack,
  InlineStack,
  Text,
  DataTable,
  Button,
  EmptyState,
  Thumbnail,
  Badge,
  Checkbox,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { AdminPage } from "../components/AdminPage";
import { AdminNotifications } from "../components/AdminNotifications";
import { useAdminNotifications, useNotificationSync } from "../hooks/useAdminNotifications";
import { useFetcherNotifications } from "../hooks/useFetcherNotifications";
import { authenticate } from "../shopify.server";
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
        products(first: 25) {
          edges { node { id title handle featuredImage { url altText } totalInventory status } }
        }
      }`;
    const response = await admin.graphql(productsQuery);

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
  const notifications = useAdminNotifications();
  const { notifications: notifyItems, dismiss } = notifications;

  useFetcherNotifications(fetcher, notifications, {
    onSuccess: () => ({
      title: "Product updated",
      message: "Try-on setting saved for this product.",
    }),
    onError: (data) => ({
      title: "Update failed",
      message: String((data as { error?: string }).error ?? "Unknown error"),
    }),
  });

  const loaderNotifications = useMemo(() => {
    const requiresAuth = Boolean((loaderData as { requiresAuth?: boolean })?.requiresAuth);
    const reauthUrl = (loaderData as { reauthUrl?: string })?.reauthUrl;
    return [
      {
        id: "products-loader-error",
        show: Boolean(error),
        tone: "critical" as const,
        priority: 1,
        title: requiresAuth ? "Authentication required" : "Error",
        message: error,
        action:
          requiresAuth && reauthUrl
            ? {
                label: "Re-authenticate",
                onAction: () => {
                  window.open(reauthUrl, "_top");
                },
              }
            : undefined,
      },
    ];
  }, [error, loaderData]);

  useNotificationSync(loaderNotifications, notifications);

  // Memoize handleToggle to prevent recreation on every render
  const handleToggle = useCallback((productId: string, productHandle: string | undefined, checked: boolean) => {
    const formData = new FormData();
    formData.append("intent", "toggle-product-tryon");
    formData.append("productId", productId);
    if (productHandle) {
      formData.append("productHandle", productHandle);
    }
    formData.append("enabled", checked ? "true" : "false");
    fetcher.submit(formData, { method: "post" });
  }, [fetcher]);

  // Memoize productRows to prevent recalculation on every render
  const productRows = useMemo(() => {
    return products.map((product: any) => {
      if (!product || !product.id) {
        return null;
      }
      
      const productId = product.id.replace("gid://shopify/Product/", "");
      const tryonEnabled = productSettings[product.id] !== false; // null or true means enabled, only false means disabled
      const tryonCount = tryonCounts[product.id] || 0;
      
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
          onChange={(checked) => handleToggle(product.id, product.handle, checked)}
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
  }, [products, productSettings, tryonCounts, fetcher, handleToggle]);

  return (
    <Page>
      <TitleBar title="Products - VTON Magic" />
      <div className="app-container">
        <AdminPage
          title="Products"
          subtitle="Le try-on est activé par défaut sur tous les produits — décochez pour le masquer sur une fiche"
        >
          <AdminNotifications items={notifyItems} onDismiss={dismiss} />

          <div className="vton-panel">
            <div className="vton-panel-header">
              <div>
                <h2 className="vton-panel-title">Catalog</h2>
                <p className="vton-field-hint" style={{ margin: "4px 0 0" }}>
                  {products.length} produit{products.length !== 1 ? "s" : ""} — try-on actif par
                  défaut sur chaque fiche produit du storefront
                </p>
              </div>
              <Button url="shopify:admin/products/new" target="_blank" variant="secondary">
                Créer un produit
              </Button>
            </div>
              <BlockStack gap="400">

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
                    columnContentTypes={["text", "text", "numeric", "numeric", "text", "text"]}
                    headings={["Product", "Status", "Inventory", "Try-On Usage", "Try-On Enabled", "Actions"]}
                    rows={productRows}
                  />
                )}
              </BlockStack>
          </div>
        </AdminPage>
      </div>
    </Page>
  );
}
