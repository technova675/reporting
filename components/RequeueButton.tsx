"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAutomation } from "./AutomationProvider";

/** Re-runs an audit against the same inputs and refreshes the server page. */
export function RequeueButton({ auditId }: { auditId: string }) {
  const router = useRouter();
  const { notifyMutation } = useAutomation();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/audits/${auditId}`, { method: "POST" });
        notifyMutation();
        router.refresh();
        setBusy(false);
      }}
    >
      {busy ? "Queueing…" : "Re-run audit"}
    </button>
  );
}
