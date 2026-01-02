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
  Badge,
  Banner,
  EmptyState,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getTryonLogs } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    await ensureTables();

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const logs = await getTryonLogs(shop, { limit, offset });

    return json({
      logs: Array.isArray(logs) ? logs : [],
      shop,
    });
  } catch (error) {
    console.error("History loader error:", error);
    return json({
      logs: [],
      shop,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export default function History() {
  const { logs, error } = useLoaderData<typeof loader>();

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return dateString;
    }
  };

  const formatLatency = (ms: number | null) => {
    if (!ms) return "-";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const rows = logs.map((log: any) => [
    formatDate(log.created_at),
    log.product_title || log.product_id || "-",
    log.customer_id || log.customer_ip || "-",
    <Badge key={`badge-${log.id}`} tone={log.success ? "success" : "critical"}>
      {log.success ? "Succès" : "Erreur"}
    </Badge>,
    formatLatency(log.latency_ms),
    log.error_message || "-",
  ]);

  return (
    <Page>
      <TitleBar title="Historique des essais - Try-On StyleLab" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {error && (
              <Banner tone="critical">
                Erreur lors du chargement de l'historique: {error}
              </Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Historique des essais Try-On
                  </Text>
                  <Text variant="bodyMd" tone="subdued" as="p">
                    {logs.length} session{logs.length > 1 ? "s" : ""}
                  </Text>
                </InlineStack>

                <Text variant="bodyMd" tone="subdued" as="p">
                  Consultez l'historique complet de toutes les tentatives
                  d'essayage virtuel effectuées sur votre boutique.
                </Text>

                {logs.length === 0 ? (
                  <EmptyState
                    heading="Aucun historique"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>
                      Aucune session d'essayage n'a encore été enregistrée.
                    </p>
                  </EmptyState>
                ) : (
                  <DataTable
                    columnContentTypes={[
                      "text",
                      "text",
                      "text",
                      "text",
                      "text",
                      "text",
                    ]}
                    headings={[
                      "Date",
                      "Produit",
                      "Client",
                      "Statut",
                      "Latence",
                      "Erreur",
                    ]}
                    rows={rows}
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

