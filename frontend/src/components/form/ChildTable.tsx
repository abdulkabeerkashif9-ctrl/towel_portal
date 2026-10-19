import { Plus, Trash2 } from "lucide-react"
import { evalExpr } from "@/lib/expr"
import type { DocField, MetaDict, Row } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FieldInput, NUMERIC } from "./FieldInput"

interface Props {
  df: DocField
  meta: MetaDict
  doc: Row
  roles: string[]
  readOnly: boolean
  onCell: (rowIndex: number, fieldname: string, value: any) => void
  onAdd: () => void
  onRemove: (rowIndex: number) => void
}

export function ChildTable({ df, meta, doc, roles, readOnly, onCell, onAdd, onRemove }: Props) {
  const rows: Row[] = doc[df.fieldname] ?? []
  const columns = meta.fields.filter((f) => f.in_list_view && !f.hidden)
  const cols = columns.length ? columns : meta.fields.filter((f) => !f.hidden && f.fieldtype !== "Section Break" && f.fieldtype !== "Column Break").slice(0, 5)

  return (
    <div className="rounded-lg border border-border">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="w-10 px-2 py-2 text-center text-[11px] font-medium text-muted-foreground">#</th>
              {cols.map((c) => (
                <th key={c.fieldname} style={{ minWidth: (c.columns || 2) * 56 }} className={cn("px-2 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground", NUMERIC.includes(c.fieldtype) && "text-right")}>
                  {c.label}{c.reqd ? <span className="text-destructive"> *</span> : null}
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
              <tr key={row.name ?? `new-${i}`} className="border-b border-border last:border-0">
                <td className="px-2 py-1.5 text-center text-xs text-muted-foreground">{i + 1}</td>
                {cols.map((c) => {
                  const ctx = { doc: row, parent: doc, roles }
                  const ro = readOnly || Boolean(c.read_only) || evalExpr(c.read_only_depends_on, ctx, false)
                  return (
                    <td key={c.fieldname} className="px-1.5 py-1.5">
                      <FieldInput compact df={c} value={row[c.fieldname]} doc={row} disabled={ro} onChange={(v) => onCell(i, c.fieldname, v)} />
                    </td>
                  )
                })}
                {!readOnly && (
                  <td className="px-1 text-center">
                    <button type="button" aria-label="Remove row" className="cursor-pointer rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive" onClick={() => onRemove(i)}><Trash2 className="size-3.5" /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="border-t border-border p-2">
          <Button type="button" variant="secondary" size="sm" onClick={onAdd}><Plus /> Add row</Button>
        </div>
      )}
    </div>
  )
}
