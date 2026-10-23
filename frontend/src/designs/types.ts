import type { Row } from "@/lib/types"

export type Format = "int" | "float" | "currency" | "text"
export type Tone = "default" | "success" | "warning" | "danger" | "info"

export interface Stat {
  label: string
  /** Read straight from a document field... */
  field?: string
  /** ...or computed from the whole document */
  value?: (doc: Row) => number | string | null
  format?: Format
  tone?: Tone
  hint?: string
}

export interface ScanSpec {
  /** Data field the existing Client Script listens to (it receives the scanned code as a value change) */
  field: string
  label?: string
  placeholder?: string
}

export type Block =
  | { type: "fields"; title?: string; fields: string[]; columns?: 1 | 2 | 3 | 4 }
  | { type: "table"; title?: string; description?: string; table: string; columns?: string[]; totals?: string[] }
  | { type: "split"; left: Block; right: Block }
  | { type: "meter"; title: string; ratio: (doc: Row) => number | null; caption: (doc: Row) => string; invert?: boolean }
  | { type: "links"; title?: string; fields: string[] }

/**
 * A purpose-built layout for one doctype. Fields the design doesn't mention are not lost: they stay
 * available under "More details", rendered by the generic Frappe layout.
 */
export interface Design {
  doctype: string
  subtitle?: (doc: Row) => string | null
  scan?: ScanSpec
  stats?: Stat[]
  blocks: Block[]
}
