import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FILE_READY_POLL_MS = 250;
const FILE_READY_MAX_ATTEMPTS = 12;

type GraphqlAdmin = AdminApiContext["admin"];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseGraphqlErrors(json: { errors?: Array<{ message: string }> }) {
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }
}

/**
 * Uploads a garment image to Shopify Files (not product media).
 * Requires write_files scope — invisible on the storefront product gallery.
 */
export async function uploadGarmentImageToShopifyFiles(
  admin: GraphqlAdmin,
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
    file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "vton-garment.jpg";

  const stagedResponse = await admin.graphql(
    `#graphql
    mutation VtonGarmentStagedUpload($input: [StagedUploadInput!]!) {
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
            resource: "FILE",
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

  parseGraphqlErrors(stagedJson);

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

  const fileCreateResponse = await admin.graphql(
    `#graphql
    mutation VtonGarmentFileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          fileStatus
          ... on MediaImage {
            image {
              url
            }
          }
        }
        userErrors {
          field
          message
          code
        }
      }
    }`,
    {
      variables: {
        files: [
          {
            originalSource: target.resourceUrl,
            contentType: "IMAGE",
            alt: "VTON AI garment (not shown on storefront)",
            filename: `vton-${filename}`,
          },
        ],
      },
    }
  );

  const fileCreateJson = (await fileCreateResponse.json()) as {
    data?: {
      fileCreate?: {
        files?: Array<{
          id: string;
          fileStatus: string;
          image?: { url?: string };
        }>;
        userErrors?: Array<{ message: string; code?: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  parseGraphqlErrors(fileCreateJson);

  const created = fileCreateJson.data?.fileCreate;
  if (created?.userErrors?.length) {
    const err = created.userErrors[0];
    const msg = err.message || "Could not save file";
    if (/access|scope|permission/i.test(msg)) {
      throw new Error(
        `${msg} The app needs the write_files scope — reinstall or approve updated permissions.`
      );
    }
    throw new Error(msg);
  }

  const fileRecord = created?.files?.[0];
  if (!fileRecord?.id) {
    throw new Error("No file returned after upload");
  }

  if (fileRecord.fileStatus === "READY" && fileRecord.image?.url) {
    return fileRecord.image.url;
  }

  return waitForGarmentFileUrl(admin, fileRecord.id);
}

async function waitForGarmentFileUrl(
  admin: GraphqlAdmin,
  fileId: string
): Promise<string> {
  for (let attempt = 0; attempt < FILE_READY_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(FILE_READY_POLL_MS);
    }

    const response = await admin.graphql(
      `#graphql
      query VtonGarmentFileStatus($id: ID!) {
        node(id: $id) {
          ... on MediaImage {
            fileStatus
            image {
              url
            }
          }
        }
      }`,
      { variables: { id: fileId } }
    );

    const json = (await response.json()) as {
      data?: {
        node?: {
          fileStatus?: string;
          image?: { url?: string };
        };
      };
      errors?: Array<{ message: string }>;
    };

    parseGraphqlErrors(json);

    const node = json.data?.node;
    const status = node?.fileStatus;
    const url = node?.image?.url;

    if (status === "FAILED") {
      throw new Error("Shopify could not process the garment image");
    }
    if (status === "READY" && url) {
      return url;
    }
  }

  throw new Error(
    "Image uploaded but is still processing. Try again in a few seconds."
  );
}
