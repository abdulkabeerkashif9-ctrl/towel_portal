import type { DocField, Row } from "./types"
import { evalExpr } from "./expr"

const SKIP_MERGE = new Set(["name", "modified", "creation", "owner", "modified_by", "docstatus", "__islocal", "__unsaved", "__onload"])
const SKIP_ITEM = new Set(["item_code", "name", "idx", "doctype", "parent", "parentfield", "parenttype", "docstatus", "creation", "modified", "owner", "modified_by"])

/** Applies a server-recalculated document onto the local one, keeping identity fields. */
export function mergeServerDoc(local: Row, server: Row): Row {
  const next = { ...local }
  for (const [key, value] of Object.entries(server)) {
    if (SKIP_MERGE.has(key)) continue
    if (Array.isArray(value)) {
      next[key] = value.map((row: Row, i: number) => ({ ...(local[key]?.[i] ?? {}), ...row, name: local[key]?.[i]?.name ?? row.name }))
    } else next[key] = value
  }
  return next
}

/** Picks only the item defaults that the row actually has columns for. */
export function itemDefaults(details: Row, childFields: DocField[]): Row {
  const allowed = new Set(childFields.map((f) => f.fieldname))
  const out: Row = {}
  for (const [k, v] of Object.entries(details)) {
    if (SKIP_ITEM.has(k) || !allowed.has(k) || v === null || v === undefined || typeof v === "object") continue
    out[k] = v
  }
  return out
}

export function defaultFor(df: DocField): any {
  const d = df.default
  if (d == null || d === "") return df.fieldtype === "Check" ? 0 : undefined
  if (["Int", "Float", "Currency", "Percent", "Check"].includes(df.fieldtype)) return Number(d) || 0
  if (df.fieldtype === "Date" && d.toLowerCase() === "today") return new Date().toISOString().slice(0, 10)
  if (d.startsWith(":") || d.startsWith("__") || d.toLowerCase() === "today") return undefined
  return d
}

export interface Missing { fieldname: string; label: string }

/** Client-side mirror of Frappe's mandatory checks so users get feedback before the round trip. */
export function findMissing(fields: DocField[], doc: Row, roles: string[], childFields: Record<string, DocField[]>): Missing[] {
  const missing: Missing[] = []
  const blank = (v: any) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)
  for (const df of fields) {
    if (df.hidden || df.read_only) continue
    const ctx = { doc, roles }
    if (!evalExpr(df.depends_on, ctx, true)) continue
    const required = Boolean(df.reqd) || evalExpr(df.mandatory_depends_on, ctx, false)
    if (required && !["Check", "Section Break", "Column Break", "Tab Break"].includes(df.fieldtype) && blank(doc[df.fieldname])) {
      missing.push({ fieldname: df.fieldname, label: df.label || df.fieldname })
      continue
    }
    if (df.fieldtype === "Table" && df.options) {
      const cols = (childFields[df.options] ?? []).filter((c) => c.reqd && c.in_list_view && !c.hidden && !c.read_only)
      for (const row of doc[df.fieldname] ?? []) {
        for (const c of cols) if (blank(row[c.fieldname])) { missing.push({ fieldname: df.fieldname, label: `${df.label} → ${c.label}` }); break }
      }
    }
  }
  return missing
}
