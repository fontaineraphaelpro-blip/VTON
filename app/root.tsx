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
                  // Si on est dans une iframe, rediriger vers la même URL dans la fenêtre principale
                  window.top.location.href = window.location.href;
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
