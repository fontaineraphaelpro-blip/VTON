// #region agent log
fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'db.server.ts:1',message:'About to import PrismaClient',data:{nodeEnv:process.env.NODE_ENV,hasPrismaGlobal:typeof global !== 'undefined' && !!global.prismaGlobal},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
// #endregion
import { PrismaClient } from "@prisma/client";

// #region agent log
fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'db.server.ts:3',message:'PrismaClient imported successfully',data:{prismaClientExists:typeof PrismaClient !== 'undefined'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
// #endregion

declare global {
  var prismaGlobal: PrismaClient;
}

// #region agent log
fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'db.server.ts:10',message:'Checking NODE_ENV and global state',data:{nodeEnv:process.env.NODE_ENV,isProduction:process.env.NODE_ENV === 'production',hasGlobalPrisma:typeof global !== 'undefined' && !!global.prismaGlobal},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
// #endregion
if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'db.server.ts:13',message:'Creating new PrismaClient instance (non-production)',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    global.prismaGlobal = new PrismaClient();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'db.server.ts:14',message:'PrismaClient instance created successfully (non-production)',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
  }
}

// #region agent log
fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'db.server.ts:17',message:'About to create/fetch prisma instance',data:{hasGlobalPrisma:typeof global !== 'undefined' && !!global.prismaGlobal,nodeEnv:process.env.NODE_ENV},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
// #endregion
const prisma = global.prismaGlobal ?? new PrismaClient();
// #region agent log
fetch('http://127.0.0.1:7242/ingest/41d5cf97-a31f-488b-8be2-cf5712a8257f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'db.server.ts:18',message:'Prisma instance created/retrieved',data:{usedGlobal:!!global.prismaGlobal,prismaExists:!!prisma},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
// #endregion

export default prisma;
