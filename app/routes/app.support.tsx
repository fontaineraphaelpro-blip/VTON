import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Page, Layout, Card, BlockStack, Text, Button } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export default function Support() {
  return (
    <Page>
      <TitleBar title="Support" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h1" variant="headingXl">
                Support & Contact
              </Text>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  Get Help
                </Text>
                <Text as="p" variant="bodyMd">
                  We're here to help! If you have any questions, issues, or feedback about the Virtual Try-On app, please don't hesitate to reach out.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  Contact Us
                </Text>
                <Text as="p" variant="bodyMd">
                  <strong>Email:</strong>{" "}
                  <a href="mailto:fontaineraphaelpro@gmail.com">fontaineraphaelpro@gmail.com</a>
                </Text>
                <Text as="p" variant="bodyMd">
                  We typically respond within 24-48 hours during business days.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  Common Questions
                </Text>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    How do I set up the widget?
                  </Text>
                  <Text as="p" variant="bodyMd">
                    The widget is automatically installed when you enable the app. Go to the Widget settings page to customize the button text and colors.
                  </Text>

                  <Text as="h3" variant="headingMd">
                    How do I enable try-on for specific products?
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Go to the Products page and toggle try-on on/off for each product individually.
                  </Text>

                  <Text as="h3" variant="headingMd">
                    What happens when I reach my monthly quota?
                  </Text>
                  <Text as="p" variant="bodyMd">
                    When you reach your monthly quota, the widget will be temporarily disabled until your quota resets at the beginning of the next billing cycle.
                  </Text>

                  <Text as="h3" variant="headingMd">
                    Can I upgrade or downgrade my plan?
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Yes! Go to the Credits page to view available plans and upgrade or downgrade at any time.
                  </Text>
                </BlockStack>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  Report an Issue
                </Text>
                <Text as="p" variant="bodyMd">
                  If you encounter a bug or technical issue, please email us at{" "}
                  <a href="mailto:fontaineraphaelpro@gmail.com">fontaineraphaelpro@gmail.com</a> with:
                </Text>
                <ul>
                  <li>
                    <Text as="p" variant="bodyMd">
                      A description of the issue
                    </Text>
                  </li>
                  <li>
                    <Text as="p" variant="bodyMd">
                      Steps to reproduce the problem
                    </Text>
                  </li>
                  <Text as="p" variant="bodyMd">
                    Screenshots or error messages (if applicable)
                  </Text>
                </ul>
              </BlockStack>

              <BlockStack gap="300">
                <Text as="h2" variant="headingLg">
                  Legal
                </Text>
                <Text as="p" variant="bodyMd">
                  <a href="/app/privacy">Privacy Policy</a> |{" "}
                  <a href="/app/terms">Terms of Service</a>
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

