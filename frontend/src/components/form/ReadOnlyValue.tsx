import { Check, Minus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { formatDate, formatDateTime, formatNumber, toneFor } from "@/lib/format"
import type { DocField } from "@/lib/types"
import { cn } from "@/lib/utils"
import { NUMERIC } from "./FieldInput"

/** Plain-text rendering of a value, used for read-only table cells so ledgers read cleanly. */
export function ReadOnlyValue({ df, value }: { df: DocField; value: any }) {
  const empty = value === null || value === undefined || value === ""
  if (df.fieldtype === "Check") return value ? <Check className="mx-auto size-4 text-success" /> : <Minus className="mx-auto size-4 text-muted-foreground/40" />
  if (empty) return <span className="text-muted-foreground/60">—</span>

  if (df.fieldtype === "Select" && /status/.test(df.fieldname)) return <Badge tone={toneFor(String(value))}>{value}</Badge>
  if (df.fieldtype === "Currency") return <span className="tabular-nums">{formatNumber(value, 2)}</span>
  if (df.fieldtype === "Int") return <span className="tabular-nums">{formatNumber(value, 0)}</span>
  if (NUMERIC.includes(df.fieldtype)) return <span className="tabular-nums">{formatNumber(value)}</span>
  if (df.fieldtype === "Date") return <>{formatDate(value)}</>
  if (df.fieldtype === "Datetime") return <>{formatDateTime(value)}</>
  const text = String(value)
  return <span className={cn("block max-w-64 truncate", df.fieldtype === "Link" && "font-medium")} title={text}>{text}</span>
}
