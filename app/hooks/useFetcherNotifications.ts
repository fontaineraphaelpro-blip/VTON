import { useEffect, useRef } from "react";
import type { FetcherWithComponents } from "@remix-run/react";
import type { useAdminNotifications } from "./useAdminNotifications";

type FetcherNotificationsOptions<T> = {
  successId?: string;
  errorId?: string;
  onSuccess?: (data: T) => { title: string; message?: string } | null;
  onError?: (data: T) => { title: string; message?: string } | null;
  clearOnSubmit?: boolean;
};

export function useFetcherNotifications<T>(
  fetcher: FetcherWithComponents<T>,
  notifications: ReturnType<typeof useAdminNotifications>,
  options: FetcherNotificationsOptions<T> = {},
) {
  const {
    successId = "fetcher-success",
    errorId = "fetcher-error",
    onSuccess,
    onError,
    clearOnSubmit = true,
  } = options;

  const { notify, dismiss } = notifications;
  const lastHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (clearOnSubmit && fetcher.state === "submitting") {
      dismiss(successId);
      dismiss(errorId);
      lastHandledRef.current = null;
      return;
    }

    if (fetcher.state !== "idle" || !fetcher.data) return;

    const payload = fetcher.data as Record<string, unknown>;
    const fingerprint = JSON.stringify(payload);
    if (lastHandledRef.current === fingerprint) return;
    lastHandledRef.current = fingerprint;

    if (payload.success) {
      dismiss(errorId);
      const content = onSuccess?.(fetcher.data) ?? {
        title: "Saved",
        message: "Your changes were applied successfully.",
      };
      if (content) {
        notify({
          id: successId,
          tone: "success",
          title: content.title,
          message: content.message,
          autoHideMs: 6000,
        });
      }
      return;
    }

    if (payload.error) {
      dismiss(successId);
      const content = onError?.(fetcher.data) ?? {
        title: "Something went wrong",
        message: String(payload.error),
      };
      if (content) {
        notify({
          id: errorId,
          tone: "critical",
          title: content.title,
          message: content.message,
          persistDismiss: false,
          autoHideMs: false,
        });
      }
    }
  }, [
    fetcher.state,
    fetcher.data,
    notify,
    dismiss,
    successId,
    errorId,
    onSuccess,
    onError,
    clearOnSubmit,
  ]);
}
