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
        {/* Script inline pour détecter iframe sur les routes top-level uniquement
            Ce script s'exécute IMMÉDIATEMENT avant React pour forcer la sortie d'iframe */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // Vérifier si on est sur une route qui doit être top-level
                var pathname = window.location.pathname;
                var isTopLevelRoute = pathname.startsWith('/auth');
                
                // Si route top-level et dans iframe, forcer sortie avec window.top.location.href
                if (isTopLevelRoute && window.top && window.top !== window.self) {
                  try {
                    // Construire URL sans paramètre embedded
                    var currentUrl = new URL(window.location.href);
                    currentUrl.searchParams.delete('embedded');
                    
                    // Rediriger la fenêtre parente vers l'URL actuelle (top-level)
                    // C'est la méthode standard pour sortir d'une iframe
                    window.top.location.href = currentUrl.toString();
                  } catch (e) {
                    // Si bloqué par sécurité du navigateur (Firefox), essayer alternatives
                    try {
                      var currentUrl = new URL(window.location.href);
                      currentUrl.searchParams.delete('embedded');
                      // Essayer d'ouvrir dans la même fenêtre (_top) ou nouvelle fenêtre
                      window.open(currentUrl.toString(), '_top') || 
                      window.open(currentUrl.toString(), '_blank');
                    } catch (e2) {
                      console.error('Failed to exit iframe. This page must be opened in a new window.', e2);
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
