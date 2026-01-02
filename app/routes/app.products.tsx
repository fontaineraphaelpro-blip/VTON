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
  Banner,
  EmptyState,
  Thumbnail,
  Badge,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { AppHeader } from "../components/AppHeader";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    const response = await admin.graphql(
      `#graphql
        query getProducts {
          products(first: 50) {
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

    const responseJson = await response.json();
    const products =
      responseJson.data?.products?.edges?.map((edge: any) => edge.node) || [];

    return json({ products, shop: session.shop });
  } catch (error) {
    console.error("Error fetching products:", error);
    return json({ products: [], shop: session.shop, error: String(error) });
  }
};

export default function Products() {
  const { products, error } = useLoaderData<typeof loader>();

  const productRows = products.map((product: any) => {
    const productId = product.id.replace("gid://shopify/Product/", "");
    return [
      <InlineStack key={product.id} gap="300" align="start">
        {product.featuredImage && (
          <Thumbnail
            source={product.featuredImage.url}
            alt={product.featuredImage.altText || product.title}
            size="small"
          />
        )}
        <BlockStack gap="050">
          <Text variant="bodyMd" fontWeight="semibold" as="span">
            {product.title}
          </Text>
          <Text variant="bodySm" tone="subdued" as="span">
            /{product.handle}
          </Text>
        </BlockStack>
      </InlineStack>,
      <Badge
        key={`status-${product.id}`}
        tone={product.status === "ACTIVE" ? "success" : "warning"}
      >
        {product.status}
      </Badge>,
      <Text key={`inventory-${product.id}`} variant="bodyMd" as="span">
        {product.totalInventory || 0}
      </Text>,
      <Button
        key={`btn-${product.id}`}
        url={`shopify:admin/products/${productId}`}
        target="_blank"
        variant="plain"
      >
        Voir
      </Button>,
    ];
  });

  return (
    <Page>
      <TitleBar title="Produits - VTON Magic" />
      <Layout>
        <Layout.Section>
          <div className="vton-page">
            <BlockStack gap="600">
            {/* App Header */}
            <AppHeader />

            {/* Banner valeur */}
            <Banner tone="info">
              <Text variant="bodyMd" as="p">
                <strong>Stop losing money on returns.</strong> Letting customers test products 
                virtually removes doubt. This slashes refunds and boosts conversion by{" "}
                <strong>2.5x instantly</strong>.
              </Text>
            </Banner>

            {error && (
              <Banner tone="critical" title="Erreur">
                Erreur lors du chargement des produits: {error}
              </Banner>
            )}

            {/* Produits */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingLg" fontWeight="semibold">
                      Vos produits
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      {products.length} produit{products.length > 1 ? "s" : ""} disponible{products.length > 1 ? "s" : ""}
                    </Text>
                  </BlockStack>
                  <Button
                    url="shopify:admin/products/new"
                    target="_blank"
                    variant="primary"
                  >
                    Créer un produit
                  </Button>
                </InlineStack>

                <Divider />

                {products.length === 0 ? (
                  <EmptyState
                    heading="Aucun produit"
                    action={{
                      content: "Créer un produit",
                      url: "shopify:admin/products/new",
                      target: "_blank",
                    }}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>
                      Commencez par créer un produit dans Shopify. Le widget Try-On sera automatiquement disponible une fois le produit créé.
                    </p>
                  </EmptyState>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "numeric", "text"]}
                    headings={["Produit", "Statut", "Stock", "Actions"]}
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
