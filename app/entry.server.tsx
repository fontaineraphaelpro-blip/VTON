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
  // #region agent log
  const url = new URL(request.url);
  const pathname = url.pathname;
  const embedded = url.searchParams.get("embedded");
  fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'entry.server.tsx:handleRequest:entry',message:'Request received',data:{pathname,embedded,headersBefore:Object.fromEntries(responseHeaders.entries())},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  // Routes qui doivent être top-level (OAuth, Admin auth)
  // Inclure /auth/login et toutes les routes /auth/*
  const isTopLevelRoute = pathname.startsWith("/auth");
  // Routes qui peuvent être embedded (UI de l'app)
  const isEmbeddedRoute = pathname.startsWith("/app");
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'entry.server.tsx:handleRequest:routeCheck',message:'Route classification',data:{isTopLevelRoute,isEmbeddedRoute},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  // Si embedded=1 sur une route top-level, retourner IMMÉDIATEMENT page HTML de redirection
  // AVANT d'appliquer les headers CSP pour éviter l'erreur
  if (isTopLevelRoute && url.searchParams.get("embedded") === "1") {
    // Construire l'URL sans le paramètre embedded, en préservant tous les autres paramètres
    const redirectUrl = new URL(url);
    redirectUrl.searchParams.delete("embedded");
    const newUrl = redirectUrl.pathname + redirectUrl.search;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'entry.server.tsx:handleRequest:topLevelRedirect',message:'Returning redirect HTML',data:{newUrl,originalPathname:pathname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting...</title>
  <script>
    (function() {
      if (window.top && window.top !== window.self) {
        try {
          window.top.location.href = "${newUrl}";
        } catch (e) {
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
          // Pas de headers CSP ici - on redirige de toute façon
        },
      }
    );
  }
  
  // Pour les routes embedded, SUPPRIMER les headers anti-iframe AVANT d'ajouter les headers Shopify
  // et APRÈS aussi, car addDocumentResponseHeaders pourrait les réajouter
  if (isEmbeddedRoute) {
    // Supprimer d'abord au cas où ils seraient déjà présents
    responseHeaders.delete("X-Frame-Options");
    responseHeaders.delete("Content-Security-Policy");
  }
  
  // Ajouter les headers Shopify
  addDocumentResponseHeaders(request, responseHeaders);
  
  // #region agent log
  const headersAfterShopify = Object.fromEntries(responseHeaders.entries());
  fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'entry.server.tsx:handleRequest:afterShopifyHeaders',message:'Headers after addDocumentResponseHeaders',data:{headersAfterShopify,isEmbeddedRoute},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  
  // Pour les routes embedded, SUPPRIMER les headers anti-iframe APRÈS addDocumentResponseHeaders
  // car addDocumentResponseHeaders pourrait les avoir réajoutés
  if (isEmbeddedRoute) {
    // Supprimer les headers qui bloquent l'iframe pour permettre l'embedding
    const hadXFrame = responseHeaders.has("X-Frame-Options");
    const hadCSP = responseHeaders.has("Content-Security-Policy");
    responseHeaders.delete("X-Frame-Options");
    responseHeaders.delete("Content-Security-Policy");
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'entry.server.tsx:handleRequest:deleteEmbeddedHeaders',message:'Deleted headers for embedded route',data:{hadXFrame,hadCSP,headersAfterDelete:Object.fromEntries(responseHeaders.entries())},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
  }
  
  // Headers pour forcer l'ouverture hors iframe sur les routes top-level (si pas embedded=1)
  if (isTopLevelRoute) {
    responseHeaders.set("X-Frame-Options", "DENY");
    responseHeaders.set("Content-Security-Policy", "frame-ancestors 'none'");
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'entry.server.tsx:handleRequest:setTopLevelHeaders',message:'Set headers for top-level route',data:{headersAfterSet:Object.fromEntries(responseHeaders.entries())},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
  }
  
  // #region agent log
  const finalHeaders = Object.fromEntries(responseHeaders.entries());
  fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'entry.server.tsx:handleRequest:finalHeaders',message:'Final headers before render',data:{finalHeaders,isEmbeddedRoute,isTopLevelRoute},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
  // #endregion
  
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

          // DERNIÈRE vérification : supprimer les headers CSP pour les routes embedded
          // juste avant de renvoyer la réponse (au cas où ils auraient été réajoutés)
          if (isEmbeddedRoute) {
            responseHeaders.delete("X-Frame-Options");
            responseHeaders.delete("Content-Security-Policy");
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'entry.server.tsx:handleRequest:finalDelete',message:'Final deletion of CSP headers before response',data:{finalHeaders:Object.fromEntries(responseHeaders.entries())},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'})}).catch(()=>{});
            // #endregion
          }

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
