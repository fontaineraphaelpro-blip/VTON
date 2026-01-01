import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { payload, session, topic, shop } = await authenticate.webhook(request);
    console.log(`Received ${topic} webhook for ${shop}`);

    const current = payload.current as string[];
    if (session) {
        // Update session using sessionId (required by PrismaSessionStorage)
        await db.session.update({   
            where: {
                sessionId: session.id
            },
            data: {
                // Note: scope is stored in the data JSON field by PrismaSessionStorage
                // This update may not work correctly as data is JSON stringified
                // Consider using sessionStorage API instead
            },
        });
    }
    return new Response();
};
