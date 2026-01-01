import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer } from "@remix-run/react";
import {
  createReadableStreamFromReadable,
  type EntryContext,
} from "@remix-run/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";
import { initBusinessDatabase } from "./lib/db-init.server";

export const streamTimeout = 5000;

// Initialize business database tables on server startup
let dbInitialized = false;
if (!dbInitialized) {
  initBusinessDatabase().catch((error) => {
    console.error("Failed to initialize business database:", error);
  });
  dbInitialized = true;
}

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext
) {
  addDocumentResponseHeaders(request, responseHeaders);
  
  // Headers pour forcer l'ouverture hors iframe (Firefox)
  responseHeaders.set("X-Frame-Options", "DENY");
  responseHeaders.set("Content-Security-Policy", "frame-ancestors 'none'");
  
  // Si embedded=1, retourner une page HTML simple qui force l'ouverture immédiatement
  const url = new URL(request.url);
  if (url.searchParams.get("embedded") === "1") {
    const shop = url.searchParams.get("shop");
    const newUrl = shop ? `/auth?shop=${shop}` : "/auth";
    
    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting...</title>
  <meta http-equiv="X-Frame-Options" content="DENY">
  <meta http-equiv="Content-Security-Policy" content="frame-ancestors 'none'">
  <script>
    // Script qui s'exécute IMMÉDIATEMENT pour forcer la sortie de l'iframe
    (function() {
      if (window.top && window.top !== window.self) {
        try {
          window.top.location.href = "${newUrl}";
        } catch (e) {
          // Si bloqué, ouvrir dans un nouvel onglet
          window.open("${newUrl}", "_blank");
        }
      } else {
        window.location.href = "${newUrl}";
      }
    })();
  </script>
  <noscript>
    <meta http-equiv="refresh" content="0;url=${newUrl}">
  </noscript>
</head>
<body>
  <p>Redirecting... <a href="${newUrl}">Click here if you are not redirected</a></p>
</body>
</html>`,
      {
        status: 200,
        headers: {
          "Content-Type": "text/html",
          "X-Frame-Options": "DENY",
          "Content-Security-Policy": "frame-ancestors 'none'",
        },
      }
    );
  }
  
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? '')
    ? "onAllReady"
    : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <RemixServer
        context={remixContext}
        url={request.url}
      />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      }
    );

    // Automatically timeout the React renderer after 6 seconds, which ensures
    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}
