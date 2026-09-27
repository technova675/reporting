"use client";

import { useRef, useState } from "react";
import { ACCEPTED_LEAD_FILES, parseLeadFile, parseLeadWorkbook } from "@/lib/leadFile";
import type { LeadField, ParsedLeadFile } from "@/lib/leadFile";

const FIELD_LABELS: Record<LeadField, string> = {
  name: "Name",
  company: "Company",
  website: "Website",
  email: "Email",
  linkedin: "LinkedIn",
};
const PREVIEW_ROWS = 5;

const SAMPLE = `Priya Sharma, Nova Skincare, novaskincare.in, priya@novaskincare.in, linkedin.com/in/priyasharma
Rahul Mehta, Fitly App, fitlyapp.com, rahul@fitlyapp.com, linkedin.com/in/rahulmehta
Ananya Rao, Bloom Bakes, bloombakes.in, ananya@bloombakes.in, linkedin.com/in/ananyarao`;

interface Props {
  onImported: () => void | Promise<void>;
  automationPaused: boolean;
}

/**
 * Bulk import. Unlike the old browser-only prototype there is no batch ceiling
 * here — the list goes into the queue and the worker drains it at whatever
 * concurrency the settings allow, so a thousand leads is a scheduling question,
 * not a "paste fewer rows" question.
 */
export function ImportPanel({ onImported, automationPaused }: Props) {
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [raw, setRaw] = useState("");
  const [file, setFile] = useState<{ name: string; parsed: ParsedLeadFile } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [owner, setOwner] = useState("");
  const [autoResearch, setAutoResearch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const rowCount =
    mode === "upload"
      ? (file?.parsed.rows.length ?? 0)
      : raw.split("\n").filter((l) => l.trim()).length;

  async function loadFile(picked: File | undefined) {
    if (!picked) return;
    setError(null);
    setWarnings([]);
    if (/\.(xls|numbers)$/i.test(picked.name)) {
      setFile(null);
      setError(
        "That older spreadsheet format can't be read — save it as .xlsx or CSV (File → Save as) and upload that.",
      );
      return;
    }
    let parsed: ParsedLeadFile;
    try {
      parsed = /\.xlsx$/i.test(picked.name)
        ? await parseLeadWorkbook(picked)
        : parseLeadFile(await picked.text(), picked.name);
    } catch {
      setFile(null);
      setError(`${picked.name} could not be read. Is it a valid spreadsheet?`);
      return;
    }
    if (parsed.rows.length === 0) {
      setFile(null);
      setError(`${picked.name} has no rows to import.`);
      return;
    }
    setFile({ name: picked.name, parsed });
  }

  function clearFile() {
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setWarnings([]);
    try {
      const payload =
        mode === "upload" ? { rows: file?.parsed.rows ?? [] } : { raw };
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, owner, autoResearch }),
      });
      const data = (await res.json()) as {
        error?: string;
        warnings?: string[];
        created?: number;
      };
      if (!res.ok) {
        setError(data.error ?? "Import failed.");
        setWarnings(data.warnings ?? []);
        return;
      }
      setWarnings(data.warnings ?? []);
      setRaw("");
      clearFile();
      await onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mb-5 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[13px] font-semibold">Import a lead list</h2>
        <div className="ml-auto flex gap-1" role="tablist">
          {(["upload", "paste"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={`btn btn-sm ${mode === m ? "btn-primary" : "btn-quiet"}`}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
            >
              {m === "upload" ? "Upload file" : "Paste list"}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-0.5 mb-3 text-[12px] text-muted">
        {mode === "upload" ? (
          <>
            An Excel (.xlsx), CSV or TSV file from Excel, Google Sheets, Apollo or Sales
            Navigator. Columns are matched by their headers (Name or First/Last
            Name, Company, Website, Email, LinkedIn), in any order.
          </>
        ) : (
          <>
            One lead per line:{" "}
            <code className="mono">name, company, website, email, linkedin</code>.
          </>
        )}{" "}
        Rows with no website and no LinkedIn are skipped — there would be
        nothing to research.
      </p>

      {mode === "paste" ? (
        <textarea
          className="field mono min-h-36 text-[12px]"
          placeholder={SAMPLE}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
      ) : file ? (
        <FilePreview name={file.name} parsed={file.parsed} onClear={clearFile} />
      ) : (
        <div
          className={`flex min-h-36 flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center text-[13px] ${
            dragging ? "border-accent bg-surface-2" : "border-line"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void loadFile(e.dataTransfer.files[0]);
          }}
        >
          <p className="text-muted">Drop an .xlsx or .csv file here, or</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => fileInput.current?.click()}
          >
            Choose file
          </button>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPTED_LEAD_FILES}
        className="hidden"
        onChange={(e) => void loadFile(e.target.files?.[0])}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          className="field max-w-44"
          placeholder="Owner (optional)"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        />
        <label className="flex items-center gap-2 text-[13px] text-muted">
          <input
            type="checkbox"
            checked={autoResearch}
            onChange={(e) => setAutoResearch(e.target.checked)}
          />
          Queue research on import
        </label>
        <div className="ml-auto flex items-center gap-2">
          {mode === "paste" && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => setRaw(SAMPLE)}
            >
              Load sample
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={busy || rowCount === 0}
          >
            {busy
              ? "Importing…"
              : `Import ${rowCount || ""} lead${rowCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>

      {autoResearch && automationPaused && (
        <p className="mt-3 rounded-md bg-warn-soft px-3 py-2 text-[12px] text-warn">
          Automation is paused, so these will sit in the queue until you start
          the worker on the Automation page.
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger">
          {error}
        </p>
      )}

      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-md bg-surface-2 px-3 py-2 text-[12px] text-muted">
          {warnings.map((w) => (
            <li key={w}>· {w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FilePreview({
  name,
  parsed,
  onClear,
}: {
  name: string;
  parsed: ParsedLeadFile;
  onClear: () => void;
}) {
  const fields = Object.keys(FIELD_LABELS) as LeadField[];
  const { rows, mapping, ignored } = parsed;
  const positional = Object.keys(mapping).length === 0;
  const nameSource =
    mapping.name ??
    [mapping.firstName, mapping.lastName].filter(Boolean).join(" + ");

  return (
    <div className="rounded-lg border border-line p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px]">
        <b className="mono">{name}</b>
        <span className="text-muted">
          {rows.length} row{rows.length === 1 ? "" : "s"}
        </span>
        <button type="button" className="btn btn-quiet btn-sm ml-auto" onClick={onClear}>
          Choose another file
        </button>
      </div>

      <p className="mb-2 text-[12px] text-muted">
        {positional ? (
          <>No header row found — read as name, company, website, email, linkedin.</>
        ) : (
          fields.map((f) => {
            const source = f === "name" ? nameSource : mapping[f];
            return (
              <span key={f} className="mr-3 inline-block">
                {FIELD_LABELS[f]} ←{" "}
                {source ? <span className="mono">{source}</span> : <i>not found</i>}
              </span>
            );
          })
        )}
      </p>
      {ignored.length > 0 && (
        <p className="mb-2 text-[12px] text-muted">
          Ignored columns: {ignored.join(", ")}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead className="text-muted">
            <tr>
              {fields.map((f) => (
                <th key={f} className="py-1 pr-3 font-medium">
                  {FIELD_LABELS[f]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, PREVIEW_ROWS).map((row, i) => (
              <tr key={i} className="border-t border-line">
                {fields.map((f) => (
                  <td key={f} className="max-w-48 truncate py-1 pr-3">
                    {row[f] || <span className="text-muted">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > PREVIEW_ROWS && (
        <p className="mt-1 text-[12px] text-muted">
          …and {rows.length - PREVIEW_ROWS} more.
        </p>
      )}
    </div>
  );
}
