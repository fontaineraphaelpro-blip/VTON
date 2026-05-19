import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminNotification, AdminNotificationInput } from "../lib/admin-notifications";
import {
  isNotificationDismissed,
  persistNotificationDismiss,
  resolveAutoHideMs,
  sortNotifications,
} from "../lib/admin-notifications";

export function useAdminNotifications() {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: string, options?: { persist?: boolean }) => {
      clearTimer(id);
      if (options?.persist) {
        persistNotificationDismiss(id);
      }
      setItems((prev) => prev.filter((n) => n.id !== id));
    },
    [clearTimer],
  );

  const notify = useCallback(
    (input: AdminNotificationInput) => {
      if (input.persistDismiss && isNotificationDismissed(input.id)) {
        return;
      }

      const entry: AdminNotification = {
        ...input,
        dismissible: input.dismissible !== false,
        createdAt: Date.now(),
      };

      setItems((prev) => {
        const without = prev.filter((n) => n.id !== input.id);
        return sortNotifications([...without, entry]);
      });

      clearTimer(input.id);
      const hideMs = resolveAutoHideMs(input.tone, input.autoHideMs);
      if (hideMs !== false && hideMs > 0) {
        const timer = setTimeout(() => dismiss(input.id), hideMs);
        timersRef.current.set(input.id, timer);
      }
    },
    [clearTimer, dismiss],
  );

  const dismissAll = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current.clear();
    setItems([]);
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, []);

  return {
    notifications: items,
    notify,
    dismiss,
    dismissAll,
    hasNotifications: items.length > 0,
  };
}

/** Sync a list of conditional notifications (show/hide from props). */
export function useNotificationSync(
  definitions: (AdminNotificationInput & { show: boolean })[],
  api: ReturnType<typeof useAdminNotifications>,
) {
  const { notify, dismiss } = api;
  const signature = definitions.map((d) => `${d.id}:${d.show}`).join("|");

  useEffect(() => {
    const visible = new Set<string>();
    for (const def of definitions) {
      if (def.show) {
        visible.add(def.id);
        const { show: _s, ...input } = def;
        notify(input);
      }
    }
    for (const def of definitions) {
      if (!def.show) {
        dismiss(def.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signature captures content
  }, [signature, notify, dismiss]);
}
