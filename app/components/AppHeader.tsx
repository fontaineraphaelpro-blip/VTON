import { Box, InlineStack, Text } from "@shopify/polaris";

export function AppHeader() {
  return (
    <Box paddingBlockEnd="400" borderBlockEndWidth="025" borderColor="border-subdued">
      <InlineStack align="space-between" blockAlign="center">
        <InlineStack gap="300" align="start">
          <div className="vton-logo-icon">⚡</div>
          <Text variant="headingLg" fontWeight="bold" as="h1">
            VTON Magic Admin
          </Text>
        </InlineStack>
        <div className="vton-status">
          <div className="vton-status-dot"></div>
          <Text variant="bodySm" fontWeight="medium" as="span">
            System Active
          </Text>
        </div>
      </InlineStack>
    </Box>
  );
}

