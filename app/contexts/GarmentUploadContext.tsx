import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useFetcher, useLocation, useRevalidator } from "@remix-run/react";
import { compressGarmentImageForUpload } from "../lib/compress-garment-image.client";

type PendingUpload = {
  productId: string;
  productHandle?: string;
  productTitle?: string;
};

type UploadActionData = {
  success?: boolean;
  error?: string;
  productId?: string;
  imageUrl?: string | null;
};

type GarmentUploadContextValue = {
  uploadGarment: (
    productId: string,
    productHandle: string | undefined,
    file: File,
    productTitle?: string,
  ) => Promise<void>;
  isProductUploading: (productId: string) => boolean;
  isUploading: boolean;
  pendingUpload: PendingUpload | null;
};

const GarmentUploadContext = createContext<GarmentUploadContextValue | null>(
  null,
);

export function GarmentUploadProvider({ children }: { children: ReactNode }) {
  const uploadFetcher = useFetcher<UploadActionData>();
  const location = useLocation();
  const revalidator = useRevalidator();
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [toast, setToast] = useState<{
    tone: "success" | "critical";
    title: string;
    message: string;
  } | null>(null);

  const isUploading = uploadFetcher.state !== "idle";

  const uploadGarment = useCallback(
    async (
      productId: string,
      productHandle: string | undefined,
      file: File,
      productTitle?: string,
    ) => {
      setToast(null);
      setPending({
        productId,
        productHandle,
        productTitle: productTitle?.trim() || undefined,
      });

      const compressed = await compressGarmentImageForUpload(file);
      const formData = new FormData();
      formData.append("intent", "upload-tryon-image");
      formData.append("productId", productId);
      if (productHandle) formData.append("productHandle", productHandle);
      formData.append("file", compressed);

      uploadFetcher.submit(formData, {
        method: "post",
        action: "/app/products",
        encType: "multipart/form-data",
      });
    },
    [uploadFetcher],
  );

  const isProductUploading = useCallback(
    (productId: string) =>
      isUploading && pending?.productId === productId,
    [isUploading, pending?.productId],
  );

  useEffect(() => {
    if (uploadFetcher.state !== "idle" || !uploadFetcher.data) return;

    const data = uploadFetcher.data;
    setPending(null);

    if (data.success && data.productId) {
      setToast({
        tone: "success",
        title: "Garment photo saved",
        message:
          "AI try-on will use this image. You can keep working in other pages.",
      });
      if (location.pathname.startsWith("/app/products")) {
        revalidator.revalidate();
      }
      return;
    }

    setToast({
      tone: "critical",
      title: "Upload failed",
      message: data.error || "Could not upload garment photo",
    });
  }, [
    uploadFetcher.state,
    uploadFetcher.data,
    isUploading,
    location.pathname,
    revalidator,
  ]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  const value = useMemo(
    () => ({
      uploadGarment,
      isProductUploading,
      isUploading,
      pendingUpload: pending,
    }),
    [uploadGarment, isProductUploading, isUploading, pending],
  );

  return (
    <GarmentUploadContext.Provider value={value}>
      {isUploading && pending ? (
        <div
          className="vton-upload-global-bar"
          role="status"
          aria-live="polite"
        >
          <span className="vton-upload-global-bar__spinner" aria-hidden="true" />
          <span>
            Uploading garment photo
            {pending.productTitle ? ` for ${pending.productTitle}` : ""}… You can
            switch pages — we&apos;ll notify you when it&apos;s done.
          </span>
        </div>
      ) : null}
      {toast ? (
        <div
          className={
            "vton-upload-global-toast vton-upload-global-toast--" + toast.tone
          }
          role="alert"
        >
          <strong>{toast.title}</strong>
          <span>{toast.message}</span>
          <button
            type="button"
            className="vton-upload-global-toast__dismiss"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ) : null}
      {children}
    </GarmentUploadContext.Provider>
  );
}

export function useGarmentUpload() {
  const ctx = useContext(GarmentUploadContext);
  if (!ctx) {
    throw new Error("useGarmentUpload must be used within GarmentUploadProvider");
  }
  return ctx;
}
