/**
 * Replicate API — virtual try-on via bytedance/seedream-4.5
 */

import Replicate from "replicate";
import { logger } from "../logger.server";

const MODEL_ID = process.env.REPLICATE_MODEL || "bytedance/seedream-4.5";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 90;

const GARMENT_TRANSFER_PROMPT =
  "Virtual try-on: dress the person in the exact garment from the reference image. Preserve garment colors, pattern and fit. Photorealistic, natural pose, same person identity.";

if (!process.env.REPLICATE_API_TOKEN) {
  logger.warn("REPLICATE_API_TOKEN is not set. Try-on generation will fail.");
}

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN || "",
});

type FileCreateResponse = {
  urls?: { get?: string };
  url?: string;
  id?: string;
};

function extractFileUrl(file: unknown): string | null {
  if (typeof file === "string") return file;
  if (!file || typeof file !== "object") return null;
  const f = file as FileCreateResponse;
  if (f.urls?.get) return f.urls.get;
  if (f.url) return f.url;
  return null;
}

async function uploadBufferToReplicate(buffer: Buffer, label: string): Promise<string> {
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(
      `${label} is too large (${Math.round(buffer.length / 1024 / 1024)}MB). Use a photo under 8MB.`
    );
  }
  const file = await replicate.files.create(buffer);
  const url = extractFileUrl(file);
  if (!url) {
    throw new Error(
      `Replicate files.create() did not return a URL for ${label}: ${JSON.stringify(file)}`
    );
  }
  return url;
}

async function dataUrlToBuffer(dataUrl: string): Promise<Buffer> {
  const match = /^data:image\/[^;]+;base64,(.+)$/i.exec(dataUrl);
  if (!match?.[1]) {
    throw new Error("Invalid data URL — expected base64 image data");
  }
  return Buffer.from(match[1], "base64");
}

/** Shopify CDN: force HTTPS and a reasonable width for Replicate. */
export function normalizeGarmentImageUrl(url: string): string {
  let normalized = url.trim();
  if (normalized.startsWith("//")) {
    normalized = `https:${normalized}`;
  }
  if (normalized.startsWith("http://")) {
    normalized = `https://${normalized.slice(7)}`;
  }
  try {
    const parsed = new URL(normalized);
    if (parsed.hostname.includes("cdn.shopify.com") || parsed.hostname.includes("shopify")) {
      if (!parsed.searchParams.has("width")) {
        parsed.searchParams.set("width", "1024");
      }
      normalized = parsed.toString();
    }
  } catch {
    // keep original if not a valid URL
  }
  return normalized;
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "image/*", "User-Agent": "VTON-Shopify/1.0" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching image`);
    }
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length === 0) throw new Error("empty image response");
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Replicate handles some URLs poorly — upload HTTP(S) and data URLs to Replicate Files.
 */
async function ensureReplicateImageInput(
  source: string,
  label: string
): Promise<string> {
  if (source.startsWith("data:image/")) {
    return uploadBufferToReplicate(await dataUrlToBuffer(source), label);
  }

  if (source.startsWith("http://") || source.startsWith("https://")) {
    const normalized = label === "garment" ? normalizeGarmentImageUrl(source) : source;
    try {
      const buffer = await fetchImageBuffer(normalized);
      return uploadBufferToReplicate(buffer, label);
    } catch (fetchError) {
      logger.warn(
        `[Replicate] ${label} fetch/upload failed, using direct URL:`,
        fetchError instanceof Error ? fetchError.message : fetchError
      );
      return normalized;
    }
  }

  throw new Error(`Invalid ${label} image: expected data URL or http(s) URL`);
}

function parsePredictionOutput(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length > 0) {
    const first = output[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "url" in first && typeof first.url === "string") {
      return first.url;
    }
  }
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (typeof o.url === "string") return o.url;
    if (typeof o.output_url === "string") return o.output_url;
    if (typeof o.image === "string") return o.image;
    const nested = o.output;
    if (typeof nested === "string") return nested;
    if (Array.isArray(nested) && nested.length > 0) {
      const first = nested[0];
      if (typeof first === "string") return first;
      if (first && typeof first === "object" && "url" in first && typeof (first as { url: string }).url === "string") {
        return (first as { url: string }).url;
      }
    }
  }
  return null;
}

function isRetryableReplicateError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("e9243") ||
    lower.includes("director") ||
    lower.includes("unexpected error") ||
    lower.includes("interrupted") ||
    lower.includes("timeout")
  );
}

async function runPrediction(personInput: string, garmentInput: string) {
  const input = {
    size: "2K" as const,
    prompt: GARMENT_TRANSFER_PROMPT,
    max_images: 1,
    image_input: [personInput, garmentInput],
    aspect_ratio: "1:1",
    sequential_image_generation: "disabled" as const,
  };

  logger.log("[Replicate] Creating prediction", MODEL_ID, {
    person: personInput.slice(0, 80),
    garment: garmentInput.slice(0, 80),
  });

  const prediction = await replicate.predictions.create({
    model: MODEL_ID,
    input,
  });

  let status = prediction.status;
  let output = prediction.output;
  let lastError = prediction.error;

  for (let poll = 0; poll < MAX_POLLS && (status === "starting" || status === "processing"); poll++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const updated = await replicate.predictions.get(prediction.id);
    status = updated.status;
    output = updated.output;
    lastError = updated.error;
    if (status === "succeeded" && output) break;
    if (status === "failed" || status === "canceled") {
      throw new Error(String(lastError || `Prediction ${status}`));
    }
  }

  if (status !== "succeeded" || !output) {
    throw new Error(
      lastError
        ? String(lastError)
        : `Prediction did not complete (status: ${status})`
    );
  }

  return output;
}

export async function generateTryOn(
  personImageUrl: string,
  garmentImageUrl: string
): Promise<{ resultUrl: string; config?: Record<string, string> }> {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("REPLICATE_API_TOKEN is not configured.");
  }

  const personInput = await ensureReplicateImageInput(personImageUrl, "person");
  const garmentInput = await ensureReplicateImageInput(
    normalizeGarmentImageUrl(garmentImageUrl),
    "garment"
  );

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const output = await runPrediction(personInput, garmentInput);
      let resultUrl = parsePredictionOutput(output);
      if (!resultUrl) {
        throw new Error(`Unexpected Replicate output: ${JSON.stringify(output).slice(0, 500)}`);
      }
      if (
        !resultUrl.startsWith("http://") &&
        !resultUrl.startsWith("https://") &&
        !resultUrl.startsWith("data:")
      ) {
        if (resultUrl.startsWith("/")) {
          resultUrl = `https://replicate.delivery${resultUrl}`;
        } else {
          throw new Error(`Invalid result URL: ${resultUrl}`);
        }
      }
      logger.log("[Replicate] Success:", resultUrl.slice(0, 120));
      return {
        resultUrl,
        config: { model: MODEL_ID, size: "2K" },
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const msg = lastError.message;
      if (attempt < 3 && isRetryableReplicateError(msg)) {
        logger.warn("[Replicate] Retry after error:", msg);
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      break;
    }
  }

  throw new Error(`Replicate generation failed: ${lastError?.message || "Unknown error"}`);
}

export async function resizeImageForReplicate(imageUrl: string): Promise<string> {
  return imageUrl;
}
