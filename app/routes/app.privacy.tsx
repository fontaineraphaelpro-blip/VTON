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

export default function Privacy() {
  return (
    <Page>
      <TitleBar title="Privacy Policy" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h1" variant="headingXl">
                Privacy Policy
              </Text>
              <Text as="p" variant="bodyMd">
                <strong>Last updated:</strong> {new Date().toLocaleDateString()}
              </Text>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  1. Information We Collect
                </Text>
                <Text as="p" variant="bodyMd">
                  When you use our Virtual Try-On application, we collect the following information:
                </Text>
                <ul>
                  <li>
                    <Text as="p" variant="bodyMd">
                      <strong>Shop Information:</strong> Your Shopify shop domain and basic shop settings
                    </Text>
                  </li>
                  <li>
                    <Text as="p" variant="bodyMd">
                      <strong>Product Data:</strong> Product IDs and images that you enable for virtual try-on
                    </Text>
                  </li>
                  <li>
                    <Text as="p" variant="bodyMd">
                      <strong>Usage Statistics:</strong> Aggregated data about try-on usage, conversion rates, and widget interactions
                    </Text>
                  </li>
                  <li>
                    <Text as="p" variant="bodyMd">
                      <strong>Customer Photos:</strong> Photos uploaded by customers for virtual try-on are processed securely and deleted immediately after generation. We do not store customer photos.
                    </Text>
                  </li>
                </ul>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  2. How We Use Your Information
                </Text>
                <Text as="p" variant="bodyMd">
                  We use the information we collect to:
                </Text>
                <ul>
                  <li>
                    <Text as="p" variant="bodyMd">
                      Provide and improve our virtual try-on service
                    </Text>
                  </li>
                  <li>
                    <Text as="p" variant="bodyMd">
                      Process customer photos for virtual try-on generation
                    </Text>
                  </li>
                  <li>
                    <Text as="p" variant="bodyMd">
                      Generate usage statistics and analytics for your shop
                    </Text>
                  </li>
                  <li>
                    <Text as="p" variant="bodyMd">
                      Communicate with you about your account and our services
                    </Text>
                  </li>
                </ul>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  3. Data Storage and Security
                </Text>
                <Text as="p" variant="bodyMd">
                  We take data security seriously:
                </Text>
                <ul>
                  <li>
                    <Text as="p" variant="bodyMd">
                      All data is stored securely using industry-standard encryption
                    </Text>
                  </li>
                  <li>
                    <Text as="p" variant="bodyMd">
                      Customer photos are processed through secure APIs and deleted immediately after generation
                    </Text>
                  </li>
                  <li>
                    <Text as="p" variant="bodyMd">
                      We do not share your data with third parties except as necessary to provide our service
                    </Text>
                  </li>
                </ul>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  4. Your Rights
                </Text>
                <Text as="p" variant="bodyMd">
                  Under GDPR and other privacy laws, you have the right to:
                </Text>
                <ul>
                  <li>
                    <Text as="p" variant="bodyMd">
                      Access your personal data
                    </Text>
                  </li>
                  <li>
                    <Text as="p" variant="bodyMd">
                      Request correction of inaccurate data
                    </Text>
                  </li>
                  <li>
                    <Text as="p" variant="bodyMd">
                      Request deletion of your data
                    </Text>
                  </li>
                  <li>
                    <Text as="p" variant="bodyMd">
                      Object to processing of your data
                    </Text>
                  </li>
                </ul>
                <Text as="p" variant="bodyMd">
                  To exercise these rights, please contact us at{" "}
                  <a href="mailto:fontaineraphaelpro@gmail.com">fontaineraphaelpro@gmail.com</a>
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  5. Data Retention
                </Text>
                <Text as="p" variant="bodyMd">
                  We retain your shop data for as long as your account is active. When you uninstall the app, all your data is permanently deleted within 30 days.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  6. Contact Us
                </Text>
                <Text as="p" variant="bodyMd">
                  If you have questions about this Privacy Policy, please contact us at:
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

