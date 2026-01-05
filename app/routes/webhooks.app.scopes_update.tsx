import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session, topic, shop } = await authenticate.webhook(request);
    if (process.env.NODE_ENV !== "production") {
      console.log(`Received ${topic} webhook for ${shop}`);
    }

    // When scopes are updated, we need to invalidate the session
    // so the merchant can re-authenticate with the new scopes
    if (session) {
        await db.session.deleteMany({ where: { shop } });
    }

    return new Response();
};
