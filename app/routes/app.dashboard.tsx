import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Banner,
  Button,
  BlockStack,
  InlineStack,
  ResourceList,
  ResourceItem,
  Badge,
  ProgressBar,
  Spinner,
} from "@shopify/polaris";
import {
  CreditCardIcon,
  SettingsIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import {
  getShop,
  getTryonLogs,
  getTopProducts,
  upsertShop,
} from "../lib/services/db.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // App routes can be embedded - no need to force top-level
  // Just authenticate normally
  const { admin, session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  try {
    // Get shop data
    let shop = await getShop(shopDomain);

    // Create shop if it doesn't exist
    if (!shop) {
      shop = await upsertShop(shopDomain, {
        credits: 100, // Initial credits
      });
    }

    // Calculate dates
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get logs
    const logsToday = await getTryonLogs(shopDomain, { date: today });
    const logsYesterday = await getTryonLogs(shopDomain, { date: yesterday });
    const logsWeek = await getTryonLogs(shopDomain, { startDate: weekAgo });
    const logsMonth = await getTryonLogs(shopDomain, { startDate: monthAgo });

    // Calculate stats
    const totalTryons = shop.total_tryons || 0;
    const totalAtc = shop.total_atc || 0;
    const conversionRate = totalTryons > 0 ? (totalAtc / totalTryons) * 100 : 0;

    const tryonsToday = logsToday.length;
    const tryonsYesterday = logsYesterday.length;
    const tryonsWeek = logsWeek.length;
    const tryonsMonth = logsMonth.length;

    const changeVsYesterday =
      tryonsYesterday > 0
        ? ((tryonsToday - tryonsYesterday) / tryonsYesterday) * 100
        : 0;

    // Average latency
    const latencies = logsMonth
      .filter((log: any) => log.latency_ms)
      .map((log: any) => log.latency_ms);
    const avgLatency =
      latencies.length > 0
        ? latencies.reduce((a: number, b: number) => a + b, 0) / latencies.length
        : 0;

    // Error rate
    const failedMonth = logsMonth.filter((log: any) => !log.success).length;
    const errorRate =
      logsMonth.length > 0 ? (failedMonth / logsMonth.length) * 100 : 0;

    // Top products
    const topProducts = await getTopProducts(shopDomain, 10);

    // Credit forecasts
    const dailyBurnRate = tryonsMonth / 30;
    const daysRemaining =
      dailyBurnRate > 0 ? shop.credits / dailyBurnRate : 999;

    // VIP status
    const vipThreshold = 500;
    const vipProgress = Math.min(
      ((shop.lifetime_credits || 0) / vipThreshold) * 100,
      100
    );
    const isVip = (shop.lifetime_credits || 0) >= vipThreshold;

    // Update last_active_at
    await upsertShop(shopDomain, {});

    return json({
      shop: {
        domain: shop.domain,
        installed_at: shop.installed_at,
        is_vip: isVip,
      },
      billing: {
        credits: shop.credits || 0,
        lifetime_credits: shop.lifetime_credits || 0,
        daily_burn_rate: Math.round(dailyBurnRate * 100) / 100,
        days_remaining: Math.floor(daysRemaining),
        vip_progress: Math.round(vipProgress * 10) / 10,
      },
      usage: {
        total_tryons: totalTryons,
        total_atc: totalAtc,
        conversion_rate: Math.round(conversionRate * 100) / 100,
        tryons_today: tryonsToday,
        tryons_yesterday: tryonsYesterday,
        tryons_week: tryonsWeek,
        tryons_month: tryonsMonth,
        change_vs_yesterday: Math.round(changeVsYesterday * 10) / 10,
      },
      performance: {
        avg_latency_ms: Math.floor(avgLatency),
        error_rate: Math.round(errorRate * 100) / 100,
        success_rate: Math.round((100 - errorRate) * 100) / 100,
      },
      top_products: topProducts,
      widget: {
        text: shop.widget_text || "Try It On Now ✨",
        bg: shop.widget_bg || "#000000",
        color: shop.widget_color || "#ffffff",
      },
      settings: {
        max_tries_per_user: shop.max_tries_per_user || 5,
      },
    });
  } catch (error) {
    console.error("Error loading dashboard:", error);
    return json(
      {
        error: "Failed to load dashboard data",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "save_settings") {
      const text = formData.get("text") as string;
      const bg = formData.get("bg") as string;
      const color = formData.get("color") as string;
      const max_tries = formData.get("max_tries") as string;

      if (!text || !bg || !color) {
        return json({ error: "Missing required fields" }, { status: 400 });
      }

      const bgColor = bg.startsWith("#") ? bg : `#${bg}`;
      const textColor = color.startsWith("#") ? color : `#${color}`;

      await upsertShop(shopDomain, {
        widgetText: text,
        widgetBg: bgColor,
        widgetColor: textColor,
        maxTriesPerUser: max_tries ? parseInt(max_tries) : undefined,
      });

      return json({ success: true });
    }

    if (intent === "track_atc") {
      const shop = await getShop(shopDomain);
      if (shop) {
        await upsertShop(shopDomain, {
          // Increment total_atc
        });
        // Note: We need to add a method to increment total_atc
        // For now, this is a placeholder
      }
      return json({ success: true });
    }

    return json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Error in action:", error);
    return json(
      { error: "Action failed", message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
};

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  if ("error" in data) {
    return (
      <Page>
        <Layout>
          <Layout.Section>
            <Banner tone="critical" title="Erreur de chargement">
              <p>Impossible de charger les données du dashboard: {data.message}</p>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const {
    shop,
    billing,
    usage,
    performance,
    top_products,
    widget,
    settings,
  } = data;

  // Format numbers
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("fr-FR").format(num);
  };

  const formatPercentage = (num: number) => {
    return `${num.toFixed(1)}%`;
  };

  // VIP badge
  const vipBadge = shop.is_vip ? (
    <Badge tone="success">VIP</Badge>
  ) : (
    <Badge>Standard</Badge>
  );

  // Change vs yesterday
  const changeBadge =
    usage.change_vs_yesterday > 0 ? (
      <Badge tone="success">
        {`+${formatPercentage(usage.change_vs_yesterday)}`}
      </Badge>
    ) : usage.change_vs_yesterday < 0 ? (
      <Badge tone="attention">
        {`-${Math.abs(usage.change_vs_yesterday).toFixed(1)}%`}
      </Badge>
    ) : (
      <Badge>{formatPercentage(usage.change_vs_yesterday)}</Badge>
    );

  return (
    <Page
      title="Virtual Try-On Dashboard"
      subtitle={`Boutique: ${shop.domain}`}
      primaryAction={{
        content: "Acheter des crédits",
        icon: CreditCardIcon,
        onAction: () => {
          // TODO: Implement credit purchase
          console.log("Acheter des crédits");
        },
      }}
      secondaryActions={[
        {
          content: "Paramètres",
          icon: SettingsIcon,
          onAction: () => {
            // TODO: Implement settings
            console.log("Paramètres");
          },
        },
      ]}
    >
      <Layout>
        {/* VIP Status & Credits */}
        <Layout.Section>
          <Card>
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">
                  Statut & Crédits
                </Text>
                <InlineStack gap="200">
                  {vipBadge}
                  <Text variant="bodyMd" as="p">
                    {formatNumber(billing.credits)} crédits disponibles
                  </Text>
                </InlineStack>
              </BlockStack>
              {!shop.is_vip && (
                <BlockStack gap="200">
                  <Text variant="bodyMd" as="p" alignment="end">
                    Progression VIP: {formatPercentage(billing.vip_progress)}
                  </Text>
                  <ProgressBar progress={billing.vip_progress} size="small" />
                  <Text variant="bodySm" as="p" tone="subdued">
                    {formatNumber(billing.lifetime_credits)} / {formatNumber(500)} crédits
                  </Text>
                </BlockStack>
              )}
            </InlineStack>
          </Card>
        </Layout.Section>

        {/* Main Stats */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">
                Try-Ons Aujourd'hui
              </Text>
              <Text variant="headingXl" as="p">
                {formatNumber(usage.tryons_today)}
              </Text>
              <InlineStack gap="200">
                {changeBadge}
                <Text variant="bodySm" as="p" tone="subdued">
                  vs hier
                </Text>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">
                Total Try-Ons
              </Text>
              <Text variant="headingXl" as="p">
                {formatNumber(usage.total_tryons)}
              </Text>
              <Text variant="bodySm" as="p" tone="subdued">
                {formatNumber(usage.tryons_week)} cette semaine
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">
                Taux de Conversion
              </Text>
              <Text variant="headingXl" as="p">
                {formatPercentage(usage.conversion_rate)}
              </Text>
              <Text variant="bodySm" as="p" tone="subdued">
                {formatNumber(usage.total_atc)} ajouts au panier
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Performance */}
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">
                Performance
              </Text>
              <InlineStack align="space-between">
                <BlockStack gap="200">
                  <Text variant="bodyMd" as="p" tone="subdued">
                    Latence moyenne
                  </Text>
                  <Text variant="headingLg" as="p">
                    {performance.avg_latency_ms}ms
                  </Text>
                </BlockStack>
                <BlockStack gap="200">
                  <Text variant="bodyMd" as="p" tone="subdued">
                    Taux de succès
                  </Text>
                  <Text variant="headingLg" as="p">
                    {formatPercentage(performance.success_rate)}
                  </Text>
                </BlockStack>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Forecasts */}
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">
                Prévisions
              </Text>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="bodyMd" as="p">
                    Consommation quotidienne
                  </Text>
                  <Text variant="headingMd" as="p">
                    {billing.daily_burn_rate.toFixed(1)} crédits/jour
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text variant="bodyMd" as="p">
                    Jours restants
                  </Text>
                  <Text variant="headingMd" as="p">
                    {billing.days_remaining} jours
                  </Text>
                </InlineStack>
                {billing.days_remaining < 7 && (
                  <Banner tone="warning" title="Crédits faibles">
                    Pensez à recharger vos crédits bientôt.
                  </Banner>
                )}
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Top Products */}
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">
                Produits les plus populaires
              </Text>
              {top_products.length > 0 ? (
                <ResourceList
                  resourceName={{ singular: "produit", plural: "produits" }}
                  items={top_products}
                  renderItem={(item) => {
                    const { product_id, tryons } = item;
                    return (
                      <ResourceItem
                        id={product_id}
                        accessibilityLabel={`Produit ${product_id}`}
                        onClick={() => {}}
                      >
                        <InlineStack align="space-between" blockAlign="center">
                          <Text variant="bodyMd" fontWeight="bold" as="h3">
                            Produit #{product_id}
                          </Text>
                          <Badge>{`${formatNumber(tryons)} try-ons`}</Badge>
                        </InlineStack>
                      </ResourceItem>
                    );
                  }}
                />
              ) : (
                <Text variant="bodyMd" as="p" tone="subdued">
                  Aucun produit n'a encore été essayé.
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Detailed Stats */}
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">
                Statistiques détaillées
              </Text>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="bodyMd" as="p">Cette semaine</Text>
                  <Text variant="bodyMd" fontWeight="bold" as="p">
                    {formatNumber(usage.tryons_week)} try-ons
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text variant="bodyMd" as="p">Ce mois</Text>
                  <Text variant="bodyMd" fontWeight="bold" as="p">
                    {formatNumber(usage.tryons_month)} try-ons
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text variant="bodyMd" as="p">Taux d'erreur</Text>
                  <Text variant="bodyMd" fontWeight="bold" as="p">
                    {formatPercentage(performance.error_rate)}
                  </Text>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">
                Configuration Widget
              </Text>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="bodyMd" as="p">Texte du bouton</Text>
                  <Text variant="bodyMd" fontWeight="bold" as="p">
                    {widget.text || "Essayer"}
                  </Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text variant="bodyMd" as="p">Max tentatives par utilisateur</Text>
                  <Text variant="bodyMd" fontWeight="bold" as="p">
                    {settings.max_tries_per_user || "Illimité"}
                  </Text>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

