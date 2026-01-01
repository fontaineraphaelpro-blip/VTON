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
        <Meta />
        <Links />
        {/* Script to detect iframe and force exit - required for Firefox OAuth */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // Détecte si on est dans une iframe et force la sortie
                if (window.top !== window.self) {
                  try {
                    // Essayer d'abord de rediriger la fenêtre parente
                    window.top.location.href = window.location.href;
                  } catch (e) {
                    // Si bloqué (Firefox), ouvrir dans une nouvelle fenêtre
                    var newUrl = window.location.href;
                    // Retirer le paramètre embedded si présent
                    newUrl = newUrl.replace(/[?&]embedded=1(&|$)/, function(match, p1) {
                      return p1 === '&' ? '&' : '';
                    });
                    newUrl = newUrl.replace(/[?&]$/, '');
                    // Ouvrir dans une nouvelle fenêtre
                    window.open(newUrl, '_top');
                  }
                }
              })();
            `,
          }}
        />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
