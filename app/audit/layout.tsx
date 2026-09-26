import type { Metadata } from "next";
import { auditorFonts } from "@/components/audit/fonts";
import "@/components/audit/auditor.css";

export const metadata: Metadata = {
  title: "Free AI Marketing Audit — Adbibe",
  description:
    "One AI agent audits your website, SEO, social, ads, competitors, content, funnel, conversion and positioning, and hands back a prioritized fix list.",
};

/** The public face of the Auditor: always the dark brand palette. */
export default function AuditLayout({ children }: LayoutProps<"/audit">) {
  return (
    <div className={`auditor au-page ${auditorFonts}`} data-theme="dark">
      <div className="au-wrap">{children}</div>
    </div>
  );
}
