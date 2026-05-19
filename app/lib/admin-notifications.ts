import type { ReactNode } from "react";

export type NotificationTone = "success" | "info" | "warning" | "critical";

export type NotificationAction = {
  label: string;
  onAction: () => void;
};

export type AdminNotificationInput = {
  id: string;
  tone: NotificationTone;
  title: string;
  message?: ReactNode;
  /** Lower = shown first among same tone */
  priority?: number;
  dismissible?: boolean;
  /** Remember dismiss for this browser session */
  persistDismiss?: boolean;
  /** ms; false = never auto-hide; undefined = tone default */
  autoHideMs?: number | false;
  action?: NotificationAction;
  children?: ReactNode;
};

export type AdminNotification = AdminNotificationInput & {
  createdAt: number;
};

const TONE_ORDER: Record<NotificationTone, number> = {
  critical: 0,
  warning: 1,
  success: 2,
  info: 3,
};

const DEFAULT_AUTO_HIDE: Record<NotificationTone, number | false> = {
  success: 6000,
  info: false,
  warning: false,
  critical: false,
};

const DISMISS_PREFIX = "vton-dismiss:";

export function getDefaultAutoHideMs(tone: NotificationTone): number | false {
  return DEFAULT_AUTO_HIDE[tone];
}

export function sortNotifications(items: AdminNotification[]): AdminNotification[] {
  return [...items].sort((a, b) => {
    const toneDiff = TONE_ORDER[a.tone] - TONE_ORDER[b.tone];
    if (toneDiff !== 0) return toneDiff;
    const prioDiff = (a.priority ?? 50) - (b.priority ?? 50);
    if (prioDiff !== 0) return prioDiff;
    return b.createdAt - a.createdAt;
  });
}

export function isNotificationDismissed(id: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(`${DISMISS_PREFIX}${id}`) === "1";
}

export function persistNotificationDismiss(id: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(`${DISMISS_PREFIX}${id}`, "1");
}

export function clearNotificationDismiss(id: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(`${DISMISS_PREFIX}${id}`);
}

export function resolveAutoHideMs(
  tone: NotificationTone,
  autoHideMs?: number | false,
): number | false {
  if (autoHideMs === false) return false;
  if (typeof autoHideMs === "number") return autoHideMs;
  return getDefaultAutoHideMs(tone);
}
