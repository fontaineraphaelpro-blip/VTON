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
