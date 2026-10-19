import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { call } from "@/lib/api"
import { DOCSTATUS_LABEL, formatCurrency, formatDateTime, toneFor } from "@/lib/format"
import type { DashboardResponse } from "@/lib/types"
import { useBoot } from "@/hooks/data"
import { DoctypeIcon } from "@/components/layout/icons"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export function Dashboard() {
  const { user, currency } = useBoot()
  const { data, isLoading, error } = useQuery({ queryKey: ["dashboard"], queryFn: () => call<DashboardResponse>("get_dashboard") })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {user.full_name.split(" ")[0]}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">Submitted totals and document counts across your portal pages</p>
      </div>
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {isLoading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
        {data?.cards.map((c) => (
          <Link key={c.doctype} to={`/${c.route}`} className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50">
            <div className="flex items-center gap-2.5 text-sm font-medium text-muted-foreground group-hover:text-foreground">
              <DoctypeIcon name={c.icon} className="size-4" /> {c.plural}
            </div>
            <div className="mt-3 text-2xl font-semibold tabular-nums tracking-tight">{c.amount !== undefined ? formatCurrency(c.amount, currency) : c.submitted}</div>
            {c.outstanding !== undefined && <div className="mt-0.5 text-xs text-muted-foreground">{formatCurrency(c.outstanding, currency)} outstanding</div>}
            <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
              <span><b className="text-foreground">{c.draft}</b> draft</span>
              <span><b className="text-foreground">{c.submitted}</b> submitted</span>
              <span><b className="text-foreground">{c.cancelled}</b> cancelled</span>
            </div>
          </Link>
        ))}
      </div>
      {data && data.recent.length > 0 && (
        <section className="rounded-xl border border-border bg-card">
          <h2 className="px-5 py-3.5 text-sm font-semibold">Recently modified</h2>
          <ul className="divide-y divide-border border-t border-border">
            {data.recent.map((r) => (
              <li key={`${r.doctype}-${r.name}`}>
                <Link to={`/${r.route}/${encodeURIComponent(r.name)}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-accent/40">
                  <span className="w-36 shrink-0 text-xs text-muted-foreground">{r.doctype}</span>
                  <span className="font-medium">{r.name}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.title}</span>
                  <Badge tone={toneFor(DOCSTATUS_LABEL[r.docstatus])}>{DOCSTATUS_LABEL[r.docstatus]}</Badge>
                  <span className="hidden w-40 text-right text-xs text-muted-foreground sm:block">{formatDateTime(r.modified)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
