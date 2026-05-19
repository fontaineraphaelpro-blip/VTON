import type { ReactNode } from "react";
import { Page } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { AdminPage } from "./AdminPage";

type AdminDocShellProps = {
  titleBar: string;
  title: string;
  subtitle?: string;
  updatedAt?: string;
  children: ReactNode;
};

export function AdminDocShell({
  titleBar,
  title,
  subtitle,
  updatedAt,
  children,
}: AdminDocShellProps) {
  return (
    <Page>
      <TitleBar title={titleBar} />
      <div className="app-container">
        <AdminPage title={title} subtitle={subtitle}>
          <article className="vton-panel vton-doc">
            {updatedAt ? (
              <p className="vton-doc__meta">
                <strong>Last updated:</strong> {updatedAt}
              </p>
            ) : null}
            <div className="vton-doc__body">{children}</div>
          </article>
        </AdminPage>
      </div>
    </Page>
  );
}
