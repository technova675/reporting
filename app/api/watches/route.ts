import { newId, now, read, write } from "@/lib/db";
import { nextRunFor, queueScan } from "@/lib/automation/engine";
import { parseCompetitors } from "@/lib/services/competitor";
import { WATCH_CADENCES, WATCH_FOCUS } from "@/lib/types";
import type { Watch, WatchCadence, WatchFocus } from "@/lib/types";

export async function GET() {
  const db = await read();
  // Each watch carries only its latest scan; the full history is on the detail
  // route, because a year of weekly scans is not list-view payload.
  return Response.json({
    watches: db.watches.map((watch) => {
      const scans = db.scans.filter((s) => s.watchId === watch.id);
      const latest = scans.find((s) => s.status === "complete") ?? null;
      return {
        ...watch,
        pending: scans.some(
          (s) => s.status === "queued" || s.status === "running",
        ),
        latestScan: latest
          ? {
              id: latest.id,
              createdAt: latest.createdAt,
              summary: latest.summary,
              isBaseline: latest.isBaseline,
              signalCount: latest.signals.length,
              changeCount: latest.signals.filter((s) => s.isChange).length,
              highCount: latest.signals.filter(
                (s) => s.isChange && s.significance === "high",
              ).length,
            }
          : null,
      };
    }),
  });
}

interface CreateBody {
  label?: string;
  clientName?: string;
  competitors?: string;
  focus?: string[];
  cadence?: string;
  scanNow?: boolean;
}

export async function POST(request: Request) {
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const competitors = parseCompetitors(body.competitors ?? "");
  if (competitors.length === 0) {
    return Response.json(
      { error: "Add at least one competitor domain to watch." },
      { status: 400 },
    );
  }

  const clientName = body.clientName?.trim();
  if (!clientName) {
    return Response.json(
      { error: "A client name is required — a watch belongs to someone." },
      { status: 400 },
    );
  }

  const cadence: WatchCadence = (WATCH_CADENCES as readonly string[]).includes(
    body.cadence ?? "",
  )
    ? (body.cadence as WatchCadence)
    : "weekly";

  const focus = (body.focus ?? []).filter((f): f is WatchFocus =>
    (WATCH_FOCUS as readonly string[]).includes(f),
  );

  const watch = await write((db) => {
    const record: Watch = {
      id: newId("watch"),
      createdAt: now(),
      updatedAt: now(),
      label: body.label?.trim() || `${clientName} — competitor set`,
      clientName,
      competitors,
      // An empty focus list would give the model no brief at all.
      focus: focus.length ? focus : ["offers", "positioning", "ads"],
      cadence,
      enabled: true,
      nextRunAt: null,
      lastRunAt: null,
      lastScanId: null,
      scanCount: 0,
      error: null,
    };
    record.nextRunAt = nextRunFor(record);
    db.watches.unshift(record);

    // The first scan is the baseline, so there is no point waiting a week.
    if (body.scanNow !== false) queueScan(db, record);

    return record;
  });

  return Response.json({ watch }, { status: 201 });
}
