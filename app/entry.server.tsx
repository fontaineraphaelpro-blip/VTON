import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer } from "@remix-run/react";
import {
  createReadableStreamFromReadable,
  type EntryContext,
} from "@remix-run/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";

export const streamTimeout = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext
) {
  addDocumentResponseHeaders(request, responseHeaders);
  
  // Remove X-Frame-Options header if it exists (DENY or SAMEORIGIN)
  responseHeaders.delete("X-Frame-Options");
  
  // Add/merge Content-Security-Policy with frame-ancestors
  const existingCSP = responseHeaders.get("Content-Security-Policy");
  const frameAncestors = "frame-ancestors https://admin.shopify.com https://*.myshopify.com";
  
  if (existingCSP) {
    // Merge with existing CSP: remove any existing frame-ancestors and add ours
    const cspDirectives = existingCSP.split(";").map(d => d.trim()).filter(Boolean);
    const filteredCSP = cspDirectives.filter(d => !d.toLowerCase().startsWith("frame-ancestors"));
    const mergedCSP = [...filteredCSP, frameAncestors].join("; ");
    responseHeaders.set("Content-Security-Policy", mergedCSP);
  } else {
    // Set new CSP with only frame-ancestors
    responseHeaders.set("Content-Security-Policy", frameAncestors);
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
