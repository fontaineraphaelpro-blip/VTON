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
      return new Date(dateString).toLocaleString("en-US", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return dateString;
    }
  };

  const formatLatency = (ms: number | null) => {
    if (!ms) return "-";
    // Always display in seconds
    return `${(ms / 1000).toFixed(1)} sec`;
  };

  const totalLogs = logs.length;
  const successfulLogs = logs.filter((log: any) => log.success).length;
  const successRate = totalLogs > 0 ? ((successfulLogs / totalLogs) * 100).toFixed(1) : "0.0";
  const avgLatency = totalLogs > 0
    ? (logs.reduce((sum: number, log: any) => sum + (log.latency_ms || 0), 0) / totalLogs / 1000).toFixed(1)
    : "0.0";

  const stats = [
    { label: "Total Attempts", value: totalLogs.toLocaleString("en-US"), icon: "" },
    { label: "Success Rate", value: `${successRate}%`, icon: "" },
    { label: "Average Latency", value: `${avgLatency} sec`, icon: "" },
  ];

  const rows = logs.map((log: any) => [
    formatDate(log.created_at),
    log.product_title || log.product_id || "-",
    log.customer_id || log.customer_ip || "-",
    <Badge key={`badge-${log.id}`} tone={log.success ? "success" : "critical"}>
      {log.success ? "Success" : "Error"}
    </Badge>,
    <Text key={`latency-${log.id}`} tone={log.latency_ms && log.latency_ms > 3000 ? "critical" : "subdued"}>
      {formatLatency(log.latency_ms)}
    </Text>,
    log.error_message || "-",
  ]);

  return (
    <Page>
      <TitleBar title="History - VTON Magic" />
      <Layout>
        <Layout.Section>
          <BlockStack gap="600">
            {error && (
              <Banner tone="critical" title="Error">
                Error loading history: {error}
              </Banner>
            )}

            <Layout>
              {stats.map((stat) => (
                <Layout.Section variant="oneThird" key={stat.label}>
                  <div className="vton-stat-card">
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="start">
                        <BlockStack gap="100">
                          <Text variant="heading2xl" as="p" fontWeight="bold">
                            {stat.value}
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="p">
                            {stat.label}
                          </Text>
                        </BlockStack>
                        <Text variant="headingLg" as="span">
                          {stat.icon}
                        </Text>
                      </InlineStack>
                    </BlockStack>
                  </div>
                </Layout.Section>
              ))}
            </Layout>

            <Divider />

            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingLg" fontWeight="semibold">
                      Try-On History
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      View the complete history of all virtual try-on attempts made on your store.
                    </Text>
                  </BlockStack>
                </InlineStack>

                <Divider />

                {logs.length === 0 ? (
                  <EmptyState
                    heading="No History"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>
                      No try-on sessions have been recorded yet.
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
                      "Product",
                      "Customer",
                      "Status",
                      "Latency",
                      "Error",
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
