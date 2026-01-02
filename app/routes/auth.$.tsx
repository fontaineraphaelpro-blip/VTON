import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.$.tsx:5',message:'auth.$.tsx loader entry',data:{url:request.url,pathname:new URL(request.url).pathname,hasCode:new URL(request.url).searchParams.has('code')},timestamp:Date.now(),sessionId:'debug-session',runId:'error-500'})}).catch(()=>{});
  // #endregion
  try {
    const result = await authenticate.admin(request);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.$.tsx:10',message:'auth.$.tsx after authenticate.admin success',data:{hasResult:!!result,isResponse:result instanceof Response},timestamp:Date.now(),sessionId:'debug-session',runId:'error-500'})}).catch(()=>{});
    // #endregion

    return null;
  } catch (error: any) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth.$.tsx:15',message:'auth.$.tsx authenticate.admin error',data:{errorMessage:error?.message,errorStack:error?.stack?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'error-500'})}).catch(()=>{});
    // #endregion
    throw error;
  }
};
