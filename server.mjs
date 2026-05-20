/**
 * Production server — serves build/client assets with POSIX paths (Railway/Linux).
 * remix-serve uses assetsBuildDirectory from the manifest, which can be "build\\client"
 * when built on Windows and breaks express.static on Linux → 404 on /assets/*.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import compression from "compression";
import { createRequestHandler } from "@remix-run/express";
import * as build from "./build/server/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientBuildDir = path.join(__dirname, "build", "client");
const port = Number(process.env.PORT) || 3000;

const app = express();
app.disable("x-powered-by");
app.use(compression());

app.use(
  build.publicPath,
  express.static(clientBuildDir, {
    immutable: true,
    maxAge: "1y",
  }),
);

app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h" }));

app.all(
  "*",
  createRequestHandler({
    build,
    mode: process.env.NODE_ENV,
  }),
);

app.listen(port, "0.0.0.0", () => {
  console.log(`[vton] http://0.0.0.0:${port} (client: ${clientBuildDir})`);
});
