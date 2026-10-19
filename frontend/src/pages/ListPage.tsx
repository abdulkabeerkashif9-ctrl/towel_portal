import { useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Filter, Layers, List, Plus, Search, X } from "lucide-react"
import { call } from "@/lib/api"
import { DOCSTATUS_LABEL, formatCurrency, formatDate, formatDateTime, formatNumber, toneFor } from "@/lib/format"
import type { DocField, ListResponse, PortalDoctype, ReportResponse, Row } from "@/lib/types"
import { cn, downloadCsv } from "@/lib/utils"
import { useBoot, useMeta } from "@/hooks/data"
import { LinkField } from "@/components/form/LinkField"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input, NativeSelect } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table"

const PAGE_SIZES = [20, 100, 500]
const RIGHT = ["Currency", "Float", "Int", "Percent"]

export function ListPage() {
  const { route = "" } = useParams()
  const cfg = useBoot().doctypes.find((d) => d.route === route)
  if (!cfg || !cfg.perms.read) return <div className="py-20 text-center text-muted-foreground">Page not found or not permitted.</div>
  return <DocList key={route} cfg={cfg} />
}

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useMemo(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

function DocList({ cfg }: { cfg: PortalDoctype }) {
  const { currency } = useBoot()
  const navigate = useNavigate()
  const meta = useMeta(cfg.doctype).data

  const [view, setView] = useState<"list" | "report">("list")
  const [search, setSearch] = useState("")
  const [party, setParty] = useState<string | null>(null)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [docstatus, setDocstatus] = useState("")
  const [orderBy, setOrderBy] = useState<{ field: string; dir: "asc" | "desc" } | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const q = useDebounced(search)
  const filters = { search: q, party, from_date: from || null, to_date: to || null, docstatus: docstatus || null }

  const list = useQuery({
    queryKey: ["list", cfg.doctype, filters, orderBy, page, pageSize],
    queryFn: () => call<ListResponse>("get_list", { doctype: cfg.doctype, ...filters, order_by: orderBy ? `${orderBy.field} ${orderBy.dir}` : null, page, page_size: pageSize }),
    placeholderData: keepPreviousData,
    enabled: view === "list",
  })
  const report = useQuery({
    queryKey: ["report", cfg.doctype, filters],
    queryFn: () => call<ReportResponse>("get_report", { doctype: cfg.doctype, ...filters }),
    placeholderData: keepPreviousData,
    enabled: view === "report" && Boolean(cfg.report),
  })

  const fieldMap = useMemo(() => new Map(meta?.meta.fields.map((f) => [f.fieldname, f])), [meta])
  const columns = cfg.list_fields.map((fn) => fieldMap.get(fn) ?? ({ fieldname: fn, label: fn === "name" ? cfg.doctype : fn, fieldtype: fn === "name" ? "Link" : "Data" } as DocField))
  const hasStatusColumn = Boolean(cfg.status_field && cfg.list_fields.includes(cfg.status_field))

  const reset = (fn: () => void) => { fn(); setPage(1); setSelected(new Set()) }
  const activeFilters = [party, from, to, docstatus].filter(Boolean).length
  const rows = list.data?.rows ?? []
  const total = list.data?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.name))
  const label = (n: number) => `${n} ${n === 1 ? cfg.doctype.toLowerCase() : cfg.plural.toLowerCase()}`

  const sort = (field: string) => reset(() => setOrderBy((o) => (o?.field === field ? (o.dir === "asc" ? { field, dir: "desc" } : null) : { field, dir: "asc" })))

  const exportSelected = () => {
    const picked = rows.filter((r) => selected.has(r.name))
    downloadCsv(`${cfg.route}.csv`, [columns.map((c) => c.label), ...picked.map((r) => columns.map((c) => r[c.fieldname]))])
  }

  const cell = (df: DocField, row: Row) => {
    const v = row[df.fieldname]
    if (df.fieldname === "name") return <Link to={`/${cfg.route}/${encodeURIComponent(row.name)}`} className="font-semibold hover:text-primary hover:underline">{v}</Link>
    if (df.fieldname === cfg.status_field && v) return <Badge tone={toneFor(String(v))}>{v}</Badge>
    switch (df.fieldtype) {
      case "Currency": return formatCurrency(v, row.currency || currency)
      case "Float": case "Percent": return formatNumber(v)
      case "Int": return formatNumber(v, 0)
      case "Date": return formatDate(v)
      case "Datetime": return formatDateTime(v)
      default: return v ?? <span className="text-muted-foreground">—</span>
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{cfg.plural}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{list.data ? label(total) : " "}</p>
        </div>
        {cfg.perms.create && <Button className="ml-auto" onClick={() => navigate(`/${cfg.route}/new`)}><Plus /> New {cfg.doctype}</Button>}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-60 flex-1 md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder={`Search ${cfg.doctype.toLowerCase()} or party…`} value={search} onChange={(e) => reset(() => setSearch(e.target.value))} />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {cfg.party_doctype && <LinkField clearable className="w-56" doctype={cfg.party_doctype} value={party} placeholder={cfg.party_label} onChange={(v) => reset(() => setParty(v))} />}
            <div className="flex items-center gap-2">
              <Input type="date" className="w-40" value={from} onChange={(e) => reset(() => setFrom(e.target.value))} aria-label="From date" />
              <span className="text-muted-foreground">–</span>
              <Input type="date" className="w-40" value={to} onChange={(e) => reset(() => setTo(e.target.value))} aria-label="To date" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-4 pb-4">
          <div className="inline-flex rounded-md border border-input p-0.5">
            {([["list", List, "List"], ["report", Layers, "Report"]] as const).map(([key, Icon, text]) => (
              <button key={key} disabled={key === "report" && !cfg.report} onClick={() => setView(key)} className={cn("inline-flex h-7 cursor-pointer items-center gap-1.5 rounded px-3 text-[13px] font-medium text-muted-foreground disabled:opacity-40", view === key && "bg-accent text-foreground")}>
                <Icon className="size-3.5" /> {text}
              </button>
            ))}
          </div>
          <Popover>
            <PopoverTrigger asChild><Button variant="outline" size="sm"><Filter /> Filter{activeFilters ? <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{activeFilters}</span> : null}</Button></PopoverTrigger>
            <PopoverContent className="w-64 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Document status</label>
                <NativeSelect value={docstatus} onChange={(e) => reset(() => setDocstatus(e.target.value))}>
                  <option value="">All</option>
                  {DOCSTATUS_LABEL.map((l, i) => <option key={l} value={i}>{l}</option>)}
                </NativeSelect>
              </div>
              <Button variant="ghost" size="sm" className="w-full" onClick={() => reset(() => { setParty(null); setFrom(""); setTo(""); setDocstatus(""); setSearch("") })}><X /> Clear all</Button>
            </PopoverContent>
          </Popover>
          {selected.size > 0 && view === "list" && (
            <div className="ml-2 flex items-center gap-2 text-sm text-muted-foreground">
              {selected.size} selected
              <Button variant="secondary" size="sm" onClick={exportSelected}><Download /> Export CSV</Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          )}
        </div>

        {view === "list" ? (
          <>
            <div className="border-t border-border">
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH className="w-12"><Checkbox aria-label="Select all" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.name)) : new Set())} /></TH>
                    {columns.map((c) => (
                      <TH key={c.fieldname} className={cn(RIGHT.includes(c.fieldtype) && "text-right")}>
                        <button onClick={() => sort(c.fieldname)} className="inline-flex cursor-pointer items-center gap-1 uppercase tracking-wider hover:text-foreground">
                          {c.label}
                          {orderBy?.field === c.fieldname && (orderBy.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                        </button>
                      </TH>
                    ))}
                    {!hasStatusColumn && <TH>Status</TH>}
                  </TR>
                </THead>
                <TBody>
                  {list.isLoading && Array.from({ length: 5 }).map((_, i) => <TR key={i}><TD colSpan={columns.length + 2}><Skeleton className="h-5 w-full" /></TD></TR>)}
                  {list.isError && <TR><TD colSpan={columns.length + 2} className="py-10 text-center text-destructive">{(list.error as Error).message}</TD></TR>}
                  {list.data && rows.length === 0 && <TR><TD colSpan={columns.length + 2} className="py-12 text-center text-muted-foreground">No {cfg.plural.toLowerCase()} found</TD></TR>}
                  {rows.map((row) => (
                    <TR key={row.name} className={cn("hover:bg-accent/40", selected.has(row.name) && "bg-accent/60")}>
                      <TD><Checkbox aria-label={`Select ${row.name}`} checked={selected.has(row.name)} onChange={(e) => setSelected((s) => { const n = new Set(s); e.target.checked ? n.add(row.name) : n.delete(row.name); return n })} /></TD>
                      {columns.map((c) => <TD key={c.fieldname} className={cn(RIGHT.includes(c.fieldtype) && "text-right tabular-nums")}>{cell(c, row)}</TD>)}
                      {!hasStatusColumn && <TD><Badge tone={toneFor(DOCSTATUS_LABEL[row.docstatus ?? 0])}>{DOCSTATUS_LABEL[row.docstatus ?? 0]}</Badge></TD>}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
              <span>{total ? <>Showing <b className="text-foreground">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}</b> of <b className="text-foreground">{total}</b></> : "No results"}</span>
              <div className="ml-auto flex items-center gap-2">
                <div className="inline-flex rounded-md border border-input p-0.5">
                  {PAGE_SIZES.map((s) => <button key={s} onClick={() => reset(() => setPageSize(s))} className={cn("h-6 cursor-pointer rounded px-2.5 text-xs font-medium", pageSize === s && "bg-accent text-foreground")}>{s}</button>)}
                </div>
                <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft /></Button>
                <Button variant="outline" size="icon-sm" disabled={page >= lastPage} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight /></Button>
              </div>
            </div>
          </>
        ) : (
          <ReportTable cfg={cfg} fieldMap={fieldMap} data={report.data} loading={report.isLoading} error={report.error as Error | null} currency={currency} />
        )}
      </div>
    </div>
  )
}

function ReportTable({ cfg, fieldMap, data, loading, error, currency }: { cfg: PortalDoctype; fieldMap: Map<string, DocField>; data?: ReportResponse; loading: boolean; error: Error | null; currency: string }) {
  const sums = data?.sums ?? cfg.report?.sum ?? []
  const labelOf = (f: string) => fieldMap.get(f)?.label ?? f
  const rows = data?.rows ?? []
  const totals = sums.map((s) => rows.reduce((acc, r) => acc + (Number(r[s]) || 0), 0))
  const fmt = (s: string, v: number) => (fieldMap.get(s)?.fieldtype === "Currency" ? formatCurrency(v, currency) : formatNumber(v))

  return (
    <div className="border-t border-border">
      <Table>
        <THead>
          <TR><TH>{cfg.report ? labelOf(cfg.report.group_by) : ""}</TH><TH className="text-right">Documents</TH>{sums.map((s) => <TH key={s} className="text-right">{labelOf(s)}</TH>)}</TR>
        </THead>
        <TBody>
          {loading && <TR><TD colSpan={sums.length + 2}><Skeleton className="h-5 w-full" /></TD></TR>}
          {error && <TR><TD colSpan={sums.length + 2} className="py-10 text-center text-destructive">{error.message}</TD></TR>}
          {data && rows.length === 0 && <TR><TD colSpan={sums.length + 2} className="py-12 text-center text-muted-foreground">Nothing to report</TD></TR>}
          {rows.map((r, i) => (
            <TR key={i} className="hover:bg-accent/40">
              <TD className="font-medium">{r[data!.group_by!] ?? "—"}</TD>
              <TD className="text-right tabular-nums">{r.count}</TD>
              {sums.map((s) => <TD key={s} className="text-right tabular-nums">{fmt(s, Number(r[s]) || 0)}</TD>)}
            </TR>
          ))}
          {rows.length > 0 && (
            <TR className="bg-muted/40 font-semibold">
              <TD>Total</TD>
              <TD className="text-right tabular-nums">{rows.reduce((a, r) => a + Number(r.count), 0)}</TD>
              {sums.map((s, i) => <TD key={s} className="text-right tabular-nums">{fmt(s, totals[i])}</TD>)}
            </TR>
          )}
        </TBody>
      </Table>
    </div>
  )
}
