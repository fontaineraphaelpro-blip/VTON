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
  Divider,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getTryonLogs } from "../lib/services/db.service";
import { ensureTables } from "../lib/db-init.server";
import { AppHeader } from "../components/AppHeader";

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

  const successCount = logs.filter((log: any) => log.success).length;
  const failureCount = logs.length - successCount;
  const avgLatency = logs.length > 0
    ? Math.round(
        logs.reduce((sum: number, log: any) => sum + (log.latency_ms || 0), 0) /
          logs.length
      )
    : 0;

  const rows = logs.map((log: any) => [
    formatDate(log.created_at),
    log.product_title || log.product_id || "-",
    log.customer_id || log.customer_ip || "-",
    <Badge key={`badge-${log.id}`} tone={log.success ? "success" : "critical"}>
      {log.success ? "Succès" : "Erreur"}
    </Badge>,
    <Text
      key={`latency-${log.id}`}
      variant="bodyMd"
      tone={log.latency_ms && log.latency_ms > 3000 ? "critical" : "subdued"}
      as="span"
    >
      {formatLatency(log.latency_ms)}
    </Text>,
    log.error_message ? (
      <Text key={`error-${log.id}`} variant="bodySm" tone="critical" as="span">
        {log.error_message.length > 50
          ? `${log.error_message.substring(0, 50)}...`
          : log.error_message}
      </Text>
    ) : (
      "-"
    ),
  ]);

  return (
    <Page>
      <TitleBar title="Historique - VTON Magic" />
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
                Erreur lors du chargement de l'historique: {error}
              </Banner>
            )}

            {/* Statistiques rapides */}
            {logs.length > 0 && (
              <Layout>
                <Layout.Section variant="oneThird">
                  <div className="vton-stat-card">
                    <BlockStack gap="200">
                      <div className="vton-stat-label">Total de sessions</div>
                      <div className="vton-stat-value">{logs.length}</div>
                    </BlockStack>
                  </div>
                </Layout.Section>
                <Layout.Section variant="oneThird">
                  <div className="vton-stat-card">
                    <BlockStack gap="200">
                      <div className="vton-stat-label">Taux de succès</div>
                      <div className="vton-stat-value">
                        {logs.length > 0
                          ? `${((successCount / logs.length) * 100).toFixed(1)}%`
                          : "0%"}
                      </div>
                    </BlockStack>
                  </div>
                </Layout.Section>
                <Layout.Section variant="oneThird">
                  <div className="vton-stat-card">
                    <BlockStack gap="200">
                      <div className="vton-stat-label">Latence moyenne</div>
                      <div className="vton-stat-value">
                        {avgLatency > 0 ? `${avgLatency}ms` : "-"}
                      </div>
                    </BlockStack>
                  </div>
                </Layout.Section>
              </Layout>
            )}

            {/* Tableau d'historique */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingLg" fontWeight="semibold">
                      Historique complet
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      {logs.length} session{logs.length > 1 ? "s" : ""} enregistrée{logs.length > 1 ? "s" : ""}
                    </Text>
                  </BlockStack>
                </InlineStack>

                <Divider />

                {logs.length === 0 ? (
                  <EmptyState
                    heading="Aucun historique"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>
                      Aucune session d'essayage n'a encore été enregistrée. Les tentatives d'essayage virtuel apparaîtront ici une fois que vos clients commenceront à utiliser le widget.
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
      </div>
    </Page>
  );
}
