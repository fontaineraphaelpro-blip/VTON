import { Link, useLocation } from "@remix-run/react";
import { Box, Text, InlineStack } from "@shopify/polaris";

interface AppShellProps {
  children: React.ReactNode;
}

const navigation = [
  { to: "/app", label: "Accueil", icon: "🏠" },
  { to: "/app/dashboard", label: "Dashboard", icon: "📊" },
  { to: "/app/products", label: "Produits", icon: "📦" },
  { to: "/app/widget", label: "Widget", icon: "⚙️" },
  { to: "/app/history", label: "Historique", icon: "📋" },
  { to: "/app/credits", label: "Crédits", icon: "💎" },
];

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="app-sidebar">
        <div className="app-sidebar-header">
          <div className="app-logo">
            <div className="app-logo-icon">⚡</div>
            <Text variant="headingMd" fontWeight="bold" as="span">
              VTON Magic
            </Text>
          </div>
        </div>
        <nav className="app-sidebar-nav">
          {navigation.map((item) => {
            const isActive = currentPath === item.to || 
              (item.to !== "/app" && currentPath.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`app-nav-item ${isActive ? "active" : ""}`}
              >
                <span className="app-nav-icon">{item.icon}</span>
                <Text variant="bodyMd" fontWeight={isActive ? "semibold" : "regular"} as="span">
                  {item.label}
                </Text>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="app-main">
        {/* Header */}
        <header className="app-header">
          <div className="app-header-content">
            <InlineStack align="space-between" blockAlign="center">
              <Box>
                <Text variant="headingLg" fontWeight="semibold" as="h1">
                  VTON Magic Admin
                </Text>
              </Box>
              <div className="app-status">
                <div className="app-status-dot"></div>
                <Text variant="bodySm" fontWeight="medium" as="span">
                  System Active
                </Text>
              </div>
            </InlineStack>
          </div>
        </header>

        {/* Page Content */}
        <div className="app-content">
          {children}
        </div>
      </main>
    </div>
  );
}

