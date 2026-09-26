import { notFound } from "next/navigation";
import { read } from "@/lib/db";
import { toPublicAudit } from "@/lib/publicAudit";
import { AuditorHeader } from "@/components/audit/AuditReport";
import { PublicAuditLive } from "@/components/audit/PublicAuditLive";

export default async function PublicAuditResultPage({
  params,
}: PageProps<"/audit/[id]">) {
  const { id } = await params;
  const db = await read();
  const audit = db.audits.find((a) => a.id === id && a.source === "public");
  if (!audit) notFound();

  return (
    <>
      <AuditorHeader title="Your Marketing Audit" />
      <PublicAuditLive
        initial={toPublicAudit(audit, db.audits)}
        initialPaused={!db.settings.enabled}
        bookingUrl={process.env.NEXT_PUBLIC_BOOKING_URL || null}
      />
    </>
  );
}
