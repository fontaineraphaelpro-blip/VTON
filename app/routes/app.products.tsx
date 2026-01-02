import type { LoaderFunctionArgs } from "@remix-run/node";
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
  Banner,
  EmptyState,
  Thumbnail,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    // Fetch products from Shopify
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
  const { products, shop, error } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();

  const productRows = products.map((product: any) => {
    const productId = product.id.replace("gid://shopify/Product/", "");
    return [
      <InlineStack key={product.id} gap="200" align="start">
        {product.featuredImage && (
          <Thumbnail
            source={product.featuredImage.url}
            alt={product.featuredImage.altText || product.title}
            size="small"
          />
        )}
        <Text variant="bodyMd" fontWeight="semibold" as="span">
          {product.title}
        </Text>
      </InlineStack>,
      product.handle,
      product.status,
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
      <TitleBar title="Gestion des produits - Try-On StyleLab" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {error && (
              <Banner tone="critical">
                Erreur lors du chargement des produits: {error}
              </Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Produits Shopify
                </Text>
                <Text variant="bodyMd" tone="subdued" as="p">
                  Liste de vos produits Shopify. Le widget Try-On sera
                  automatiquement disponible sur les pages produits de votre
                  boutique.
                </Text>

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
                    <p>Commencez par créer un produit dans Shopify.</p>
                  </EmptyState>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text"]}
                    headings={["Produit", "Handle", "Statut", "Actions"]}
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

