/**
 * Serves theme extension widget JS for ScriptTag installs (same file as app embed).
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { readFile } from "node:fs/promises";
import path from "node:path";

let cachedJs: string | null = null;

export const loader = async (_args: LoaderFunctionArgs) => {
  if (!cachedJs) {
    const filePath = path.join(
      process.cwd(),
      "extensions",
      "vton-widget",
      "assets",
      "vton-widget.js"
    );
    let buf = await readFile(filePath);
    if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      buf = buf.subarray(3);
    }
    cachedJs = buf.toString("utf8");
  }

  return new Response(cachedJs, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=120",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
