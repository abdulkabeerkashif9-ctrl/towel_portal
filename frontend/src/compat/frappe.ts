import $ from "jquery"
import { callRaw } from "@/lib/api"
import type { Row } from "@/lib/types"
import { FormRuntime, FrappeThrow, newName } from "./runtime"
import { uid } from "./store"
import { ScriptDialog, confirmDialog, freeze, msgprint, prompt, showAlert, stripTags, unfreeze } from "./ui"

// Dialogs and other scripts expect jQuery on window (Desk loads it globally)
;(window as any).$ ??= $
;(window as any).jQuery ??= $

// Desk adds String.prototype.format ("{0} of {1}".format(a, b)); scripts rely on it with __()
if (!(String.prototype as any).format) {
  Object.defineProperty(String.prototype, "format", {
    value: function (this: string, ...args: unknown[]) {
      return this.replace(/\{(\d+)\}/g, (m, i) => (args[Number(i)] === undefined ? m : String(args[Number(i)])))
    },
    configurable: true,
    writable: true,
  })
}

// ------------------------------------------------------------------ pending documents & route options

/** Unsaved documents handed to the next form (frappe.model.sync + set_route, mapped docs). */
export const pendingDocs = new Map<string, Row>()
let routeOptions: { doctype: string; values: Row } | null = null

/** Values passed to `frappe.new_doc(doctype, values)`, applied to the next new form of that doctype. */
export function peekRouteOptions(doctype: string): Row | undefined {
  return routeOptions && (routeOptions.doctype === doctype || routeOptions.doctype === "*") ? routeOptions.values : undefined
}
export function clearRouteOptions() {
  routeOptions = null
}

// ------------------------------------------------------------------ small helpers scripts expect

export function flt(v: any, precision?: number): number {
  let n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, ""))
  if (!Number.isFinite(n)) n = 0
  return precision == null ? n : Number(Math.round(Number(n + "e" + precision)) + "e-" + precision)
}
export const cint = (v: any, fallback = 0) => {
  const n = parseInt(String(v), 10)
  return Number.isFinite(n) ? n : fallback
}
export const cstr = (v: any) => (v == null ? "" : String(v))
export const translate = (text: any) => String(text)

export function formatNumber(v: any, _format?: string, precision?: number) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: precision ?? 0, maximumFractionDigits: precision ?? 2 }).format(flt(v))
}

export function formatCurrency(v: any, currency = "USD") {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(flt(v)) } catch { return String(flt(v)) }
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const parseDate = (v: any) => (v instanceof Date ? v : new Date(String(v).length <= 10 ? `${v}T00:00:00` : String(v).replace(" ", "T")))

const datetime = {
  get_today: () => iso(new Date()),
  nowdate: () => iso(new Date()),
  now_date: () => iso(new Date()),
  now_time: () => new Date().toTimeString().slice(0, 8),
  now_datetime: () => `${iso(new Date())} ${new Date().toTimeString().slice(0, 8)}`,
  add_days: (d: any, n: number) => { const x = parseDate(d); x.setDate(x.getDate() + n); return iso(x) },
  add_months: (d: any, n: number) => { const x = parseDate(d); x.setMonth(x.getMonth() + n); return iso(x) },
  get_diff: (a: any, b: any) => Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86_400_000),
  str_to_obj: (v: any) => parseDate(v),
  obj_to_str: (d: Date) => iso(d),
  str_to_user: (v: any) => (v ? parseDate(v).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : ""),
}

// ------------------------------------------------------------------ lenient fallbacks

/**
 * A value that swallows any call or property access. Desk APIs the portal doesn't implement (dashboard
 * banners, page menus, ...) become harmless no-ops instead of breaking the rest of a script.
 */
function noop(path: string): any {
  const target = function () { /* callable */ }
  const proxy: any = new Proxy(target, {
    get: (_t, prop) => {
      if (prop === Symbol.toPrimitive) return () => ""
      if (prop === "then" || prop === "toJSON") return undefined
      return proxy
    },
    apply: () => proxy,
  })
  void path
  return proxy
}

function lenient<T extends object>(target: T, path: string): T {
  const warned = new Set<string>()
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (prop in t || typeof prop === "symbol") return Reflect.get(t, prop, receiver)
      if (prop === "then" || prop === "toJSON") return undefined
      if (!warned.has(String(prop))) { warned.add(String(prop)); console.debug(`[portal] ${path}.${String(prop)} is not supported; ignored`) }
      return noop(`${path}.${String(prop)}`)
    },
  })
}

// ------------------------------------------------------------------ frm facade

function createFrm(rt: FormRuntime) {
  const fieldHandles = new Map<string, any>()
  const handleFor = (field: string, table?: string | null) => {
    const k = `${table ?? ""}:${field}`
    if (!fieldHandles.has(k)) {
      const df = new Proxy(rt.fieldDef(table ? rt.childMeta(table)?.name ?? rt.doctype : rt.doctype, field) ?? { fieldname: field }, {
        set(t: any, prop, value) {
          if (prop === "get_query") rt.setQuery(table ?? null, field, value)
          else if (typeof prop === "string") rt.setDfProperty(field, prop, value, table)
          t[prop] = value
          return true
        },
      })
      fieldHandles.set(k, {
        df,
        $wrapper: $("<div>"),
        $input: $("<input>"),
        set get_query(fn: any) { rt.setQuery(table ?? null, field, fn) },
        get_value: () => rt.doc[field],
        set_value: (v: any) => rt.setValue(rt.doctype, rt.doc.name, field, v),
        refresh: () => rt.touch(),
        grid: lenient({
          refresh: () => rt.touch(),
          get_field: (f: string) => handleFor(f, field),
          update_docfield_property: (f: string, prop: string, value: any) => rt.setDfProperty(f, prop, value, field),
          get_selected_children: () => [],
          grid_rows_by_docname: undefined,
          wrapper: $("<div>"),
        }, `frm.fields_dict.${field}.grid`),
      })
    }
    return fieldHandles.get(k)
  }

  const toList = (fields: string | string[]) => (Array.isArray(fields) ? fields : String(fields).split(",").map((s) => s.trim()))

  const frm: any = {
    get doc() { return rt.doc },
    get doctype() { return rt.doctype },
    get docname() { return rt.doc.name },
    get meta() {
      return { name: rt.doctype, fields: rt.bundle.meta.fields, get_field: (f: string) => rt.fieldDef(rt.doctype, f), istable: 0, is_submittable: rt.bundle.meta.is_submittable }
    },
    get fields_dict() { return new Proxy({}, { get: (_t, f) => (typeof f === "string" ? handleFor(f) : undefined), has: () => true }) },
    get perm() { return [{ read: 1, write: rt.bundle.perms.write ? 1 : 0, create: rt.bundle.perms.create ? 1 : 0 }] },
    get_field: (f: string) => handleFor(f),
    get_docfield: (f: string, table?: string) => handleFor(f, table).df,

    is_new: () => rt.isNew,
    is_dirty: () => rt.dirty,
    dirty: () => { rt.dirty = true; rt.touch() },
    enable_save: () => {},
    disable_save: () => {},

    set_value: async (field: string | Row, value?: any) => {
      const entries = typeof field === "string" ? [[field, value] as const] : Object.entries(field)
      for (const [k, v] of entries) await rt.setValue(rt.doctype, rt.doc.name, k, v)
    },
    trigger: (event: string, cdt?: string, cdn?: string) => rt.trigger(event, cdt, cdn),
    refresh: () => rt.trigger("refresh"),
    refresh_field: () => rt.touch(),
    refresh_fields: () => rt.touch(),
    reload_doc: () => rt.host.reload(),

    add_child: (table: string, values?: Row) => rt.addChild(table, values),
    clear_table: (table: string) => rt.clearTable(table),

    set_query: (field: string, a: any, b?: any) => (typeof a === "function" ? rt.setQuery(null, field, a) : rt.setQuery(a, field, b)),
    add_fetch: (link: string, source: string, target: string) => rt.addFetch(link, source, target),

    set_df_property: (field: string, prop: string, value: any, _docname?: string, table?: string) => rt.setDfProperty(field, prop, value, table),
    toggle_display: (fields: string | string[], show = true) => toList(fields).forEach((f) => rt.setDfProperty(f, "hidden", show ? 0 : 1)),
    toggle_reqd: (fields: string | string[], reqd = true) => toList(fields).forEach((f) => rt.setDfProperty(f, "reqd", reqd ? 1 : 0)),
    toggle_enable: (fields: string | string[], enable = true) => toList(fields).forEach((f) => rt.setDfProperty(f, "read_only", enable ? 0 : 1)),
    set_read_only: () => { rt.readOnlyAll = true; rt.touch() },

    add_custom_button: (label: string, fn: (...a: any[]) => any, group?: string) => rt.addButton(String(label), fn, group ? String(group) : undefined),
    remove_custom_button: (label: string, group?: string) => { rt.buttons = rt.buttons.filter((b) => !(b.label === String(label) && b.group === (group ? String(group) : undefined))); rt.touch() },
    clear_custom_buttons: () => { rt.buttons = []; rt.touch() },
    set_intro: (message: string, color?: string) => rt.setIntro(stripTags(message), color),
    clear_intro: () => { rt.intro = []; rt.touch() },

    save: (action?: string, callback?: () => void) => rt.save((action as any) ?? "Save").then((r) => { if (r.ok) callback?.() }),
    savesubmit: () => rt.save("Submit"),
    savecancel: () => rt.save("Cancel"),

    call: (opts: any, args?: Row, callback?: (r: any) => void) => {
      const o = typeof opts === "string" ? { method: opts, args, callback } : opts
      return frappeCall({ doc: rt.doc, ...o })
    },

    script_manager: { trigger: (event: string, cdt?: string, cdn?: string) => rt.trigger(event, cdt, cdn) },
    page: lenient({
      add_inner_button: (label: string, fn: (...a: any[]) => any, group?: string) => rt.addButton(String(label), fn, group ? String(group) : undefined),
      set_indicator: () => {},
    }, "frm.page"),
  }
  rt.frm = lenient(frm, "frm")

  function frappeCall(o: any): Promise<any> {
    // Marked as handled so an un-awaited failure (already shown to the user) doesn't also log as unhandled
    const promise = callAsync(o)
    promise.catch(() => {})
    return promise
  }

  async function callAsync(o: any) {
    const method = String(o.method ?? "")
    if (o.freeze) freeze(o.freeze_message)
    try {
      const body = o.doc
        ? await callRaw("frappe.handler.run_doc_method", { docs: o.doc, method, args: o.args ?? {} })
        : await callRaw(method, o.args ?? {})
      if (o.doc && body.docs) rt.syncDocs(body.docs)
      const r = { message: body.message, docs: body.docs }
      await o.callback?.(r)
      return r
    } catch (e) {
      if (o.error) o.error(e)
      else if (!o.silent) msgprint({ title: "Error", indicator: "red", message: (e as Error).message })
      throw e
    } finally {
      if (o.freeze) unfreeze()
    }
  }
  return { frm: rt.frm, frappeCall }
}

// ------------------------------------------------------------------ the `frappe` global

function createFrappe(rt: FormRuntime, frappeCall: (o: any) => Promise<any>) {
  const { host } = rt
  const boot = host.boot
  const deskUrl = (doctype: string, name?: string) => `/app/${doctype.toLowerCase().replace(/[^a-z0-9]+/g, "-")}${name ? `/${encodeURIComponent(name)}` : ""}`

  const go = (path: string) => (path.startsWith("/app") ? window.location.assign(path) : host.navigate(path))

  const setRoute = (...args: any[]) => {
    const parts: any[] = (Array.isArray(args[0]) ? args[0] : args).filter((p: any) => p != null && p !== "")
    const [kind, doctype, name] = parts
    const route = typeof doctype === "string" ? host.routeFor(doctype) : undefined
    if (String(kind).toLowerCase() === "form" && doctype) {
      if (route) go(`/${route}/${encodeURIComponent(name ?? "new")}`)
      else if (String(name ?? "").startsWith("new-") || !name) msgprint({ title: "Not available in the portal", indicator: "orange", message: `${doctype} has no portal page yet. Create it in Desk.` })
      else go(deskUrl(doctype, name))
    } else if (String(kind).toLowerCase() === "list" && doctype) {
      go(route ? `/${route}` : deskUrl(doctype))
    } else {
      go(`/app/${parts.map((p) => encodeURIComponent(String(p).toLowerCase().replace(/ /g, "-"))).join("/")}`)
    }
    return Promise.resolve()
  }

  const newDoc = (doctype: string, values?: Row, callback?: () => void) => {
    const route = host.routeFor(doctype)
    if (route) {
      routeOptions = { doctype, values: values ?? {} }
      host.navigate(`/${route}/new`)
    } else {
      const qs = new URLSearchParams(Object.entries(values ?? {}).map(([k, v]) => [k, String(v)])).toString()
      window.location.assign(`${deskUrl(doctype)}/new${qs ? `?${qs}` : ""}`)
    }
    callback?.()
    return Promise.resolve()
  }

  const sync = (docs: Row | Row[]) => {
    for (const doc of Array.isArray(docs) ? docs : [docs]) {
      if (!doc?.doctype) continue
      if (!doc.name) doc.name = newName(doc.doctype)
      if (String(doc.name).startsWith("new-")) pendingDocs.set(`${doc.doctype}/${doc.name}`, doc)
    }
  }

  const setValue = (cdt: string, cdn: string, fieldOrObj: string | Row, value?: any) => {
    const entries = typeof fieldOrObj === "string" ? [[fieldOrObj, value] as const] : Object.entries(fieldOrObj)
    return (async () => { for (const [k, v] of entries) await rt.setValue(cdt, cdn, k, v) })()
  }

  const frappe: any = {
    call: frappeCall,
    xcall: async (method: string, args?: Row) => (await frappeCall({ method, args })).message,
    msgprint,
    show_alert: showAlert,
    alert: showAlert,
    confirm: confirmDialog,
    prompt,
    freeze,
    unfreeze,
    throw: (msg: any, title?: string) => {
      const message = typeof msg === "object" && msg ? msg.message : msg
      msgprint({ message, title: (typeof msg === "object" && msg?.title) || title || "Error", indicator: "red" })
      frappe.validated = false
      rt.validated = false
      throw new FrappeThrow(stripTags(String(message)))
    },
    set_route: setRoute,
    new_doc: newDoc,
    validated: true,
    get route_options() { return routeOptions?.values },
    set route_options(v: Row | undefined) { routeOptions = v ? { doctype: "*", values: v } : null },
    session: { user: boot.user.name, user_fullname: boot.user.full_name, user_email: boot.user.email },
    user: { name: boot.user.name, has_role: (r: string) => boot.roles.includes(r), full_name: () => boot.user.full_name },
    user_roles: boot.roles,
    boot: { sysdefaults: { company: boot.defaults.company, currency: boot.defaults.currency }, user: boot.user },
    defaults: {
      get_user_default: (k: string) => ({ Company: boot.defaults.company, company: boot.defaults.company, currency: boot.defaults.currency, fiscal_year: boot.defaults.fiscal_year } as Row)[k],
      get_default: (k: string) => ({ company: boot.defaults.company, currency: boot.defaults.currency } as Row)[k],
    },
    datetime,
    utils: {
      escape_html: (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!),
      icon: () => "",
      get_form_link: (doctype: string, name: string, html?: boolean, label?: string) => {
        const route = host.routeFor(doctype)
        const href = route ? `/portal/${route}/${encodeURIComponent(name)}` : deskUrl(doctype, name)
        return html ? `<a href="${href}">${label ?? name}</a>` : href
      },
      flt, cint, cstr,
      in_list: (list: any[], item: any) => list.includes(item),
      random_string: (n = 8) => Math.random().toString(36).slice(2, 2 + n),
    },
    dom: { freeze, unfreeze },
    ui: {
      Dialog: ScriptDialog,
      form: {
        on: (doctype: string, eventOrHandlers: string | Row, handler?: Function) => {
          if (typeof eventOrHandlers === "string") { if (handler) rt.on(doctype, eventOrHandlers, handler) }
          else for (const [event, fn] of Object.entries(eventOrHandlers)) if (typeof fn === "function") rt.on(doctype, event, fn)
        },
      },
    },
    model: {
      set_value: setValue,
      get_value: (doctype: string, name: string, field: string) => rt.getRow(doctype, name)?.[field],
      sync,
      add_child: (_doc: Row, table: string, values?: Row) => rt.addChild(table, values),
      clear_table: (_doc: Row, table: string) => rt.clearTable(table),
      open_mapped_doc: async (opts: { method: string; source_name?: string; frm?: any; args?: Row; freeze?: boolean }) => {
        const r = await frappeCall({
          method: "frappe.model.mapper.make_mapped_doc",
          args: { method: opts.method, source_name: opts.source_name ?? opts.frm?.doc?.name, args: opts.args },
          freeze: opts.freeze ?? true,
        })
        const doc = r.message
        if (doc?.doctype) { sync(doc); await setRoute("Form", doc.doctype, doc.name) }
      },
    },
    get_doc: (doctype: string, name: string) => rt.getRow(doctype, name),
    get_meta: (doctype: string) => { const m = rt.metaFor(doctype); return m ? { ...m, get_field: (f: string) => m.fields.find((x) => x.fieldname === f) } : undefined },
    meta: { get_docfield: (doctype: string, field: string) => rt.fieldDef(doctype, field) },
    db: {
      get_value: async (doctype: string, filters: any, fieldname: string | string[], callback?: (v: any) => void) => {
        const r = await frappeCall({ method: "frappe.client.get_value", args: { doctype, filters, fieldname: Array.isArray(fieldname) ? JSON.stringify(fieldname) : fieldname } })
        callback?.(r.message)
        return r
      },
      get_list: async (doctype: string, opts: Row = {}) =>
        (await frappeCall({ method: "frappe.client.get_list", args: { doctype, fields: JSON.stringify(opts.fields ?? ["name"]), filters: JSON.stringify(opts.filters ?? {}), limit_page_length: opts.limit ?? 100, order_by: opts.order_by } })).message,
      get_doc: async (doctype: string, name?: string) => (await frappeCall({ method: "frappe.client.get", args: { doctype, name } })).message,
      get_single_value: async (doctype: string, field: string) => (await frappeCall({ method: "frappe.client.get_single_value", args: { doctype, field } })).message,
      exists: async (doctype: string, name: string) => !!(await frappeCall({ method: "frappe.client.get_value", args: { doctype, filters: name, fieldname: "name" } })).message?.name,
    },
    format: (v: any) => String(v ?? ""),
    _: translate,
  }
  return lenient(frappe, "frappe")
}

// ------------------------------------------------------------------ script execution

export interface ScriptSource { doctype: string; label: string; code: string }

const PARAMS = ["frappe", "frm", "cur_frm", "locals", "flt", "cint", "cstr", "__", "$", "jQuery", "erpnext", "format_currency", "format_number", "moment", "cur_dialog"]

/**
 * Runs the Desk client scripts for this form against the runtime. Scripts are evaluated per form
 * instance (not once globally), so top-level statements such as `cur_frm.set_query(...)` bind to this form.
 */
export function attachScripts(rt: FormRuntime, scripts: ScriptSource[]) {
  const { frm, frappeCall } = createFrm(rt)
  const frappe = createFrappe(rt, frappeCall)

  const locals = new Proxy({} as Row, {
    get: (_t, cdt) => {
      if (typeof cdt !== "string") return undefined
      const out: Row = {}
      if (cdt === rt.doctype) out[rt.doc.name] = rt.doc
      const table = rt.tableForChild(cdt)
      if (table) for (const row of rt.doc[table] ?? []) out[row.name] = row
      return out
    },
  })

  const args = [frappe, frm, frm, locals, flt, cint, cstr, translate, $, $, noop("erpnext"), formatCurrency, formatNumber, undefined, noop("cur_dialog")]
  const run = (code: string, label: string) => {
    try {
      new Function(...PARAMS, code)(...args)
    } catch (e) {
      console.error(`[portal] script ${label} failed`, e)
    }
  }

  // Desk concatenates a doctype's scripts so helper functions are shared; fall back to one by one on a syntax error
  const all = scripts.map((s) => s.code).join("\n;\n")
  try {
    new Function(...PARAMS, all)
  } catch {
    for (const s of scripts) run(s.code, s.label)
    return frm
  }
  run(all, scripts.map((s) => s.label).join(", "))
  return frm
}

export { uid }
