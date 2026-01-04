import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, Text } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export default function Terms() {
  return (
    <Page>
      <TitleBar title="Terms of Service" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h1" variant="headingXl">
                Terms of Service
              </Text>
              <Text as="p" variant="bodyMd">
                <strong>Last updated:</strong> {new Date().toLocaleDateString()}
              </Text>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  1. Acceptance of Terms
                </Text>
                <Text as="p" variant="bodyMd">
                  By installing and using the Virtual Try-On application ("the App"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the App.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  2. Description of Service
                </Text>
                <Text as="p" variant="bodyMd">
                  The App provides virtual try-on functionality for your Shopify store, allowing customers to visualize products on themselves using AI-powered image generation.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  3. Subscription and Billing
                </Text>
                <Text as="p" variant="bodyMd">
                  The App operates on a subscription basis with different pricing tiers:
                </Text>
                <ul>
                  <li>
                    <Text as="p" variant="bodyMd">
                      <strong>Free Plan:</strong> 4 try-ons per month with watermark
                    </Text>
                  </li>
                  <li>
                    <Text as="p" variant="bodyMd">
                      <strong>Paid Plans:</strong> Various monthly quotas available
                    </Text>
                  </li>
                </ul>
                <Text as="p" variant="bodyMd">
                  Subscriptions are billed monthly through Shopify's billing system. You can cancel your subscription at any time through your Shopify admin.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  4. Usage Limits
                </Text>
                <Text as="p" variant="bodyMd">
                  Each subscription plan has a monthly quota of try-ons. Once the quota is reached, the service will be unavailable until the next billing cycle. Quotas reset automatically each month.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  5. User Responsibilities
                </Text>
                <Text as="p" variant="bodyMd">
                  You agree to:
                </Text>
                <ul>
                  <li>
                    <Text as="p" variant="bodyMd">
                      Use the App only for lawful purposes
                    </Text>
                  </li>
                  <li>
                    <Text as="p" variant="bodyMd">
                      Not upload inappropriate or offensive content
                    </Text>
                  </li>
                  <li>
                    <Text as="p" variant="bodyMd">
                      Comply with all applicable laws and regulations
                    </Text>
                  </li>
                  <li>
                    <Text as="p" variant="bodyMd">
                      Maintain the security of your account
                    </Text>
                  </li>
                </ul>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  6. Intellectual Property
                </Text>
                <Text as="p" variant="bodyMd">
                  The App and all its content, features, and functionality are owned by us and are protected by international copyright, trademark, and other intellectual property laws.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  7. Limitation of Liability
                </Text>
                <Text as="p" variant="bodyMd">
                  To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  8. Service Availability
                </Text>
                <Text as="p" variant="bodyMd">
                  We strive to maintain high availability of the App, but we do not guarantee uninterrupted access. The App may be temporarily unavailable due to maintenance, updates, or unforeseen circumstances.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  9. Termination
                </Text>
                <Text as="p" variant="bodyMd">
                  You may terminate your use of the App at any time by uninstalling it from your Shopify store. We reserve the right to suspend or terminate your access to the App if you violate these Terms of Service.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  10. Changes to Terms
                </Text>
                <Text as="p" variant="bodyMd">
                  We reserve the right to modify these Terms of Service at any time. We will notify you of any material changes by posting the updated terms in the App. Your continued use of the App after such changes constitutes acceptance of the new terms.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  11. Contact Information
                </Text>
                <Text as="p" variant="bodyMd">
                  If you have questions about these Terms of Service, please contact us at:
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>Email:</strong>{" "}
                  <a href="mailto:fontaineraphaelpro@gmail.com">fontaineraphaelpro@gmail.com</a>
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

