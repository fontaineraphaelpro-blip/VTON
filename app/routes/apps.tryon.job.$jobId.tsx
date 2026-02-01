import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { query } from "../lib/services/db.service";

/**
 * GET /apps/tryon/job/:jobId
 * 
 * Check the status of an async try-on generation job.
 * Returns the result URL when ready, or status "pending" if still processing.
 */
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  try {
    const jobId = params.jobId;
    if (!jobId) {
      return json({ error: "Missing job ID" }, { status: 400 });
    }

    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    
    if (!shop) {
      return json({ error: "Missing shop parameter" }, { status: 400 });
    }

    // Find the tryon log by ID (we'll use the log ID as job ID)
    const result = await query(
      `SELECT id, success, result_image_url, error_message, created_at 
       FROM tryon_logs 
       WHERE id = $1 AND shop = $2 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [parseInt(jobId), shop]
    );

    if (result.rows.length === 0) {
      return json({ error: "Job not found" }, { status: 404 });
    }

    const log = result.rows[0];

    // If the job is still processing (no result yet and no error), return pending
    if (!log.success && !log.error_message && !log.result_image_url) {
      return json({
        status: "pending",
        jobId: log.id,
      }, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    }

    // Job is complete
    if (log.success && log.result_image_url) {
      return json({
        status: "completed",
        result_url: log.result_image_url,
        jobId: log.id,
      }, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    }

    // Job failed
    return json({
      status: "failed",
      error: log.error_message || "Generation failed",
      jobId: log.id,
    }, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      }
    });
  } catch (error) {
    console.error("[Job Status] Error:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "An error occurred",
        status: "error",
      },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  }
};












