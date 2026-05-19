import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useLoaderData,
  useFetcher,
  Form,
  useNavigate,
} from "@remix-run/react";
import { useMemo, useCallback, useState, useRef, useEffect } from "react";
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
  TextField,
  Pagination,
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
import { uploadGarmentImageToShopifyFiles } from "../lib/shopify-garment-file-upload.server";
import {
  PRODUCTS_PAGE_SIZE,
  buildProductsListUrl,
  type ShopifyProductRow as ProductRow,
  type ProductsPageInfo,
} from "../lib/shopify-products.shared";

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

    const url = new URL(request.url);
    const searchQuery = url.searchParams.get("q")?.trim() ?? "";
    const after = url.searchParams.get("after");
    const before = url.searchParams.get("before");

    let products: ProductRow[] = [];
    let pageInfo: ProductsPageInfo = {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
    };

    const { fetchProductsPage, ShopifyProductsFetchError } = await import(
      "../lib/shopify-products.server"
    );

    try {
      const page = await fetchProductsPage(admin, {
        search: searchQuery,
        after,
        before,
        pageSize: PRODUCTS_PAGE_SIZE,
      });
      products = page.products;
      pageInfo = page.pageInfo;
    } catch (fetchError) {
      if (
        fetchError instanceof ShopifyProductsFetchError &&
        fetchError.status === 401
      ) {
        return json({
          products: [] as ProductRow[],
          shop: session.shop,
          error:
            "Your session has expired. Please refresh the page to re-authenticate.",
          requiresAuth: true,
          reauthUrl: fetchError.reauthUrl || null,
        });
      }
      const message =
        fetchError instanceof Error ? fetchError.message : "Unknown error";
      return json({
        products: [] as ProductRow[],
        shop: session.shop,
        error: message,
        searchQuery,
        pageInfo,
      });
    }

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
      searchQuery,
      pageInfo,
      pageSize: PRODUCTS_PAGE_SIZE,
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
  const { session, admin } = await authenticate.admin(request);
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

  if (intent === "upload-tryon-image") {
    const productId = formData.get("productId") as string;
    const productHandle = (formData.get("productHandle") as string) || undefined;
    const file = formData.get("file");

    if (!productId) {
      return json({ success: false, error: "Product ID is required" });
    }
    if (!(file instanceof File)) {
      return json({ success: false, error: "Please choose an image file" });
    }

    try {
      const imageUrl = await uploadGarmentImageToShopifyFiles(admin, file);
      await setProductTryonImageUrl(shop, productId, imageUrl, productHandle);
      return json({ success: true, productId, imageUrl });
    } catch (error) {
      return json({
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to upload garment photo",
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
  onUpload,
  disabled,
  isUploading,
}: {
  product: ProductRow;
  selectedUrl: string | null;
  onSelect: (url: string) => void;
  onUpload: (file: File) => void;
  disabled: boolean;
  isUploading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUrl = selectedUrl || product.featuredImage?.url || null;
  const galleryUrls = new Set(product.mediaImages.map((img) => img.url));
  const customSelected =
    Boolean(selectedUrl) && !galleryUrls.has(selectedUrl as string);

  const activator = (
    <button
      type="button"
      className="vton-garment-picker-trigger"
      onClick={() => setOpen((v) => !v)}
      disabled={disabled || isUploading}
      title="Choose or upload garment photo for AI try-on"
      aria-expanded={open}
    >
      {activeUrl ? (
        <img src={activeUrl} alt="" className="vton-garment-picker-thumb" />
      ) : (
        <span className="vton-garment-picker-placeholder">Photo</span>
      )}
    </button>
  );

  const handleFileChange = (event: { target: HTMLInputElement }) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    onUpload(file);
    setOpen(false);
  };

  return (
    <Popover
      active={open}
      activator={activator}
      onClose={() => setOpen(false)}
      preferredAlignment="left"
      autofocusTarget="none"
    >
      <div className="vton-garment-popover">
        <BlockStack gap="300">
          <Text as="p" variant="bodySm" tone="subdued">
            Flat lay or packshot works best. Uploads are stored in Shopify Files
            for AI only — they never appear in your product gallery.
          </Text>

          {activeUrl && (
            <div className="vton-garment-popover__preview">
              <img src={activeUrl} alt="Selected garment for AI" />
            </div>
          )}

          <InlineStack gap="200" wrap>
            <Button
              size="slim"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
              loading={isUploading}
            >
              Upload image
            </Button>
            {selectedUrl && (
              <Button
                size="slim"
                variant="plain"
                onClick={() => {
                  onSelect("");
                  setOpen(false);
                }}
                disabled={disabled || isUploading}
              >
                Use default
              </Button>
            )}
          </InlineStack>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="vton-garment-popover__file-input"
            onChange={handleFileChange}
          />

          {product.mediaImages.length > 0 && (
            <>
              <Text as="p" variant="bodySm" fontWeight="semibold">
                Or pick from gallery
              </Text>
              <div className="vton-garment-popover__grid">
                {product.mediaImages.map((img) => {
                  const isSelected = selectedUrl === img.url;
                  return (
                    <button
                      key={img.id}
                      type="button"
                      className={
                        "vton-garment-option" +
                        (isSelected ? " is-selected" : "")
                      }
                      onClick={() => {
                        onSelect(img.url);
                        setOpen(false);
                      }}
                      disabled={disabled || isUploading}
                    >
                      <img src={img.url} alt={img.altText || ""} />
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {customSelected && selectedUrl && (
            <Text as="p" variant="bodySm" tone="subdued">
              Using a custom uploaded image.
            </Text>
          )}
        </BlockStack>
      </div>
    </Popover>
  );
}

export default function Products() {
  const loaderData = useLoaderData<typeof loader>();
  const products = (loaderData.products || []) as ProductRow[];
  const searchQuery = (loaderData as { searchQuery?: string }).searchQuery ?? "";
  const pageInfo = (loaderData as { pageInfo?: ProductsPageInfo }).pageInfo ?? {
    hasNextPage: false,
    hasPreviousPage: false,
    startCursor: null,
    endCursor: null,
  };
  const pageSize =
    (loaderData as { pageSize?: number }).pageSize ?? PRODUCTS_PAGE_SIZE;
  const error = loaderData.error || null;
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState(searchQuery);
  const tryonCounts = loaderData.tryonCounts || {};
  const productSettings = loaderData.productSettings || {};
  const fetcher = useFetcher<typeof action>();
  const [uploadingProductId, setUploadingProductId] = useState<string | null>(
    null
  );
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

  const handleUploadGarmentImage = useCallback(
    (productId: string, productHandle: string | undefined, file: File) => {
      setUploadingProductId(productId);
      const formData = new FormData();
      formData.append("intent", "upload-tryon-image");
      formData.append("productId", productId);
      if (productHandle) formData.append("productHandle", productHandle);
      formData.append("file", file);
      fetcher.submit(formData, { method: "post", encType: "multipart/form-data" });
    },
    [fetcher]
  );

  useEffect(() => {
    if (fetcher.state === "idle" && uploadingProductId) {
      setUploadingProductId(null);
    }
  }, [fetcher.state, uploadingProductId]);

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  const handleSearchSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const q = searchInput.trim();
      navigate(buildProductsListUrl({ q: q || undefined }));
    },
    [navigate, searchInput]
  );

  const handleClearSearch = useCallback(() => {
    setSearchInput("");
    navigate("/app/products");
  }, [navigate]);

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
            onUpload={(file) =>
              handleUploadGarmentImage(product.id, product.handle, file)
            }
            disabled={fetcher.state !== "idle"}
            isUploading={uploadingProductId === product.id}
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
    handleUploadGarmentImage,
    uploadingProductId,
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
                  {products.length} product{products.length !== 1 ? "s" : ""} on
                  this page ({pageSize} per page) — try-on is on by default
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

            <Form
              method="get"
              className="vton-products-toolbar"
              onSubmit={handleSearchSubmit}
            >
              <div className="vton-products-toolbar__search">
                <TextField
                  label="Search products"
                  labelHidden
                  value={searchInput}
                  onChange={setSearchInput}
                  placeholder="Search by title or handle"
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={handleClearSearch}
                />
              </div>
              <Button submit>Search</Button>
              {searchQuery ? (
                <Button variant="plain" onClick={handleClearSearch}>
                  Clear
                </Button>
              ) : null}
            </Form>

            <BlockStack gap="400">
              {products.length === 0 ? (
                <EmptyState
                  heading={searchQuery ? "No matching products" : "No products"}
                  action={
                    searchQuery
                      ? {
                          content: "Clear search",
                          onAction: handleClearSearch,
                        }
                      : {
                          content: "Create product",
                          url: "shopify:admin/products/new",
                          target: "_blank",
                        }
                  }
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>
                    {searchQuery
                      ? `No products match "${searchQuery}". Try another term or clear the search.`
                      : "Create a product in Shopify to enable virtual try-on on its product page."}
                  </p>
                </EmptyState>
              ) : (
                <>
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
                {(pageInfo.hasNextPage || pageInfo.hasPreviousPage) && (
                  <InlineStack align="center">
                    <Pagination
                      hasPrevious={pageInfo.hasPreviousPage}
                      onPrevious={() =>
                        navigate(
                          buildProductsListUrl({
                            q: searchQuery || undefined,
                            before: pageInfo.startCursor,
                          })
                        )
                      }
                      hasNext={pageInfo.hasNextPage}
                      onNext={() =>
                        navigate(
                          buildProductsListUrl({
                            q: searchQuery || undefined,
                            after: pageInfo.endCursor,
                          })
                        )
                      }
                    />
                  </InlineStack>
                )}
                </>
              )}
            </BlockStack>
          </div>
        </AdminPage>
      </div>
    </Page>
  );
}
