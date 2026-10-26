import { useMemo, useState } from "react"
import { ChevronRight } from "lucide-react"
import { effectiveDf, type FormRuntime, type View } from "@/compat/runtime"
import { ChildTable } from "@/components/form/ChildTable"
import { INPUT_TYPES } from "@/components/form/FieldInput"
import { FieldRow, FormLayout, isReadOnlyField, isVisible } from "@/components/form/FormLayout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import type { DocField, MetaBundle } from "@/lib/types"
import { cn } from "@/lib/utils"
import type { Block, Design } from "./types"
import { Card, LinkChips, Meter, ScanBox, StatCards } from "./widgets"

interface Props {
  design: Design
  bundle: MetaBundle
  rt: FormRuntime
  view: View
  roles: string[]
  canWrite: boolean
  errors: Set<string>
}

function claimedFields(design: Design) {
  const out = new Set<string>()
  const walk = (b: Block) => {
    if (b.type === "fields" || b.type === "links") b.fields.forEach((f) => out.add(f))
    else if (b.type === "table") {
      out.add(b.table)
    } else if (b.type === "split") {
      walk(b.left)
      walk(b.right)
    }
  }
  design.blocks.forEach(walk)
  design.stats?.forEach((s) => s.field && out.add(s.field))
  if (design.scan) out.add(design.scan.field)
  return out
}

const gridCols = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" } as const

/** Renders a Design spec: scan box and KPI cards on top, purpose-built blocks, then everything else collapsed. */
export function DesignedForm({ design, bundle, rt, view, roles, canWrite, errors }: Props) {
  const doc = view.doc
  const fieldMap = useMemo(() => new Map(bundle.meta.fields.map((f) => [f.fieldname, f])), [bundle])
  const claimed = useMemo(() => claimedFields(design), [design])
  const [moreOpen, setMoreOpen] = useState(false)
  const editable = canWrite && !view.readOnlyAll
  const docstatus = doc.docstatus ?? 0

  const hasRemaining = !design.minimal && bundle.meta.fields.some(
    (f) => !claimed.has(f.fieldname) && (INPUT_TYPES.includes(f.fieldtype) || f.fieldtype === "Table") && isVisible(f, view, roles),
  )

  const scan = (code: string) => {
    if (!design.scan) return
    if (rt.doc[design.scan.field] === code) rt.uiSetValue(null, null, design.scan.field, "") // same bale twice in a row must still fire a change
    rt.uiSetValue(null, null, design.scan.field, code)
  }

  const renderBlock = (b: Block, key: string): React.ReactNode => {
    switch (b.type) {
      case "fields": {
        const dfs = b.fields.map((n) => fieldMap.get(n)).filter((f): f is DocField => Boolean(f) && isVisible(f!, view, roles)).map((f) => (design.labels?.[f.fieldname] ? { ...f, label: design.labels[f.fieldname] } : f))
        if (!dfs.length) return null
        return (
          <Card key={key} title={b.title}>
            <div className={cn("grid grid-cols-1 gap-x-4 gap-y-3 p-4 sm:grid-cols-2", gridCols[b.columns ?? 3])}>
              {dfs.map((df) => (
                <FieldRow key={df.fieldname} sectionLabel={null} df={df} bundle={bundle} rt={rt} view={view} roles={roles} canWrite={canWrite} invalid={errors.has(df.fieldname)} />
              ))}
            </div>
          </Card>
        )
      }
      case "table": {
        const df = fieldMap.get(b.table)
        if (!df || !isVisible(df, view, roles)) return null
        const child = df.options ? bundle.children[df.options] : undefined
        if (!child) return null
        const eff = effectiveDf(view.overrides, df)
        const ro = isReadOnlyField(eff, doc, editable, rt.isNew, roles) && !(docstatus === 1 && eff.allow_on_submit)
        const rows = (doc[b.table] ?? []).length
        return (
          <Card
            key={key}
            title={b.title ?? eff.label ?? b.table}
            description={b.description}
            className={cn(errors.has(b.table) && "border-destructive")}
            actions={
              <>
                <Badge tone="muted">{rows} {rows === 1 ? "row" : "rows"}</Badge>
                {!ro && <Button variant="outline" size="sm" onClick={() => void rt.uiAddRow(b.table)}><Plus /> Add row</Button>}
              </>
            }
          >
            <ChildTable bare hideAdd labels={design.labels} df={eff} meta={child} rt={rt} view={view} roles={roles} readOnly={ro} columns={b.columns} totals={b.totals} />
          </Card>
        )
      }
      case "split":
        return (
          <div key={key} className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {renderBlock(b.left, `${key}-l`)}
            {renderBlock(b.right, `${key}-r`)}
          </div>
        )
      case "meter":
        return <Meter key={key} title={b.title} ratio={b.ratio(doc)} caption={b.caption(doc)} invert={b.invert} />
      case "links": {
        const items = b.fields
          .map((n) => fieldMap.get(n))
          .filter((f): f is DocField => Boolean(f) && f!.fieldtype === "Link" && Boolean(doc[f!.fieldname]))
          .map((f) => ({ label: f.label ?? f.fieldname, doctype: f.options!, name: String(doc[f.fieldname]) }))
        return items.length ? <LinkChips key={key} items={items} /> : null
      }
    }
  }

  const showScan = design.scan && fieldMap.has(design.scan.field) && editable && docstatus === 0

  return (
    <div className="space-y-3">
      {showScan && <ScanBox spec={design.scan!} onScan={scan} />}
      {design.stats && !design.minimal && <StatCards stats={design.stats.filter((s) => !s.field || fieldMap.has(s.field))} doc={doc} />}
      {design.blocks.map((b, i) => renderBlock(b, `b${i}`))}

      {hasRemaining && (
        <section className="rounded-xl border border-dashed border-border">
          <button type="button" onClick={() => setMoreOpen(!moreOpen)} className="flex w-full cursor-pointer items-center gap-2 px-5 py-3 text-left text-sm font-medium text-muted-foreground hover:text-foreground">
            <ChevronRight className={cn("size-4 transition-transform", moreOpen && "rotate-90")} />
            More details
            <span className="text-xs font-normal">address, taxes, accounting and other standard fields</span>
          </button>
          {moreOpen && (
            <div className="border-t border-dashed border-border p-4">
              <FormLayout bundle={bundle} rt={rt} view={view} roles={roles} canWrite={canWrite} errors={errors} exclude={claimed} />
            </div>
          )}
        </section>
      )}
    </div>
  )
}
