import $ from "jquery"
import { toast } from "sonner"
import type { Row } from "@/lib/types"
import { createStore, uid } from "./store"

// ------------------------------------------------------------------ message dialogs

export interface Message { id: string; title?: string; message: string; indicator?: string }
export interface Confirm { id: string; message: string; onYes: () => void; onNo?: () => void }

export const uiStore = createStore<{ messages: Message[]; confirms: Confirm[]; dialogs: ScriptDialog[]; freeze: { count: number; message?: string } }>({
  messages: [],
  confirms: [],
  dialogs: [],
  freeze: { count: 0 },
})

export function msgprint(msg: string | { message?: string; title?: string; indicator?: string; as_list?: number; primary_action?: unknown } | string[], title?: string, indicator?: string) {
  let message = ""
  if (Array.isArray(msg)) message = `<ul>${msg.map((m) => `<li>${m}</li>`).join("")}</ul>`
  else if (typeof msg === "object" && msg) {
    title = msg.title ?? title
    indicator = msg.indicator ?? indicator
    message = Array.isArray(msg.message) ? `<ul>${(msg.message as string[]).map((m) => `<li>${m}</li>`).join("")}</ul>` : String(msg.message ?? "")
  } else message = String(msg ?? "")
  uiStore.set((s) => ({ ...s, messages: [...s.messages, { id: uid("m"), title, message, indicator }] }))
}

export function showAlert(arg: string | { message: string; indicator?: string }, seconds = 5) {
  const message = typeof arg === "string" ? arg : arg.message
  const indicator = typeof arg === "string" ? "" : arg.indicator ?? ""
  const opts = { duration: seconds * 1000 }
  if (indicator === "red") toast.error(stripTags(message), opts)
  else if (indicator === "green") toast.success(stripTags(message), opts)
  else if (indicator === "orange" || indicator === "yellow") toast.warning(stripTags(message), opts)
  else toast(stripTags(message), opts)
}

export function stripTags(html: string) {
  return String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

export function confirmDialog(message: string, onYes: () => void, onNo?: () => void) {
  uiStore.set((s) => ({ ...s, confirms: [...s.confirms, { id: uid("c"), message, onYes, onNo }] }))
}

export function freeze(message?: string) {
  uiStore.set((s) => ({ ...s, freeze: { count: s.freeze.count + 1, message: message ?? s.freeze.message } }))
}
export function unfreeze() {
  uiStore.set((s) => ({ ...s, freeze: { count: Math.max(0, s.freeze.count - 1), message: s.freeze.count <= 1 ? undefined : s.freeze.message } }))
}

/** Server `msgprint`s that arrive on successful calls (`_server_messages`). */
export function showServerMessages(raw: string) {
  try {
    for (const m of JSON.parse(raw) as string[]) {
      const msg = JSON.parse(m)
      const text = stripTags(msg.message ?? "")
      if (!text) continue
      if (msg.raise_exception || msg.indicator === "red") msgprint({ message: msg.message, title: msg.title, indicator: msg.indicator })
      else showAlert({ message: msg.message, indicator: msg.indicator }, 6)
    }
  } catch {
    /* ignore malformed messages */
  }
}

// ------------------------------------------------------------------ frappe.ui.Dialog

export interface DialogField {
  fieldname: string
  fieldtype: string
  label?: string
  options?: any
  reqd?: number | boolean
  default?: any
  read_only?: number
  hidden?: number
  description?: string
  depends_on?: string
  columns?: number
  onchange?: (this: FieldHandle) => void
  get_query?: () => any
  [key: string]: any
}

export interface FieldHandle {
  df: DialogField
  $wrapper: JQuery
  container?: HTMLElement
  get_value(): any
  set_value(v: any): Promise<void>
  set_description(d: string): void
  refresh(): void
  toggle(show: boolean): void
  set_options?: (o: any) => void
}

export interface DialogOptions {
  title?: string
  fields?: DialogField[]
  size?: string
  primary_action_label?: string
  primary_action?: (values: Row) => void
  secondary_action_label?: string
  secondary_action?: () => void
  onhide?: () => void
  static?: boolean
}

export class ScriptDialog {
  id = uid("d")
  title: string
  fields: DialogField[]
  values: Row = {}
  fields_dict: Record<string, FieldHandle> = {}
  $wrapper: JQuery = $("<div>")
  primaryLabel?: string
  primaryAction?: (values: Row) => void
  secondaryLabel?: string
  secondaryAction?: () => void
  primaryDisabled = false
  size?: string
  version = 0
  private listeners = new Set<() => void>()
  private onhide?: () => void

  constructor(opts: DialogOptions) {
    this.title = opts.title ?? ""
    this.fields = (opts.fields ?? []).map((f) => ({ ...f }))
    this.primaryLabel = opts.primary_action_label
    this.primaryAction = opts.primary_action
    this.secondaryLabel = opts.secondary_action_label
    this.secondaryAction = opts.secondary_action
    this.size = opts.size
    this.onhide = opts.onhide
    for (const f of this.fields) this.addField(f)
    // Scripts query dialog.$wrapper.find(...) inside their HTML fields, so it spans those containers
    const containers = Object.values(this.fields_dict).map((h) => h.container).filter((c): c is HTMLElement => Boolean(c))
    if (containers.length) this.$wrapper = $(containers)
  }

  private addField(df: DialogField) {
    if (df.fieldtype === "MultiCheck") {
      this.values[df.fieldname] = (df.options ?? []).filter((o: any) => o.checked).map((o: any) => o.value)
    } else if (!["Section Break", "Column Break", "HTML", "Tab Break"].includes(df.fieldtype)) {
      this.values[df.fieldname] = df.default ?? (df.fieldtype === "Check" ? 0 : undefined)
    }
    const self = this
    const container = df.fieldtype === "HTML" ? document.createElement("div") : undefined
    if (container && typeof df.options === "string") container.innerHTML = df.options
    const handle: FieldHandle = {
      df,
      container,
      $wrapper: container ? $(container) : $("<div>"),
      get_value: () => self.values[df.fieldname],
      async set_value(v: any) { await self.set_value(df.fieldname, v) },
      set_description(d: string) { df.description = d; self.bump() },
      refresh() { self.bump() },
      toggle(show: boolean) { df.hidden = show ? 0 : 1; self.bump() },
      set_options(o: any) { df.options = o; self.bump() },
    }
    this.fields_dict[df.fieldname] = handle
  }

  subscribe(f: () => void) { this.listeners.add(f); return () => { this.listeners.delete(f) } }
  bump() { this.version++; this.listeners.forEach((f) => f()) }

  show() {
    if (!uiStore.get().dialogs.includes(this)) uiStore.set((s) => ({ ...s, dialogs: [...s.dialogs, this] }))
    return this
  }
  hide() {
    if (!uiStore.get().dialogs.includes(this)) return this
    uiStore.set((s) => ({ ...s, dialogs: s.dialogs.filter((d) => d !== this) }))
    this.onhide?.()
    return this
  }
  get is_visible() { return uiStore.get().dialogs.includes(this) }

  set_title(t: string) { this.title = t; this.bump() }
  set_primary_action(label: string, fn: (values: Row) => void) { this.primaryLabel = label; this.primaryAction = fn; this.bump() }
  set_secondary_action(fn: () => void) { this.secondaryAction = fn; this.bump() }
  disable_primary_action() { this.primaryDisabled = true; this.bump() }
  enable_primary_action() { this.primaryDisabled = false; this.bump() }
  get_primary_btn() { return $("<button>") }
  get_secondary_btn() { return $("<button>") }
  clear() { for (const k of Object.keys(this.values)) this.values[k] = undefined; this.bump() }

  get_value(fieldname: string) { return this.values[fieldname] }
  get_values(ignoreErrors = false): Row | null {
    const missing = this.fields.filter((f) => f.reqd && !f.hidden && isBlank(this.values[f.fieldname]))
    if (missing.length && !ignoreErrors) {
      msgprint({ title: "Missing Fields", indicator: "red", message: `Please fill in: ${missing.map((f) => f.label ?? f.fieldname).join(", ")}` })
      return null
    }
    return { ...this.values }
  }
  async set_value(fieldname: string, value: any) {
    if (this.values[fieldname] === value) return
    this.values[fieldname] = value
    this.bump()
    this.fields_dict[fieldname]?.df.onchange?.call(this.fields_dict[fieldname])
  }
  set_values(values: Row) { for (const [k, v] of Object.entries(values)) void this.set_value(k, v) }
  set_df_property(fieldname: string, prop: string, value: any) {
    const df = this.fields_dict[fieldname]?.df
    if (df) { df[prop] = value; this.bump() }
  }
  get_field(fieldname: string) { return this.fields_dict[fieldname] }
  refresh() { this.bump() }
}

function isBlank(v: any) { return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0) }

/** frappe.prompt(fields, callback, title, primary_label) */
export function prompt(fields: DialogField | DialogField[], callback: (values: Row) => void, title?: string, primaryLabel?: string) {
  const dialog: ScriptDialog = new ScriptDialog({
    title: title ?? "Enter value",
    fields: Array.isArray(fields) ? fields : [fields],
    primary_action_label: primaryLabel ?? "Submit",
    primary_action: (values) => { dialog.hide(); callback(values) },
  })
  dialog.show()
  return dialog
}
