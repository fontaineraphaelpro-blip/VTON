import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";
import { useEffect } from "react";

// Composant client pour détecter et sortir de l'iframe
function IframeExit() {
  useEffect(() => {
    // Si on est dans un iframe, on sort de l'iframe
    if (window.top && window.top !== window.self) {
      // On sort de l'iframe en redirigeant la fenêtre parente
      window.top.location.href = window.location.href;
    }
  }, []);

  return null;
}

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
        {/* Script inline qui s'exécute IMMÉDIATEMENT avant React pour forcer la sortie de l'iframe */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // Détecte si on est dans une iframe et force la sortie IMMÉDIATEMENT
                if (window.top && window.top !== window.self) {
                  try {
                    // Essayer de rediriger la fenêtre parente
                    var currentUrl = window.location.href;
                    // Retirer le paramètre embedded si présent
                    currentUrl = currentUrl.replace(/[?&]embedded=1(&|$)/, function(match, p1) {
                      return p1 === '&' ? '&' : '';
                    });
                    currentUrl = currentUrl.replace(/[?&]$/, '');
                    // Forcer la redirection de la fenêtre parente
                    window.top.location.href = currentUrl;
                  } catch (e) {
                    // Si bloqué (Firefox), essayer d'ouvrir dans un nouvel onglet
                    try {
                      var currentUrl = window.location.href;
                      currentUrl = currentUrl.replace(/[?&]embedded=1(&|$)/, function(match, p1) {
                        return p1 === '&' ? '&' : '';
                      });
                      currentUrl = currentUrl.replace(/[?&]$/, '');
                      window.open(currentUrl, '_blank');
                    } catch (e2) {
                      // Dernier recours : afficher un message
                      document.write('<html><body><h1>Please open this page in a new window</h1><p>Firefox blocks this page in an iframe for security reasons.</p><p><a href="' + window.location.href + '">Click here to open in a new window</a></p></body></html>');
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
        <IframeExit />
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
