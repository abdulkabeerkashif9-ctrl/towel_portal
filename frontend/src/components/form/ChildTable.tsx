import { Plus, Trash2 } from "lucide-react"
import { effectiveDf, type FormRuntime, type View } from "@/compat/runtime"
import { evalExpr } from "@/lib/expr"
import { formatNumber } from "@/lib/format"
import type { DocField, MetaDict, Row } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FieldInput, NUMERIC } from "./FieldInput"
import { ReadOnlyValue } from "./ReadOnlyValue"

interface Props {
  df: DocField
  meta: MetaDict
  rt: FormRuntime
  view: View
  roles: string[]
  readOnly: boolean
  /** Column order override (designed forms); defaults to the doctype's list-view columns */
  columns?: string[]
  /** Numeric columns summed in a footer row */
  totals?: string[]
  /** Drop the outer border when the table sits inside a card */
  bare?: boolean
  /** Hide the footer "Add row" button when the surrounding card already has one */
  hideAdd?: boolean
  /** Heading overrides by fieldname */
  labels?: Record<string, string>
}

/** Narrow, content-sized columns so wide ledgers fit without sideways scrolling where possible */
function minWidth(c: DocField) {
  if (c.fieldtype === "Check") return 56
  if (c.fieldtype === "Button") return 96
  if (c.fieldtype === "Int") return 64
  if (NUMERIC.includes(c.fieldtype)) return 84
  if (c.fieldtype === "Date") return 112
  if (c.fieldtype === "Select") return 96
  return Math.max(c.columns || 2, 2) * 46
}

export function ChildTable({ df, meta, rt, view, roles, readOnly, columns, totals, bare, hideAdd, labels }: Props) {
  const table = df.fieldname
  const doc = view.doc
  const rows: Row[] = doc[table] ?? []

  let base: DocField[]
  if (columns) base = columns.map((n) => meta.fields.find((f) => f.fieldname === n)).filter((f): f is DocField => Boolean(f))
  else {
    const listed = meta.fields.filter((f) => f.in_list_view)
    base = listed.length ? listed : meta.fields.filter((f) => !f.hidden && !["Section Break", "Column Break", "Tab Break", "Table"].includes(f.fieldtype)).slice(0, 5)
  }
  const cols = base.map((c) => effectiveDf(view.overrides, c, table)).filter((c) => !c.hidden)
  const sums = (totals ?? []).filter((n) => cols.some((c) => c.fieldname === n))

  return (
    <div className={cn(!bare && "rounded-lg border border-border")}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="w-10 px-2 py-2 text-center text-[11px] font-medium text-muted-foreground">#</th>
              {cols.map((c) => (
                <th key={c.fieldname} style={{ minWidth: minWidth(c) }} className={cn("px-2 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground", NUMERIC.includes(c.fieldtype) && "text-right")}>
                  {c.fieldtype === "Button" ? "" : (labels?.[c.fieldname] ?? c.label ?? "").replace(/<[^>]*>/g, "")}{c.reqd && !readOnly ? <span className="text-destructive"> *</span> : null}
                </th>
              ))}
              {!readOnly && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={cols.length + 2} className="px-4 py-8 text-center text-sm text-muted-foreground">No rows</td></tr>
            )}
            {rows.map((row, i) => (
              <tr key={row.name ?? `new-${i}`} className="border-b border-border last:border-0 hover:bg-accent/30">
                <td className="px-2 py-1 text-center text-xs text-muted-foreground">{i + 1}</td>
                {cols.map((c) => {
                  const ctx = { doc: row, parent: doc, roles }
                  const ro = readOnly || Boolean(c.read_only) || evalExpr(c.read_only_depends_on, ctx, false)
                  const numeric = NUMERIC.includes(c.fieldtype)
                  return (
                    <td key={c.fieldname} className={cn("px-1 py-1", ro && c.fieldtype !== "Button" && "px-2.5", numeric && ro && "text-right", c.fieldtype === "Check" && "text-center")}>
                      {c.fieldtype === "Button" ? (
                        <FieldInput compact df={c} value={null} doc={row} onChange={() => {}} onAction={() => void rt.trigger(c.fieldname, row.doctype, row.name)} />
                      ) : ro ? (
                        <ReadOnlyValue df={c} value={row[c.fieldname]} />
                      ) : (
                        <FieldInput compact df={c} value={row[c.fieldname]} doc={row} getQuery={() => rt.getQuery(table, c.fieldname, row.name)} onChange={(v) => rt.uiSetValue(table, row.name, c.fieldname, v)} />
                      )}
                    </td>
                  )
                })}
                {!readOnly && (
                  <td className="px-1 text-center">
                    <button type="button" aria-label="Remove row" className="cursor-pointer rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive" onClick={() => void rt.uiRemoveRow(table, row.name)}><Trash2 className="size-3.5" /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {sums.length > 0 && rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-border bg-muted/40 font-semibold">
                <td className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground" colSpan={1}>Σ</td>
                {cols.map((c) => (
                  <td key={c.fieldname} className={cn("px-2.5 py-2", NUMERIC.includes(c.fieldtype) && "text-right tabular-nums")}>
                    {sums.includes(c.fieldname) ? formatNumber(rows.reduce((a, r) => a + (Number(r[c.fieldname]) || 0), 0), c.fieldtype === "Int" ? 0 : 2) : ""}
                  </td>
                ))}
                {!readOnly && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {!readOnly && !hideAdd && (
        <div className="border-t border-border p-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => void rt.uiAddRow(table)}><Plus /> Add row</Button>
        </div>
      )}
    </div>
  )
}
