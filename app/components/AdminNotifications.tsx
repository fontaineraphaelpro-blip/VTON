import type { AdminNotification } from "../lib/admin-notifications";

const TONE_ICONS: Record<AdminNotification["tone"], string> = {
  success: "✓",
  info: "i",
  warning: "!",
  critical: "×",
};

type AdminNotificationsProps = {
  items: AdminNotification[];
  onDismiss: (id: string, options?: { persist?: boolean }) => void;
};

export function AdminNotifications({ items, onDismiss }: AdminNotificationsProps) {
  if (items.length === 0) return null;

  return (
    <div className="vton-notify-stack" role="region" aria-label="Notifications">
      {items.map((item) => (
        <div
          key={item.id}
          className={`vton-notify vton-notify--${item.tone}`}
          role="alert"
          data-notification-id={item.id}
        >
          <span className="vton-notify__icon" aria-hidden="true">
            {TONE_ICONS[item.tone]}
          </span>
          <div className="vton-notify__content">
            <p className="vton-notify__title">{item.title}</p>
            {item.message ? (
              <div className="vton-notify__message">{item.message}</div>
            ) : null}
            {item.children}
          </div>
          <div className="vton-notify__actions">
            {item.action ? (
              <button
                type="button"
                className="vton-notify__btn"
                onClick={item.action.onAction}
              >
                {item.action.label}
              </button>
            ) : null}
            {item.dismissible !== false ? (
              <button
                type="button"
                className="vton-notify__close"
                aria-label="Dismiss notification"
                onClick={() =>
                  onDismiss(item.id, {
                    persist: item.persistDismiss,
                  })
                }
              >
                ×
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
