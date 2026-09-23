"use client";

import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  Copy,
  Download,
  FileSpreadsheet,
  Info,
  LoaderCircle,
  TableProperties,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EXCEL_COLUMNS, parseSheetRows, type ParsedSheet, type RowStatus } from "@/lib/excel-columns";
import { localDay } from "@/lib/learning";
import { useVocab } from "@/lib/store";
import type { Word } from "@/lib/types";
import { cn, playTone, plural } from "@/lib/utils";
import { Button, IconTile, Segmented, Sheet } from "./ui";

export const EXCEL_IMPORT_EVENT = "vb:open-excel-import";
export const openExcelImport = () => window.dispatchEvent(new Event(EXCEL_IMPORT_EVENT));

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 5000;

function csvToRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function readRows(file: File): Promise<unknown[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return csvToRows(await file.text());
  if (name.endsWith(".xls")) throw new Error("Old .xls files aren't supported. In Excel choose File → Save As → Excel Workbook (.xlsx) and try again.");
  if (!name.endsWith(".xlsx")) throw new Error("Please choose an Excel (.xlsx) or CSV file.");
  const { readSheet } = await import("read-excel-file/browser");
  return (await readSheet(file)) as unknown[][];
}

export async function downloadExcelTemplate() {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const header = EXCEL_COLUMNS.map((c) => ({ value: c.header, fontWeight: "bold" as const, backgroundColor: "#6366F1", textColor: "#FFFFFF" }));
  const sample = EXCEL_COLUMNS.map((c) => ({ value: c.example, wrap: true }));
  const second = ["Ephemeral", "ক্ষণস্থায়ী", "Lasting for a very short time.", "adjective", "Transient, Fleeting", "Permanent, Eternal", "Fame on social media is often ephemeral.", "epi- (upon)", "hemera (day)", "-al", "Lasting only 'a day'.", "/ɪˈfem.ər.əl/", "", "hard", "GRE"].map((v) => ({ value: v, wrap: true }));
  await writeXlsxFile([header, sample, second], {
    sheet: "Words",
    columns: EXCEL_COLUMNS.map((c) => ({ width: c.width })),
    stickyRowsCount: 1,
  }).toFile("vocabera-import-template.xlsx");
}

export async function exportWordsExcel(words: Word[]) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const header = EXCEL_COLUMNS.map((c) => ({ value: c.header, fontWeight: "bold" as const, backgroundColor: "#6366F1", textColor: "#FFFFFF" }));
  const rows = words.map((w) =>
    EXCEL_COLUMNS.map((c) => {
      const v = w[c.field];
      return { value: Array.isArray(v) ? v.join(", ") : String(v ?? ""), wrap: c.width > 20 };
    }),
  );
  await writeXlsxFile([header, ...rows], {
    sheet: "Words",
    columns: EXCEL_COLUMNS.map((c) => ({ width: c.width })),
    stickyRowsCount: 1,
  }).toFile(`vocabera-words-${localDay()}.xlsx`);
}

const STATUS_STYLE: Record<RowStatus, { label: string; cls: string }> = {
  ready: { label: "Ready", cls: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
  duplicate: { label: "Duplicate", cls: "bg-amber-500/12 text-amber-700 dark:text-amber-300" },
  invalid: { label: "Invalid", cls: "bg-rose-500/12 text-rose-700 dark:text-rose-300" },
};

export function ExcelImport() {
  const { words, importWords } = useVocab();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"guide" | "preview">("guide");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState<"all" | RowStatus>("all");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = () => {
      setStep("guide");
      setParsed(null);
      setFileName("");
      setFilter("all");
      setOpen(true);
    };
    window.addEventListener(EXCEL_IMPORT_EVENT, handler);
    return () => window.removeEventListener(EXCEL_IMPORT_EVENT, handler);
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_BYTES) {
        toast.error("File is larger than 10 MB");
        return;
      }
      setReading(true);
      try {
        const rows = await readRows(file);
        if (rows.length > MAX_ROWS + 1) throw new Error(`Too many rows — up to ${MAX_ROWS.toLocaleString()} words per file.`);
        const result = parseSheetRows(rows, words.map((w) => w.word));
        if (!result.headers.length) throw new Error("The first sheet is empty.");
        setParsed(result);
        setFileName(file.name);
        setFilter("all");
        setStep("preview");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not read this file");
      } finally {
        setReading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [words],
  );

  const counts = useMemo(() => {
    const c = { ready: 0, duplicate: 0, invalid: 0 };
    for (const r of parsed?.rows ?? []) c[r.status]++;
    return c;
  }, [parsed]);

  const shown = useMemo(() => (parsed?.rows ?? []).filter((r) => filter === "all" || r.status === filter).slice(0, 300), [parsed, filter]);
  const toImport = (parsed?.rows ?? []).filter((r) => r.status === "ready");
  const blocked = !!parsed?.missingRequired.length;

  const runImport = async () => {
    if (!toImport.length || blocked) return;
    setImporting(true);
    const res = await importWords(toImport.map((r) => r.data));
    setImporting(false);
    if (!res) return;
    playTone("complete");
    toast.success(`Imported ${plural(res.inserted, "word")} from ${fileName}${res.skipped ? ` · ${res.skipped} skipped` : ""}`);
    setOpen(false);
  };

  const copyHeaders = async () => {
    try {
      await navigator.clipboard.writeText(EXCEL_COLUMNS.map((c) => c.header).join("\t"));
      toast.success("Column names copied — paste into row 1 of your sheet");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <Sheet open={open} onClose={() => setOpen(false)} label="Import words from Excel" className="md:max-w-3xl">
      <div className="p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <IconTile icon={FileSpreadsheet} tone="emerald" size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold tracking-tight">Import words from Excel</h2>
            <p className="text-xs text-muted">{step === "guide" ? "Match your column names to the guide, then upload" : fileName}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full surface">
            <X className="size-4" />
          </button>
        </div>

        {step === "guide" ? (
          <>
            <div className="mt-5 flex items-start gap-2 rounded-2xl bg-sky-500/10 p-3.5 text-[13px] leading-relaxed text-sky-800 dark:text-sky-200">
              <Info className="mt-0.5 size-4 shrink-0" />
              <span>
                Put these <b>column names in row 1</b> of the first sheet (any order). Only <b>Word</b> and one meaning column are required — the rest are optional. Separate multiple synonyms, antonyms or tags with commas.
              </span>
            </div>

            <div className="mt-4 overflow-hidden rounded-[20px] border border-[var(--line)]">
              <div className="flex items-center justify-between gap-2 bg-black/[0.03] px-3.5 py-2.5 dark:bg-white/[0.04]">
                <span className="flex items-center gap-1.5 text-[13px] font-bold">
                  <TableProperties className="size-4 text-muted" /> Column guide
                </span>
                <button type="button" onClick={() => void copyHeaders()} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold text-brand-600 hover:bg-brand-500/10 dark:text-brand-300">
                  <Copy className="size-3.5" /> Copy names
                </button>
              </div>
              <div className="max-h-[38dvh] overflow-y-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="sticky top-0 bg-[var(--field)] text-[11px] uppercase tracking-wider text-muted backdrop-blur">
                    <tr>
                      <th className="px-3.5 py-2 font-bold">Column name</th>
                      <th className="hidden px-3 py-2 font-bold sm:table-cell">What to write</th>
                      <th className="px-3 py-2 font-bold">Example</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {EXCEL_COLUMNS.map((c) => (
                      <tr key={c.header}>
                        <td className="whitespace-nowrap px-3.5 py-2">
                          <code className="rounded-md bg-brand-500/10 px-1.5 py-0.5 font-bold text-brand-700 dark:text-brand-200">{c.header}</code>
                          {c.required === "always" && <span className="ml-1.5 text-[10px] font-bold uppercase text-rose-500">Required</span>}
                          {c.required === "one-meaning" && <span className="ml-1.5 text-[10px] font-bold uppercase text-amber-600">1 of 2</span>}
                        </td>
                        <td className="hidden px-3 py-2 text-muted sm:table-cell">{c.hint}</td>
                        <td className={cn("max-w-[11rem] truncate px-3 py-2 text-fg/80", c.field === "banglaMeaning" && "font-bangla")} title={c.example}>
                          {c.example}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void handleFile(f);
              }}
              className={cn(
                "mt-4 flex flex-col items-center rounded-[22px] border-2 border-dashed px-4 py-7 text-center transition",
                dragOver ? "border-emerald-500 bg-emerald-500/10" : "border-[var(--field-border)]",
              )}
            >
              {reading ? <LoaderCircle className="size-8 animate-spin text-emerald-500" /> : <Upload className="size-8 text-emerald-500" />}
              <p className="mt-2 text-sm font-bold">{reading ? "Reading your file…" : "Drop your Excel file here"}</p>
              <p className="text-xs text-muted">.xlsx or .csv · up to {MAX_ROWS.toLocaleString()} words</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button icon={Upload} disabled={reading} onClick={() => inputRef.current?.click()}>
                  Choose file
                </Button>
                <Button variant="secondary" icon={Download} onClick={() => void downloadExcelTemplate().catch(() => toast.error("Could not create the template"))}>
                  Download template
                </Button>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
            </div>
          </>
        ) : (
          parsed && (
            <>
              <div className="mt-5 flex flex-wrap gap-1.5">
                {parsed.headers
                  .filter((h) => h.raw)
                  .map((h) => (
                    <span
                      key={h.index}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
                        h.field ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-slate-500/12 text-muted line-through",
                      )}
                      title={h.field ? "Matched" : "Unknown column — will be ignored"}
                    >
                      {h.field ? <CircleCheck className="size-3" /> : <X className="size-3" />}
                      {h.raw}
                    </span>
                  ))}
              </div>

              {blocked ? (
                <div role="alert" className="mt-4 flex items-start gap-2 rounded-2xl bg-rose-500/10 p-3.5 text-[13px] text-rose-700 dark:text-rose-300">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Missing required column{parsed.missingRequired.length > 1 ? "s" : ""}: <b>{parsed.missingRequired.join(", ")}</b>. Rename the header in row 1 to match the guide and upload again.
                  </span>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {(["ready", "duplicate", "invalid"] as RowStatus[]).map((s) => (
                    <div key={s} className={cn("rounded-2xl px-2 py-3 text-center", STATUS_STYLE[s].cls)}>
                      <div className="text-xl font-extrabold tabular-nums">{counts[s]}</div>
                      <div className="text-[11px] font-bold">{STATUS_STYLE[s].label}</div>
                    </div>
                  ))}
                </div>
              )}

              {!blocked && parsed.rows.length > 0 && (
                <>
                  <Segmented
                    className="mt-4"
                    value={filter}
                    onChange={setFilter}
                    options={[
                      { value: "all", label: `All ${parsed.rows.length}` },
                      { value: "ready", label: "Ready" },
                      { value: "duplicate", label: "Dupes" },
                      { value: "invalid", label: "Invalid" },
                    ]}
                  />
                  <div className="mt-3 max-h-[36dvh] divide-y divide-[var(--line)] overflow-y-auto rounded-[20px] border border-[var(--line)]">
                    {shown.length === 0 ? (
                      <p className="p-6 text-center text-sm text-muted">No rows in this group.</p>
                    ) : (
                      shown.map((r) => (
                        <div key={r.line} className="flex items-start gap-3 px-3.5 py-2.5">
                          <span className="mt-0.5 w-8 shrink-0 text-right text-[11px] font-semibold tabular-nums text-muted">#{r.line}</span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-bold">{r.data.word || <span className="text-muted">(no word)</span>}</div>
                            <div className="truncate font-bangla text-[13px] text-muted">{r.data.banglaMeaning || r.data.englishMeaning || "—"}</div>
                            {r.issue && <div className="text-[11.5px] font-semibold text-amber-700 dark:text-amber-300">{r.issue}</div>}
                          </div>
                          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold", STATUS_STYLE[r.status].cls)}>{STATUS_STYLE[r.status].label}</span>
                        </div>
                      ))
                    )}
                  </div>
                  {parsed.rows.length > 300 && filter === "all" && <p className="mt-1.5 text-center text-[11px] text-muted">Showing first 300 rows</p>}
                </>
              )}

              {!blocked && counts.duplicate + counts.invalid > 0 && (
                <p className="mt-3 flex items-start gap-1.5 px-1 text-xs text-muted">
                  <Info className="mt-0.5 size-3.5 shrink-0" /> Duplicate and invalid rows are skipped. Words already in your list are never overwritten.
                </p>
              )}

              <div className="mt-5 grid grid-cols-[auto_1fr] gap-2 pb-[env(safe-area-inset-bottom)]">
                <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep("guide")}>
                  Back
                </Button>
                <Button icon={Upload} loading={importing} disabled={blocked || !toImport.length} onClick={() => void runImport()}>
                  Import {toImport.length ? plural(toImport.length, "word") : ""}
                </Button>
              </div>
            </>
          )
        )}
      </div>
    </Sheet>
  );
}
