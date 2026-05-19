import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useMemo, useCallback, useState } from "react";
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
  Popover,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { AdminPage } from "../components/AdminPage";
import { AdminNotifications } from "../components/AdminNotifications";
import { useAdminNotifications, useNotificationSync } from "../hooks/useAdminNotifications";
import { useFetcherNotifications } from "../hooks/useFetcherNotifications";
import { authenticate } from "../shopify.server";
import {
  getProductTryonCounts,
  setProductTryonSetting,
  setProductTryonImageUrl,
  getProductSettingsBatch,
} from "../lib/services/db.service";

type ProductMediaImage = { id: string; url: string; altText?: string | null };

type ProductRow = {
  id: string;
  title: string;
  handle?: string;
  featuredImage?: { url: string; altText?: string | null } | null;
  totalInventory?: number;
  status?: string;
  mediaImages: ProductMediaImage[];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.admin(request);

    if (!session || !session.shop) {
      return json({
        products: [] as ProductRow[],
        shop: null,
        error: "Invalid session. Please refresh the page to re-authenticate.",
        requiresAuth: true,
      });
    }

    const productsQuery = `#graphql
      query getProducts {
        products(first: 25) {
          edges {
            node {
              id
              title
              handle
              featuredImage { url altText }
              totalInventory
              status
              media(first: 12) {
                edges {
                  node {
                    ... on MediaImage {
                      id
                      image { url altText }
                    }
                  }
                }
              }
            }
          }
        }
      }`;

    const response = await admin.graphql(productsQuery);

    if (!response.ok) {
      if (response.status === 401) {
        const reauthUrl = response.headers.get(
          "x-shopify-api-request-failure-reauthorize-url"
        );
        return json({
          products: [] as ProductRow[],
          shop: session.shop,
          error:
            "Your session has expired. Please refresh the page to re-authenticate.",
          requiresAuth: true,
          reauthUrl: reauthUrl || null,
        });
      }
      const errorText = await response
        .text()
        .catch(() => `HTTP ${response.status}`);
      return json({
        products: [] as ProductRow[],
        shop: session.shop,
        error: `Shopify API error (${response.status}): ${errorText.substring(0, 200)}`,
      });
    }

    const responseJson = (await response.json()) as {
      data?: {
        products?: {
          edges?: { node: Record<string, unknown> }[];
        };
      };
      errors?: { message: string }[];
    };

    if (responseJson.errors?.length) {
      return json({
        products: [] as ProductRow[],
        shop: session.shop,
        error: `GraphQL error: ${responseJson.errors.map((e) => e.message).join(", ")}`,
      });
    }

    const products: ProductRow[] =
      responseJson.data?.products?.edges?.map((edge) => {
        const node = edge.node as {
          id: string;
          title: string;
          handle?: string;
          featuredImage?: { url: string; altText?: string | null };
          totalInventory?: number;
          status?: string;
          media?: {
            edges?: {
              node?: {
                id?: string;
                image?: { url?: string; altText?: string | null };
              };
            }[];
          };
        };

        const mediaImages: ProductMediaImage[] = [];
        const seen = new Set<string>();

        const pushUrl = (id: string, url?: string, altText?: string | null) => {
          if (!url || seen.has(url)) return;
          seen.add(url);
          mediaImages.push({ id, url, altText });
        };

        if (node.featuredImage?.url) {
          pushUrl("featured", node.featuredImage.url, node.featuredImage.altText);
        }

        node.media?.edges?.forEach((m, idx) => {
          const img = m.node?.image;
          if (img?.url) {
            pushUrl(m.node?.id || `media-${idx}`, img.url, img.altText);
          }
        });

        return {
          id: node.id,
          title: node.title,
          handle: node.handle,
          featuredImage: node.featuredImage,
          totalInventory: node.totalInventory,
          status: node.status,
          mediaImages,
        };
      }) || [];

    const shop = session.shop;
    let tryonCounts: Record<string, number> = {};
    let productSettings: Record<
      string,
      { enabled: boolean; tryonImageUrl: string | null }
    > = {};

    try {
      const productIds = products.map((p) => p.id);
      const [countsRes, settingsRes] = await Promise.all([
        getProductTryonCounts(shop, productIds).catch(() => ({})),
        getProductSettingsBatch(shop, productIds).catch(() => ({})),
      ]);
      tryonCounts = countsRes;
      productIds.forEach((productId) => {
        const row = settingsRes[productId];
        productSettings[productId] = {
          enabled: row?.enabled !== false,
          tryonImageUrl: row?.tryonImageUrl ?? null,
        };
      });
    } catch (dbError) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Error loading product settings:", dbError);
      }
    }

    return json({
      products,
      shop,
      tryonCounts: tryonCounts || {},
      productSettings: productSettings || {},
    });
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    return json({
      products: [] as ProductRow[],
      shop: null,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

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
      return json({
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update product setting",
      });
    }
  }

  if (intent === "set-tryon-image") {
    const productId = formData.get("productId") as string;
    const productHandle = (formData.get("productHandle") as string) || undefined;
    const imageUrl = (formData.get("imageUrl") as string) || "";

    if (!productId) {
      return json({ success: false, error: "Product ID is required" });
    }

    try {
      await setProductTryonImageUrl(
        shop,
        productId,
        imageUrl || null,
        productHandle
      );
      return json({ success: true, productId, imageUrl: imageUrl || null });
    } catch (error) {
      return json({
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to save garment photo",
      });
    }
  }

  return json({ success: false, error: "Invalid action" });
};

function GarmentPhotoPicker({
  product,
  selectedUrl,
  onSelect,
  disabled,
}: {
  product: ProductRow;
  selectedUrl: string | null;
  onSelect: (url: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const activeUrl = selectedUrl || product.featuredImage?.url || null;

  const activator = (
    <button
      type="button"
      className="vton-garment-picker-trigger"
      onClick={() => setOpen((v) => !v)}
      disabled={disabled}
      title="Choose flat-lay photo for AI try-on"
    >
      {activeUrl ? (
        <img src={activeUrl} alt="" className="vton-garment-picker-thumb" />
      ) : (
        <span className="vton-garment-picker-placeholder">Photo</span>
      )}
    </button>
  );

  return (
    <Popover active={open} activator={activator} onClose={() => setOpen(false)}>
      <Box padding="300">
        <BlockStack gap="200">
          <Text as="p" variant="bodySm" tone="subdued">
            Garment photo for AI (flat lay works best). Shoppers still see your
            normal product gallery.
          </Text>
          <InlineStack gap="200" wrap>
            {product.mediaImages.map((img) => {
              const isSelected = selectedUrl === img.url;
              return (
                <button
                  key={img.id}
                  type="button"
                  className={
                    "vton-garment-option" + (isSelected ? " is-selected" : "")
                  }
                  onClick={() => {
                    onSelect(img.url);
                    setOpen(false);
                  }}
                >
                  <img src={img.url} alt={img.altText || ""} />
                </button>
              );
            })}
          </InlineStack>
          {selectedUrl && (
            <Button
              size="slim"
              onClick={() => {
                onSelect("");
                setOpen(false);
              }}
            >
              Use theme default
            </Button>
          )}
        </BlockStack>
      </Box>
    </Popover>
  );
}

export default function Products() {
  const loaderData = useLoaderData<typeof loader>();
  const products = (loaderData.products || []) as ProductRow[];
  const error = loaderData.error || null;
  const tryonCounts = loaderData.tryonCounts || {};
  const productSettings = loaderData.productSettings || {};
  const fetcher = useFetcher<typeof action>();
  const notifications = useAdminNotifications();
  const { notifications: notifyItems, dismiss } = notifications;

  useFetcherNotifications(fetcher, notifications, {
    onSuccess: (data) => {
      const d = data as { imageUrl?: string | null };
      if (d.imageUrl !== undefined) {
        return {
          title: "Garment photo saved",
          message: "AI try-on will use this image instead of the first gallery photo.",
        };
      }
      return {
        title: "Product updated",
        message: "Try-on setting saved for this product.",
      };
    },
    onError: (data) => ({
      title: "Update failed",
      message: String((data as { error?: string }).error ?? "Unknown error"),
    }),
  });

  const loaderNotifications = useMemo(() => {
    const requiresAuth = Boolean(loaderData.requiresAuth);
    const reauthUrl = loaderData.reauthUrl;
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

  const handleToggle = useCallback(
    (productId: string, productHandle: string | undefined, checked: boolean) => {
      const formData = new FormData();
      formData.append("intent", "toggle-product-tryon");
      formData.append("productId", productId);
      if (productHandle) formData.append("productHandle", productHandle);
      formData.append("enabled", checked ? "true" : "false");
      fetcher.submit(formData, { method: "post" });
    },
    [fetcher]
  );

  const handleSelectGarmentImage = useCallback(
    (productId: string, productHandle: string | undefined, imageUrl: string) => {
      const formData = new FormData();
      formData.append("intent", "set-tryon-image");
      formData.append("productId", productId);
      if (productHandle) formData.append("productHandle", productHandle);
      formData.append("imageUrl", imageUrl);
      fetcher.submit(formData, { method: "post" });
    },
    [fetcher]
  );

  const productRows = useMemo(() => {
    return products
      .map((product) => {
        if (!product?.id) return null;

        const numericId = product.id.replace("gid://shopify/Product/", "");
        const settings = productSettings[product.id] || {
          enabled: true,
          tryonImageUrl: null,
        };
        const tryonCount = tryonCounts[product.id] || 0;

        return [
          <InlineStack key={product.id} gap="300" align="start">
            {product.featuredImage?.url && (
              <Thumbnail
                source={product.featuredImage.url}
                alt={product.featuredImage.altText || product.title}
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
          <Text key={`tryon-count-${product.id}`} variant="bodyMd" as="span">
            {tryonCount.toLocaleString("en-US")}
          </Text>,
          <GarmentPhotoPicker
            key={`garment-${product.id}`}
            product={product}
            selectedUrl={settings.tryonImageUrl}
            onSelect={(url) =>
              handleSelectGarmentImage(product.id, product.handle, url)
            }
            disabled={fetcher.state === "submitting"}
          />,
          <Checkbox
            key={`checkbox-${product.id}`}
            checked={settings.enabled}
            onChange={(checked) =>
              handleToggle(product.id, product.handle, checked)
            }
            disabled={fetcher.state === "submitting"}
            label=""
            labelHidden
          />,
          <Button
            key={`btn-${product.id}`}
            url={`shopify:admin/products/${numericId}`}
            target="_blank"
            variant="plain"
          >
            View
          </Button>,
        ];
      })
      .filter((row): row is React.ReactNode[] => row !== null);
  }, [
    products,
    productSettings,
    tryonCounts,
    fetcher.state,
    handleToggle,
    handleSelectGarmentImage,
  ]);

  return (
    <Page>
      <TitleBar title="Products - VTON Magic" />
      <div className="app-container">
        <AdminPage
          title="Products"
          subtitle="Disable try-on per product and pick a flat-lay garment photo for better AI results (customers still see your normal gallery)."
        >
          <AdminNotifications items={notifyItems} onDismiss={dismiss} />

          <div className="vton-panel">
            <div className="vton-panel-header">
              <div>
                <h2 className="vton-panel-title">Catalog</h2>
                <p className="vton-field-hint" style={{ margin: "4px 0 0" }}>
                  {products.length} product{products.length !== 1 ? "s" : ""} —
                  try-on is active by default on every storefront product page
                </p>
              </div>
              <Button
                url="shopify:admin/products/new"
                target="_blank"
                variant="secondary"
              >
                Create product
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
                    Create a product in Shopify to enable virtual try-on on its
                    product page.
                  </p>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={[
                    "text",
                    "text",
                    "numeric",
                    "numeric",
                    "text",
                    "text",
                    "text",
                  ]}
                  headings={[
                    "Product",
                    "Status",
                    "Inventory",
                    "Try-On Usage",
                    "AI garment photo",
                    "Try-On enabled",
                    "Actions",
                  ]}
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
