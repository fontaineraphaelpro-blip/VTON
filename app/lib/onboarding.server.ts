import { query } from "./services/db.service";
import type { hasStorefrontWidgetScriptTag } from "./storefront-widget-install.server";

type AdminGraphql = Parameters<typeof hasStorefrontWidgetScriptTag>[0];

export type OnboardingStepId = "embed" | "tryon" | "garment";

export type OnboardingStepOverrides = Partial<
  Record<OnboardingStepId, boolean>
>;

export type OnboardingStepState = {
  id: OnboardingStepId;
  done: boolean;
  auto: boolean;
};

export type OnboardingState = {
  steps: OnboardingStepState[];
  completedCount: number;
  totalSteps: number;
  allDone: boolean;
  dismissed: boolean;
  firstProductStorefrontUrl: string | null;
};

function parseOverrides(raw: unknown): OnboardingStepOverrides {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: OnboardingStepOverrides = {};
  if (o.embed === true) out.embed = true;
  if (o.tryon === true) out.tryon = true;
  if (o.garment === true) out.garment = true;
  return out;
}

export async function countGarmentPhotosForShop(shop: string): Promise<number> {
  const result = await query(
    `SELECT COUNT(DISTINCT product_id)::int AS c
     FROM product_settings
     WHERE shop = $1
       AND tryon_image_url IS NOT NULL
       AND tryon_image_url <> ''`,
    [shop]
  );
  return Number(result.rows[0]?.c ?? 0);
}

export async function getFirstActiveProductStorefrontUrl(
  admin: AdminGraphql,
  shop: string
): Promise<string | null> {
  try {
    const response = await admin.graphql(`#graphql
      query VtonFirstProduct {
        products(first: 1, query: "status:active") {
          edges {
            node {
              handle
              onlineStoreUrl
            }
          }
        }
      }
    `);
    if (!response.ok) return null;
    const json = (await response.json()) as {
      data?: {
        products?: {
          edges?: Array<{
            node?: { handle?: string; onlineStoreUrl?: string };
          }>;
        };
      };
    };
    const node = json.data?.products?.edges?.[0]?.node;
    if (node?.onlineStoreUrl) return node.onlineStoreUrl;
    if (node?.handle) {
      const domain = shop.includes(".myshopify.com")
        ? shop
        : `${shop}.myshopify.com`;
      return `https://${domain}/products/${node.handle}`;
    }
    return null;
  } catch {
    return null;
  }
}

export async function buildOnboardingState(
  shop: string,
  admin: AdminGraphql,
  opts: {
    shopRow: Record<string, unknown> | null;
    totalTryons: number;
    scriptTagInstalled: boolean;
  }
): Promise<OnboardingState> {
  const overrides = parseOverrides(opts.shopRow?.onboarding_step_overrides);
  const dismissed = Boolean(opts.shopRow?.onboarding_dismissed_at);

  const garmentCount = await countGarmentPhotosForShop(shop);

  const embedAuto = opts.scriptTagInstalled;
  const tryonAuto = opts.totalTryons > 0;
  const garmentAuto = garmentCount > 0;

  const steps: OnboardingStepState[] = [
    {
      id: "embed",
      done: embedAuto || overrides.embed === true,
      auto: embedAuto,
    },
    {
      id: "tryon",
      done: tryonAuto || overrides.tryon === true,
      auto: tryonAuto,
    },
    {
      id: "garment",
      done: garmentAuto || overrides.garment === true,
      auto: garmentAuto,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  let firstProductStorefrontUrl: string | null = null;
  if (!allDone && !dismissed) {
    firstProductStorefrontUrl = await getFirstActiveProductStorefrontUrl(
      admin,
      shop
    );
  }

  return {
    steps,
    completedCount,
    totalSteps: steps.length,
    allDone,
    dismissed,
    firstProductStorefrontUrl,
  };
}

export async function mergeOnboardingOverride(
  shop: string,
  step: OnboardingStepId,
  done: boolean
): Promise<OnboardingStepOverrides> {
  const row = await query(
    "SELECT onboarding_step_overrides FROM shops WHERE domain = $1",
    [shop]
  );
  const current = parseOverrides(row.rows[0]?.onboarding_step_overrides);
  if (done) {
    current[step] = true;
  } else {
    delete current[step];
  }
  await query(
    `UPDATE shops SET onboarding_step_overrides = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE domain = $2`,
    [JSON.stringify(current), shop]
  );
  return current;
}
