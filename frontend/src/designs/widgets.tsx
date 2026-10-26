import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowUpRight, ScanLine } from "lucide-react"
import { useBoot } from "@/hooks/data"
import { formatCurrency, formatNumber } from "@/lib/format"
import type { Row } from "@/lib/types"
import { cn } from "@/lib/utils"
import type { Format, ScanSpec, Stat, Tone } from "./types"

export function Card({ title, description, actions, children, className }: { title?: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-border bg-card", className)}>
      {(title || actions) && (
        <header className="flex items-center gap-3 border-b border-border px-4 py-2">
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold">{title}</h2>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

// ------------------------------------------------------------------ scanning

/**
 * A prominent barcode input. A hardware scanner types the code and presses Enter; the code is written to
 * the document field, so the site's own Client Script for that field handles it exactly as it does in Desk.
 */
export function ScanBox({ spec, onScan, disabled }: { spec: ScanSpec; onScan: (code: string) => void; disabled?: boolean }) {
  const [text, setText] = useState("")
  const [last, setLast] = useState<string | null>(null)
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!disabled) ref.current?.focus()
  }, [disabled])

  const submit = () => {
    const code = text.trim()
    if (!code) return
    setText("")
    setLast(code)
    setCount((c) => c + 1)
    onScan(code)
    ref.current?.focus()
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3", disabled && "opacity-60")}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"><ScanLine className="size-5" /></div>
      <div className="min-w-60 flex-1">
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">{spec.label ?? "Scan"}</label>
        <input
          ref={ref}
          value={text}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          placeholder={spec.placeholder ?? "Scan or type a code, then press Enter"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit() } }}
          className="h-9 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm tracking-wide outline-none placeholder:font-sans placeholder:text-sm placeholder:tracking-normal placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <div className="text-right text-xs text-muted-foreground">
        <div><b className="text-lg font-semibold tabular-nums text-foreground">{count}</b> scanned</div>
        {last && <div className="mt-0.5 max-w-52 truncate font-mono" title={last}>last: {last}</div>}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ KPI cards

const toneClass: Record<Tone, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-primary",
}

export function formatStat(value: unknown, format: Format | undefined, currency: string) {
  if (value === null || value === undefined || value === "") return "—"
  if (format === "currency") return formatCurrency(Number(value), currency)
  if (format === "int") return formatNumber(Number(value), 0)
  if (format === "text") return String(value)
  return formatNumber(Number(value))
}

export function StatCards({ stats, doc }: { stats: Stat[]; doc: Row }) {
  const { currency } = useBoot()
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
      {stats.map((s) => {
        const raw = s.value ? s.value(doc) : s.field ? doc[s.field] : null
        return (
          <div key={s.label} className="rounded-xl border border-border bg-card px-3 py-2">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <div className={cn("mt-0.5 truncate text-xl font-semibold tabular-nums tracking-tight", toneClass[s.tone ?? "default"])}>{formatStat(raw, s.format, currency)}</div>
            {s.hint && <div className="mt-0.5 text-xs text-muted-foreground">{s.hint}</div>}
          </div>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------------ meter

export function Meter({ title, ratio, caption, invert }: { title: string; ratio: number | null; caption: string; invert?: boolean }) {
  const pct = ratio === null ? null : Math.max(0, Math.min(1, ratio)) * 100
  const good = pct === null ? "bg-muted-foreground/30" : (invert ? pct <= 15 : pct >= 85) ? "bg-success" : (invert ? pct <= 30 : pct >= 65) ? "bg-warning" : "bg-destructive"
  return (
    <Card className="h-full">
      <div className="flex h-full flex-col justify-center gap-2 px-4 py-3">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{title}</div>
        <div className="text-2xl font-semibold tabular-nums tracking-tight">{ratio === null ? "—" : `${(ratio * 100).toFixed(1)}%`}</div>
        <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full transition-all", good)} style={{ width: `${pct ?? 0}%` }} /></div>
        <div className="text-xs text-muted-foreground">{caption}</div>
      </div>
    </Card>
  )
}

// ------------------------------------------------------------------ linked documents

export function LinkChips({ items }: { items: { label: string; doctype: string; name: string }[] }) {
  const { doctypes } = useBoot()
  if (!items.length) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((it) => {
        const route = doctypes.find((d) => d.doctype === it.doctype && d.perms.read)?.route
        const className = "inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:border-primary/50"
        const inner = (
          <>
            <span className="text-xs text-muted-foreground">{it.label}</span>
            <span className="font-medium">{it.name}</span>
            <ArrowUpRight className="size-3.5 text-muted-foreground" />
          </>
        )
        return route ? (
          <Link key={it.label} to={`/${route}/${encodeURIComponent(it.name)}`} className={className}>{inner}</Link>
        ) : (
          <a key={it.label} href={`/app/${it.doctype.toLowerCase().replace(/[^a-z0-9]+/g, "-")}/${encodeURIComponent(it.name)}`} className={className}>{inner}</a>
        )
      })}
    </div>
  )
}
