import type { ReactNode } from "react";

type AdminPageProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function AdminPage({ title, subtitle, actions, children }: AdminPageProps) {
  return (
    <>
      <header className="vton-page-header">
        <div>
          <h1 className="vton-page-title">{title}</h1>
          {subtitle ? <p className="vton-page-subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="vton-page-actions">{actions}</div> : null}
      </header>
      {children}
    </>
  );
}
