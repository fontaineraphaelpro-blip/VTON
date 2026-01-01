import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";

export default function App() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        {/* Script inline pour détecter iframe sur les routes top-level uniquement */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // Vérifier si on est sur une route qui doit être top-level
                var pathname = window.location.pathname;
                var isTopLevelRoute = pathname.startsWith('/auth');
                
                // Si route top-level et dans iframe, forcer sortie
                if (isTopLevelRoute && window.top && window.top !== window.self) {
                  try {
                    var currentUrl = new URL(window.location.href);
                    currentUrl.searchParams.delete('embedded');
                    window.top.location.href = currentUrl.toString();
                  } catch (e) {
                    // Si bloqué, essayer d'ouvrir dans nouvel onglet
                    try {
                      var currentUrl = new URL(window.location.href);
                      currentUrl.searchParams.delete('embedded');
                      window.open(currentUrl.toString(), '_blank');
                    } catch (e2) {
                      console.error('Failed to exit iframe:', e2);
                    }
                  }
                }
              })();
            `,
          }}
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
