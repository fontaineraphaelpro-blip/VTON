import { Box, InlineStack, Text } from "@shopify/polaris";

export function AppHeader() {
  return (
    <div className="vton-header">
      <div className="vton-logo">
        <div className="vton-logo-icon">⚡</div>
        <div className="vton-logo-text">VTON Magic Admin</div>
      </div>
      <div className="vton-status">
        <div className="vton-status-dot"></div>
        <span>System Active</span>
      </div>
    </div>
  );
}
