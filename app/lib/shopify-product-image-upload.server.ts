import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Uploads an image to a product via staged upload + productCreateMedia.
 * Requires write_products scope.
 */
export async function uploadProductGarmentImage(
  admin: AdminApiContext["admin"],
  productId: string,
  file: File
): Promise<string> {
  if (file.size <= 0) {
    throw new Error("Empty file");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be 8 MB or smaller");
  }

  const mimeType = file.type || "image/jpeg";
  if (!mimeType.startsWith("image/")) {
    throw new Error("File must be an image");
  }

  const filename =
    file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "garment.jpg";

  const stagedResponse = await admin.graphql(
    `#graphql
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        input: [
          {
            filename,
            mimeType,
            httpMethod: "POST",
            resource: "PRODUCT_IMAGE",
            fileSize: String(file.size),
          },
        ],
      },
    }
  );

  const stagedJson = (await stagedResponse.json()) as {
    data?: {
      stagedUploadsCreate?: {
        stagedTargets?: Array<{
          url: string;
          resourceUrl: string;
          parameters: Array<{ name: string; value: string }>;
        }>;
        userErrors?: Array<{ message: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (stagedJson.errors?.length) {
    throw new Error(stagedJson.errors[0].message);
  }

  const staged = stagedJson.data?.stagedUploadsCreate;
  if (staged?.userErrors?.length) {
    throw new Error(staged.userErrors[0].message);
  }

  const target = staged?.stagedTargets?.[0];
  if (!target?.url || !target.resourceUrl) {
    throw new Error("Could not prepare image upload");
  }

  const uploadBody = new FormData();
  for (const param of target.parameters) {
    uploadBody.append(param.name, param.value);
  }
  uploadBody.append("file", file, filename);

  const uploadRes = await fetch(target.url, { method: "POST", body: uploadBody });
  if (!uploadRes.ok) {
    throw new Error(`Upload failed (${uploadRes.status})`);
  }

  const mediaResponse = await admin.graphql(
    `#graphql
    mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media {
          ... on MediaImage {
            id
            image {
              url
            }
          }
        }
        mediaUserErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        productId,
        media: [
          {
            originalSource: target.resourceUrl,
            mediaContentType: "IMAGE",
            alt: "VTON AI garment photo",
          },
        ],
      },
    }
  );

  const mediaJson = (await mediaResponse.json()) as {
    data?: {
      productCreateMedia?: {
        media?: Array<{ image?: { url?: string } }>;
        mediaUserErrors?: Array<{ message: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (mediaJson.errors?.length) {
    throw new Error(mediaJson.errors[0].message);
  }

  const created = mediaJson.data?.productCreateMedia;
  if (created?.mediaUserErrors?.length) {
    throw new Error(created.mediaUserErrors[0].message);
  }

  const url = created?.media?.[0]?.image?.url;
  if (!url) {
    throw new Error("No image URL returned after upload");
  }

  return url;
}
