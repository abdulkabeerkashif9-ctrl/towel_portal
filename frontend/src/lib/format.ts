export function formatCurrency(value: number | null | undefined, currency: string) {
  if (value == null || value === ("" as unknown)) return "—"
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value))
  } catch {
    return `${currency} ${Number(value).toFixed(2)}`
  }
}

export function formatNumber(value: number | null | undefined, precision?: number) {
  if (value == null) return "—"
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: precision ?? 2,
    minimumFractionDigits: precision ?? 0,
  }).format(Number(value))
}

export function formatDate(value?: string | null) {
  if (!value) return "—"
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value.replace(" ", "T"))
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—"
  const d = new Date(value.replace(" ", "T"))
  if (isNaN(d.getTime())) return value
  return d.toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

export const DOCSTATUS_LABEL = ["Draft", "Submitted", "Cancelled"]

export function toneFor(status: string): "success" | "warning" | "danger" | "info" | "muted" {
  const s = status.toLowerCase()
  if (/(^paid|completed|submitted|received|billed)/.test(s)) return s.includes("part") ? "warning" : "success"
  if (/(overdue|cancel|rejected|return|debit note)/.test(s)) return "danger"
  if (/(unpaid|partly|to bill|to deliver|pending|due)/.test(s)) return "warning"
  if (/(draft|closed)/.test(s)) return "muted"
  return "info"
}
