import $ from "jquery"
import { call } from "@/lib/api"
import { defaultFor, findMissing, itemDefaults, mergeServerDoc } from "@/lib/doc"
import type { Boot, DocField, MetaBundle, MetaDict, PortalDoctype, Row } from "@/lib/types"
import { msgprint } from "./ui"
import { uid } from "./store"

/** Thrown by `frappe.throw`; aborts the current script handler / save. */
export class FrappeThrow extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FrappeThrow"
  }
}
export const isFrappeThrow = (e: unknown): e is FrappeThrow => e instanceof FrappeThrow

export interface Host {
  boot: Boot
  routeFor(doctype: string): string | undefined
  navigate(path: string, opts?: { replace?: boolean }): void
  reload(): void
}

export interface CustomButton {
  id: number
  label: string
  group?: string
  fn: (...args: any[]) => any
  el: JQuery
}

export interface View {
  doc: Row
  dirty: boolean
  buttons: CustomButton[]
  intro: { message: string; color?: string }[]
  overrides: Map<string, Partial<DocField>>
  readOnlyAll: boolean
  /** Counts edits made through form controls (used to clear validation highlights) */
  uiEdits: number
  version: number
}

export type SaveAction = "Save" | "Submit" | "Cancel" | "Update"

const cloneDoc = (doc: Row): Row => {
  const out: Row = { ...doc }
  for (const [k, v] of Object.entries(doc)) if (Array.isArray(v)) out[k] = v.map((r) => (r && typeof r === "object" ? { ...r } : r))
  return out
}

const deepClone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
const slug = (doctype: string) => doctype.toLowerCase().replace(/[^a-z0-9]+/g, "-")
export const newName = (doctype: string) => `new-${slug(doctype)}-${uid()}`
export const isNewName = (name?: string | null) => !name || String(name).startsWith("new-")

const key = (table: string | null | undefined, field: string) => `${table ?? ""}:${field}`

/** `df` with script overrides (set_df_property, toggle_display...) applied; used by views and the runtime. */
export function effectiveDf(overrides: Map<string, Partial<DocField>>, df: DocField, table?: string | null): DocField {
  const o = overrides.get(key(table, df.fieldname))
  return o ? { ...df, ...o } : df
}

/**
 * Holds the state of one open form. It is the single source of truth for the document: React renders
 * from `getView()`, and Desk client scripts (run by `frappe.ts`) mutate `doc` through the same methods the
 * UI uses, so both stay consistent.
 */
export class FormRuntime {
  readonly doctype: string
  readonly cfg: PortalDoctype
  readonly bundle: MetaBundle
  readonly host: Host
  readonly doc: Row = {}
  isNew = false
  dirty = false
  validated = true
  readOnlyAll = false
  buttons: CustomButton[] = []
  intro: { message: string; color?: string }[] = []
  /** Set by frappe.ts: the `frm` object handed to scripts. */
  frm: any = null

  private overrides = new Map<string, Partial<DocField>>()
  private queries = new Map<string, (...a: any[]) => any>()
  private handlers: Record<string, Record<string, Function[]>> = {}
  private fetches: { link: string; source: string; target: string; table: string | null }[] = []
  /** Per-table defaults for new rows (design `rowDefaults`), re-applied after an item is picked */
  rowDefaults: Record<string, Row> = {}
  /** Per-table computed fields, e.g. total_weight = qty × weight_per_unit */
  rowFormulas: Record<string, Record<string, (row: Row) => number>> = {}
  private listeners = new Set<() => void>()
  private view!: View
  private pending = false
  private edits = 0
  private uiEdits = 0
  private versionCounter = 0
  private buttonId = 0
  private recalcTimer: ReturnType<typeof setTimeout> | undefined
  private disposed = false

  constructor(bundle: MetaBundle, initial: Row, host: Host) {
    this.bundle = bundle
    this.cfg = bundle.config
    this.doctype = bundle.config.doctype
    this.host = host
    this.loadDoc(initial)
    this.dirty = this.isNew
    this.rebuildView()
  }

  /** React StrictMode mounts, unmounts and remounts effects; a disposed runtime comes back to life */
  revive() {
    this.disposed = false
  }

  dispose() {
    this.disposed = true
    clearTimeout(this.recalcTimer)
    this.listeners.clear()
  }

  // ------------------------------------------------------------------ view / subscription

  subscribe = (f: () => void) => {
    this.listeners.add(f)
    return () => { this.listeners.delete(f) }
  }
  getView = () => this.view

  private rebuildView() {
    this.view = {
      doc: cloneDoc(this.doc),
      dirty: this.dirty,
      buttons: [...this.buttons],
      intro: [...this.intro],
      overrides: new Map(this.overrides),
      readOnlyAll: this.readOnlyAll,
      uiEdits: this.uiEdits,
      version: ++this.versionCounter,
    }
  }

  /** Publishes the current state to React. UI edits flush synchronously; script edits are batched. */
  touch(sync = false) {
    if (this.disposed) return
    if (sync) {
      this.pending = false
      this.rebuildView()
      this.listeners.forEach((f) => f())
    } else if (!this.pending) {
      this.pending = true
      queueMicrotask(() => {
        if (!this.pending) return
        this.pending = false
        this.rebuildView()
        this.listeners.forEach((f) => f())
      })
    }
  }

  // ------------------------------------------------------------------ meta helpers

  private tableFields() {
    return this.bundle.meta.fields.filter((f) => f.fieldtype === "Table" && f.options)
  }
  tableForChild(childDoctype: string) {
    return this.tableFields().find((f) => f.options === childDoctype)?.fieldname
  }
  childMeta(table: string): MetaDict | undefined {
    const tdf = this.bundle.meta.fields.find((f) => f.fieldname === table)
    return tdf?.options ? this.bundle.children[tdf.options] : undefined
  }
  metaFor(cdt: string): MetaDict | undefined {
    return cdt === this.doctype ? this.bundle.meta : this.bundle.children[cdt]
  }
  fieldDef(cdt: string, field: string) {
    return this.metaFor(cdt)?.fields.find((f) => f.fieldname === field)
  }

  /** The field definition with script overrides (set_df_property, toggle_display...) applied. */
  effective(df: DocField, table?: string | null): DocField {
    return effectiveDf(this.overrides, df, table)
  }

  setDfProperty(field: string, prop: string, value: any, table?: string | null) {
    const k = key(table, field)
    this.overrides.set(k, { ...this.overrides.get(k), [prop]: value })
    this.touch()
  }

  // ------------------------------------------------------------------ document access

  loadDoc(src: Row) {
    for (const k of Object.keys(this.doc)) delete this.doc[k]
    Object.assign(this.doc, deepClone(src))
    delete this.doc.__onload
    delete this.doc.__unsaved
    for (const tdf of this.tableFields()) {
      const rows: Row[] = (this.doc[tdf.fieldname] ??= [])
      rows.forEach((row, i) => {
        row.doctype ??= tdf.options
        row.parentfield ??= tdf.fieldname
        row.parenttype ??= this.doctype
        row.idx ??= i + 1
        if (!row.name) { row.name = newName(tdf.options!); row.__islocal = 1 }
      })
    }
    this.isNew = isNewName(this.doc.name) || Boolean(this.doc.__islocal)
    if (isNewName(this.doc.name)) {
      this.doc.name ??= newName(this.doctype)
      this.doc.__islocal = 1
    }
    this.doc.docstatus ??= 0
  }

  getRow(cdt: string, cdn?: string): Row | undefined {
    if (cdt === this.doctype && (!cdn || cdn === this.doc.name)) return this.doc
    const table = this.tableForChild(cdt)
    return table ? (this.doc[table] as Row[] | undefined)?.find((r) => r.name === cdn) : undefined
  }

  rowIndex(table: string, rowName: string) {
    return ((this.doc[table] as Row[]) ?? []).findIndex((r) => r.name === rowName)
  }

  /** Merges a document returned by the server (run_doc_method) into the open form. */
  syncDocs(docs: Row[] | undefined) {
    const incoming = docs?.find((d) => d.doctype === this.doctype)
    if (!incoming) return
    const merged = this.isNew ? { ...incoming, name: this.doc.name, __islocal: 1 } : incoming
    for (const [k, v] of Object.entries(deepClone(merged))) {
      if (k === "__onload" || k === "__unsaved") continue
      this.doc[k] = v
    }
    this.loadDoc({ ...this.doc })
    this.touch()
  }

  coerce(df: DocField | undefined, value: any) {
    if (!df) return value
    switch (df.fieldtype) {
      case "Int": {
        if (value === "" || value == null) return null
        const n = Math.trunc(Number(value))
        return Number.isFinite(n) ? n : null
      }
      case "Float": case "Currency": case "Percent": {
        if (value === "" || value == null) return null
        const n = Number(typeof value === "string" ? value.replace(/,/g, "") : value)
        return Number.isFinite(n) ? n : null
      }
      case "Check": return value ? 1 : 0
      default: return value
    }
  }

  // ------------------------------------------------------------------ mutations

  /** Marks an edit: invalidates in-flight recalculations and (for ERPNext transactions) queues a new one. */
  private markEdit() {
    this.edits++
    this.dirty = true
    if (this.cfg.recalculate) this.scheduleRecalc()
  }

  /** Programmatic set (scripts and built-in fetches). Fires field-change handlers, like Desk. */
  async setValue(cdt: string, cdn: string | undefined, field: string, value: any) {
    const target = this.getRow(cdt, cdn)
    if (!target) return
    const df = this.fieldDef(cdt, field)
    const next = this.coerce(df, value)
    if (target[field] === next || (target[field] == null && next == null)) return
    target[field] = next
    this.markEdit()
    this.touch()
    await this.afterChange(cdt, target.name, field, next, df)
  }

  /** Edit coming from a form control: re-render immediately, then run the async side effects. */
  uiSetValue(table: string | null, rowName: string | null, field: string, value: any) {
    const cdt = table ? this.childMeta(table)!.name : this.doctype
    const target = table ? this.getRow(cdt, rowName!) : this.doc
    if (!target) return
    const df = this.fieldDef(cdt, field)
    const next = this.coerce(df, value)
    target[field] = next
    this.uiEdits++
    this.markEdit()
    this.touch(true)
    void this.afterChange(cdt, target.name, field, next, df)
  }

  addChild(table: string, values: Row = {}): Row {
    const tdf = this.bundle.meta.fields.find((f) => f.fieldname === table)
    const child = this.childMeta(table)
    if (!tdf || !child) throw new Error(`Unknown table ${table}`)
    const rows: Row[] = (this.doc[table] ??= [])
    const row: Row = { doctype: tdf.options, name: newName(tdf.options!), parent: this.doc.name, parentfield: table, parenttype: this.doctype, idx: rows.length + 1, docstatus: 0, __islocal: 1 }
    for (const f of child.fields) {
      const d = defaultFor(f)
      if (d !== undefined) row[f.fieldname] = d
    }
    Object.assign(row, this.rowDefaults[table] ?? {}, values)
    rows.push(row)
    this.markEdit()
    this.touch()
    return row
  }

  clearTable(table: string) {
    this.doc[table] = []
    this.markEdit()
    this.touch()
  }

  async uiAddRow(table: string) {
    this.uiEdits++
    const row = this.addChild(table)
    this.touch(true)
    await this.trigger(`${table}_add`, row.doctype, row.name)
  }

  async uiRemoveRow(table: string, rowName: string) {
    const rows: Row[] = this.doc[table] ?? []
    const row = rows.find((r) => r.name === rowName)
    if (!row) return
    this.uiEdits++
    await this.trigger(`before_${table}_remove`, row.doctype, row.name)
    this.doc[table] = rows.filter((r) => r !== row).map((r, i) => ({ ...r, idx: i + 1 }))
    this.markEdit()
    this.touch(true)
    await this.trigger(`${table}_remove`, row.doctype, row.name)
  }

  // ------------------------------------------------------------------ script plumbing

  on(doctype: string, event: string, fn: Function) {
    ;((this.handlers[doctype] ??= {})[event] ??= []).push(fn)
  }

  async trigger(event: string, cdt?: string, cdn?: string, strict = false) {
    cdt ??= this.doctype
    cdn ??= this.doc.name
    if (event === "refresh") {
      this.buttons = []
      this.intro = []
    }
    for (const fn of [...(this.handlers[cdt]?.[event] ?? [])]) {
      try {
        const r = fn.call(this.frm, this.frm, cdt, cdn)
        if (r && typeof r.then === "function") await r
      } catch (e) {
        if (strict && isFrappeThrow(e)) throw e
        if (!isFrappeThrow(e)) console.error(`[portal] ${cdt} "${event}" handler failed`, e)
      }
    }
    this.touch()
  }

  setQuery(table: string | null, field: string, fn: (...a: any[]) => any) {
    this.queries.set(key(table, field), fn)
  }

  /** Link filters from `frm.set_query`, evaluated lazily when a link dropdown opens. */
  getQuery(table: string | null, field: string, rowName?: string): { filters?: unknown; query?: string } | undefined {
    const fn = this.queries.get(key(table, field))
    if (!fn) return undefined
    try {
      const cdt = table ? this.childMeta(table)?.name ?? this.doctype : this.doctype
      const result = fn.call(this.frm, this.doc, cdt, rowName ?? this.doc.name)
      return result && typeof result === "object" ? { filters: result.filters, query: result.query } : undefined
    } catch (e) {
      console.error(`[portal] set_query for ${field} failed`, e)
      return undefined
    }
  }

  addFetch(link: string, source: string, target: string, table: string | null = null) {
    this.fetches.push({ link, source, target, table })
  }

  /** Applies a design's row behaviour: defaults, formulas and fetch-on-select rules */
  configure(opts: { rowDefaults?: Record<string, Row>; rowFormulas?: Record<string, Record<string, (row: Row) => number>>; rowFetch?: { table: string; link: string; source: string; target: string }[] }) {
    this.rowDefaults = opts.rowDefaults ?? {}
    this.rowFormulas = opts.rowFormulas ?? {}
    for (const f of opts.rowFetch ?? []) this.addFetch(f.link, f.source, f.target, f.table)
  }

  addButton(label: string, fn: (...a: any[]) => any, group?: string): JQuery {
    const el = $("<button>")
    const existing = this.buttons.findIndex((b) => b.label === label && b.group === group)
    const button: CustomButton = { id: ++this.buttonId, label, group, fn, el }
    if (existing >= 0) this.buttons[existing] = button
    else this.buttons.push(button)
    this.touch()
    return el
  }

  async clickButton(button: CustomButton) {
    try {
      const r = button.fn.call(this.frm, this.frm)
      if (r && typeof r.then === "function") await r
    } catch (e) {
      if (!isFrappeThrow(e)) {
        console.error("[portal] custom button failed", e)
        msgprint({ title: "Error", indicator: "red", message: (e as Error).message })
      }
    }
  }

  setIntro(message: string, color?: string) {
    this.intro.push({ message, color })
    this.touch()
  }

  // ------------------------------------------------------------------ built-in field behaviour

  private async afterChange(cdt: string, cdn: string, field: string, value: any, df: DocField | undefined) {
    try {
      await this.builtins(cdt, cdn, field, value, df)
    } catch (e) {
      msgprint({ title: "Error", indicator: "red", message: (e as Error).message })
    }
    await this.applyFormulas(cdt, cdn)
    await this.trigger(field, cdt, cdn)
  }

  private async applyFormulas(cdt: string, cdn: string) {
    const table = cdt === this.doctype ? null : this.tableForChild(cdt)
    const formulas = table ? this.rowFormulas[table] : undefined
    const row = formulas && this.getRow(cdt, cdn)
    if (!formulas || !row) return
    for (const [field, fn] of Object.entries(formulas)) await this.setValue(cdt, cdn, field, fn(row))
  }

  private async builtins(cdt: string, cdn: string, field: string, value: any, df: DocField | undefined) {
    const meta = this.metaFor(cdt)
    if (!meta) return

    // fetch_from: "<link field>.<field on the linked doctype>"
    if (df?.fieldtype === "Link" && df.options) {
      const deps = meta.fields.filter((f) => f.fetch_from?.startsWith(`${field}.`))
      const owner = cdt === this.doctype ? null : this.tableForChild(cdt) ?? null
      const legacy = this.fetches.filter((f) => f.link === field && f.table === owner)
      if (deps.length || legacy.length) {
        const sources = [...deps.map((f) => f.fetch_from!.split(".")[1]), ...legacy.map((f) => f.source)]
        const got = value ? await call<Row>("frappe.client.get_value", { doctype: df.options, fieldname: JSON.stringify([...new Set(sources)]), filters: value }) : {}
        for (const f of deps) await this.setValue(cdt, cdn, f.fieldname, got?.[f.fetch_from!.split(".")[1]] ?? null)
        for (const f of legacy) await this.setValue(cdt, cdn, f.target, got?.[f.source] ?? null)
      }
    }

    // new item on a transaction row: rate, uom, accounts... from ERPNext
    const table = cdt === this.doctype ? null : this.tableForChild(cdt)
    if (table && table === this.cfg.item_table && field === "item_code" && value) {
      const row = this.getRow(cdt, cdn)
      const details = await call<Row>("get_item_details", { doctype: this.doctype, item_code: value, doc: this.doc, qty: row?.qty || 1 })
      const defaults = itemDefaults(details, this.childMeta(table)!.fields)
      for (const [k, v] of Object.entries({ ...defaults, ...(this.rowDefaults[table] ?? {}) })) await this.setValue(cdt, cdn, k, v)
    }

    // choosing a tax template loads its rows
    const taxes = this.cfg.taxes
    if (!table && taxes && field === taxes.template_field) {
      const rows = value ? await call<Row[]>("erpnext.controllers.accounts_controller.get_taxes_and_charges", { master_doctype: taxes.template_doctype, master_name: value }) : []
      const drop = ["name", "parent", "parenttype", "parentfield", "creation", "modified", "owner", "modified_by", "docstatus", "idx"]
      this.doc[taxes.table] = []
      for (const r of rows) this.addChild(taxes.table, Object.fromEntries(Object.entries(r).filter(([k]) => !drop.includes(k))))
      this.touch()
    }
  }

  // ------------------------------------------------------------------ server recalculation (ERPNext transactions)

  scheduleRecalc() {
    clearTimeout(this.recalcTimer)
    this.recalcTimer = setTimeout(() => void this.recalculate(), 600)
  }

  private async recalculate() {
    const itemTable = this.cfg.item_table
    if (this.disposed || !this.cfg.recalculate || !itemTable || !(this.doc[itemTable] ?? []).some((r: Row) => r.item_code)) return
    const sent = this.edits
    try {
      const server = await call<Row>("recalculate", { doc: this.doc })
      if (this.edits !== sent || this.disposed) return // user kept editing; a newer recalculation is queued
      const merged = mergeServerDoc(this.doc, server)
      for (const [k, v] of Object.entries(merged)) this.doc[k] = v
      this.touch()
    } catch (e) {
      msgprint({ title: "Couldn’t recalculate", indicator: "orange", message: (e as Error).message })
    }
  }

  // ------------------------------------------------------------------ lifecycle & saving

  async start(initialValues?: Row) {
    await this.trigger("setup")
    await this.trigger("before_load")
    await this.trigger("onload")
    await this.trigger("refresh")
    if (initialValues) for (const [k, v] of Object.entries(initialValues)) await this.setValue(this.doctype, this.doc.name, k, v)
    await this.trigger("onload_post_render")
  }

  private payload(): Row {
    const doc = deepClone(this.doc)
    delete doc.__onload
    delete doc.__unsaved
    return doc
  }

  /** Mandatory-field check, shared with the UI to highlight what is missing. */
  missing() {
    const childFields = Object.fromEntries(Object.entries(this.bundle.children).map(([k, v]) => [k, v.fields]))
    const roles = this.host.boot.roles
    const fields = this.bundle.meta.fields.map((f) => this.effective(f))
    return findMissing(fields, this.doc, roles, childFields)
  }

  /** Save / Update / Submit / Cancel, running validate and submit hooks like Desk's `frm.save`. */
  async save(action: SaveAction = "Save"): Promise<{ ok: boolean; missing?: string[] }> {
    try {
      if (action === "Cancel") {
        this.validated = true
        await this.trigger("before_cancel", undefined, undefined, true)
        if (!this.validated) return { ok: false }
        const done = await call<Row>("cancel_doc", { doctype: this.doctype, name: this.doc.name })
        this.afterServer(done)
        await this.trigger("after_cancel")
        await this.trigger("refresh")
        return { ok: true }
      }

      this.validated = true
      await this.trigger("validate", undefined, undefined, true)
      await this.trigger("before_save", undefined, undefined, true)
      if (action === "Submit") await this.trigger("before_submit", undefined, undefined, true)
      if (!this.validated) return { ok: false }

      const missing = this.missing()
      if (missing.length) return { ok: false, missing: missing.map((m) => m.fieldname) }

      let saved: Row | null = null
      if (this.dirty || this.isNew) {
        saved = await call<Row>("save_doc", { doc: this.payload() })
        this.afterServer(saved)
        await this.trigger("after_save")
      }
      if (action === "Submit") {
        const done = await call<Row>("submit_doc", { doctype: this.doctype, name: (saved ?? this.doc).name })
        this.afterServer(done)
        await this.trigger("on_submit")
      }
      await this.trigger("refresh")
      return { ok: true }
    } catch (e) {
      if (!isFrappeThrow(e)) msgprint({ title: "Error", indicator: "red", message: (e as Error).message })
      return { ok: false }
    }
  }

  private afterServer(doc: Row) {
    this.loadDoc(doc)
    this.dirty = false
    this.edits++
    this.touch(true)
  }

  async remove() {
    try {
      await call("delete_doc", { doctype: this.doctype, name: this.doc.name })
      return true
    } catch (e) {
      msgprint({ title: "Error", indicator: "red", message: (e as Error).message })
      return false
    }
  }
}
