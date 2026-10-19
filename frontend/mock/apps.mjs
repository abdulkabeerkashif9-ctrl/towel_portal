// Loads the real DocType JSON and Desk client scripts of other Frappe apps, so the portal's script
// compatibility layer can be exercised without a bench:
//   PORTAL_APP_ROOTS=/path/to/emadi_v3:/path/to/mjfsd_v3 npm run mock
import fs from "node:fs"
import path from "node:path"

const FIELD_DEFAULTS = {
  reqd: 0, read_only: 0, hidden: 0, default: null, depends_on: null, mandatory_depends_on: null, read_only_depends_on: null,
  fetch_from: null, in_list_view: 0, in_standard_filter: 0, description: null, precision: null, allow_on_submit: 0,
  collapsible: 0, set_only_once: 0, columns: null, options: null, label: null,
}
const NO_COLUMN = new Set(["Section Break", "Column Break", "Tab Break", "Table", "HTML", "Button", "Text", "Small Text", "Long Text", "Text Editor", "Code", "Attach", "Attach Image", "Check", "Read Only"])

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else yield p
  }
}

const slugOf = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-")
const plural = (n) => (/[^aeiou]y$/.test(n) ? n.slice(0, -1) + "ies" : /(s|x|ch|sh)$/.test(n) ? n + "es" : n + "s")

export function loadApps(roots) {
  const docs = {}
  for (const root of roots) {
    const app = path.basename(root)
    const modulesFile = [...walk(root)].find((f) => f.endsWith(`${app}${path.sep}modules.txt`))
    const modules = modulesFile ? fs.readFileSync(modulesFile, "utf8").split("\n").map((s) => s.trim()).filter(Boolean) : null
    for (const file of walk(root)) {
      if (!/doctype[\\/][^\\/]+[\\/][^\\/]+\.json$/.test(file)) continue
      const json = JSON.parse(fs.readFileSync(file, "utf8"))
      if (json.doctype !== "DocType" || (modules && !modules.includes(json.module))) continue
      const jsFile = file.replace(/\.json$/, ".js")
      const code = fs.existsSync(jsFile) ? fs.readFileSync(jsFile, "utf8") : ""
      docs[json.name] = { json, code, app, label: `${app}/${path.basename(jsFile)}` }
    }
    // doctype_js hooks, e.g. {"Sales Invoice": "public/js/sales_invoice.js"}
    const hooks = [...walk(root)].find((f) => f.endsWith(`${app}${path.sep}hooks.py`))
    if (hooks) {
      const src = fs.readFileSync(hooks, "utf8").replace(/^\s*#.*$/gm, "")
      const block = src.match(/doctype_js\s*=\s*\{([\s\S]*?)\}/)
      for (const m of block?.[1].matchAll(/["']([^"']+)["']\s*:\s*["']([^"']+)["']/g) ?? []) {
        const f = path.join(path.dirname(hooks), m[2])
        if (fs.existsSync(f)) (docs.__hooks ??= {})[m[1]] = [...((docs.__hooks ?? {})[m[1]] ?? []), { code: fs.readFileSync(f, "utf8"), label: `${app}/${m[2]}` }]
      }
    }
  }
  return docs
}

const toField = (f) => ({ ...FIELD_DEFAULTS, ...f, fieldname: f.fieldname, fieldtype: f.fieldtype, in_list_view: f.in_list_view ?? 0 })
const metaOf = (j) => ({ name: j.name, title_field: j.title_field ?? null, is_submittable: j.is_submittable ?? 0, istable: j.istable ?? 0, fields: (j.fields ?? []).map(toField) })

function autoConfig(j) {
  const fields = metaOf(j).fields.filter((f) => !f.hidden)
  let cols = fields.filter((f) => f.in_list_view && !NO_COLUMN.has(f.fieldtype))
  if (cols.length < 3) cols = [...cols, ...fields.filter((f) => !NO_COLUMN.has(f.fieldtype) && !cols.includes(f) && !["naming_series", "amended_from", "company"].includes(f.fieldname))].slice(0, 5)
  const date = fields.find((f) => f.fieldtype === "Date" && f.fieldname.includes("date")) ?? fields.find((f) => f.fieldtype === "Date")
  const list = ["name", ...(date && !cols.includes(date) ? [date.fieldname] : []), ...cols.map((c) => c.fieldname)].slice(0, 7)
  const single = Boolean(j.issingle)
  return {
    route: slugOf(j.name), plural: plural(j.name), icon: single ? "settings" : j.is_submittable ? "file-text" : "database",
    section: single ? "Settings" : j.is_submittable ? ({ Emadiv3: "Weaving (Emadi)", "Garments App": "Garments", "Loom Production": "Loom Production", MJFSD: "MJFSD Weaving" }[j.module] ?? j.module) : "Masters",
    title_field: j.title_field ?? null, list_fields: list, search_fields: [], is_single: single, ...(date ? { date_field: date.fieldname } : {}),
  }
}

const SEEDS = {
  "Weaving Contract": { type: "External", custom_status: "Open", construction: "FAB-30x60", weaver: "Cotton Tex", fabric_qty: 500, bom_items: [
    { doctype: "BOM Items", name: "row1", yarn_count: "YARN-20S", yarn_qty: 120, yarn_issued: 20, consumption: 0.12, idx: 1 },
    { doctype: "BOM Items", name: "row2", yarn_count: "YARN-16S", yarn_qty: 200, yarn_issued: 0, consumption: 0.2, idx: 2 } ] },
}

export function registerApps({ methods, cfgs, db, allPerms }) {
  const roots = process.env.PORTAL_APP_ROOTS.split(path.delimiter).filter(Boolean)
  const docs = loadApps(roots)
  const hooks = docs.__hooks ?? {}
  delete docs.__hooks

  const mains = Object.values(docs).filter((d) => !d.json.istable)
  for (const d of mains) {
    if (cfgs[d.json.name]) continue
    cfgs[d.json.name] = autoConfig(d.json)
    db[d.json.name] = db[d.json.name] ?? []
    if (!d.json.issingle && !db[d.json.name].length) db[d.json.name].push({ doctype: d.json.name, name: "TEST-1", docstatus: 0, modified: "2026-10-10 10:00:00" }, { doctype: d.json.name, name: "TEST-2", docstatus: d.json.is_submittable ? 1 : 0, modified: "2026-10-11 10:00:00", ...(SEEDS[d.json.name] ?? {}) })
  }

  const baseBoot = methods.get_boot
  methods.get_boot = (a) => {
    const boot = baseBoot(a)
    boot.sections = [...new Set([...boot.sections, "Weaving (Emadi)", "MJFSD Weaving", "Loom Production", "Garments", "Masters", "Settings"])]
    boot.defaults = { company: "Towel Production", currency: "PKR", fiscal_year: "2026" }
    boot.doctypes = [...new Map([...boot.doctypes, ...mains.filter((d) => !boot.doctypes.some((x) => x.doctype === d.json.name)).map((d) => ({ doctype: d.json.name, ...cfgs[d.json.name], is_submittable: d.json.is_submittable ?? 0, perms: allPerms }))].map((x) => [x.doctype, x])).values()]
    return boot
  }

  const baseMeta = methods.get_doctype_meta
  methods.get_doctype_meta = (a) => {
    const d = docs[a.doctype]
    if (!d) return { ...baseMeta(a), scripts: [] }
    const meta = metaOf(d.json)
    const children = {}
    for (const f of meta.fields) if (f.fieldtype === "Table" && docs[f.options]) children[f.options] = metaOf(docs[f.options].json)
    const scripts = [a.doctype, ...Object.keys(children)].flatMap((dt) => [
      ...(docs[dt]?.code?.trim() ? [{ doctype: dt, label: docs[dt].label, code: docs[dt].code }] : []),
      ...(hooks[dt] ?? []).map((h) => ({ doctype: dt, label: h.label, code: h.code })),
    ])
    return { config: { doctype: a.doctype, ...cfgs[a.doctype], is_submittable: meta.is_submittable }, meta, children, perms: allPerms, scripts }
  }

  // hooked scripts for standard doctypes that the mock already serves
  const prior = methods.get_doctype_meta
  methods.get_doctype_meta = (a) => {
    const out = prior(a)
    if (!docs[a.doctype]) out.scripts = [...(out.scripts ?? []), ...(hooks[a.doctype] ?? []).map((h) => ({ doctype: a.doctype, label: h.label, code: h.code }))]
    return out
  }

  const baseNew = methods.get_new_doc
  methods.get_new_doc = (a) => {
    const d = docs[a.doctype]
    const doc = baseNew(a)
    if (!d) return doc
    for (const f of d.json.fields ?? []) if (f.default != null && f.default !== "" && !["Today", "Now"].includes(f.default)) doc[f.fieldname] = ["Int", "Float", "Currency", "Percent", "Check"].includes(f.fieldtype) ? Number(f.default) || 0 : f.default
    delete doc.company; delete doc.currency; delete doc.naming_series
    return { ...doc, ...(d.json.fields?.some((f) => f.fieldname === "naming_series") ? { naming_series: (d.json.fields.find((f) => f.fieldname === "naming_series").options ?? "").split("\n")[0] } : {}) }
  }

  const baseSearch = methods.search_link
  methods.search_link = (a) => {
    const rows = (db[a.doctype] ?? []).map((r) => ({ value: r.name, description: a.doctype }))
    return rows.length ? rows.filter((r) => r.value.toLowerCase().includes((a.txt || "").toLowerCase())) : baseSearch(a)
  }

  // custom server methods called by scripts return nothing; doc methods echo the document
  methods["frappe.handler.run_doc_method"] = ({ docs: doc }) => ({ __raw: true, message: null, docs: [typeof doc === "string" ? JSON.parse(doc) : doc] })
  methods["frappe.model.mapper.make_mapped_doc"] = () => null
  methods["emadi_v3.emadi.events.issue_yarn.issue_yarn"] = ({ rows }) => ({ doctype: "Stock Entry", name: "new-stock-entry-mock", stock_entry_type: "Material Issue", posting_date: "2026-10-19", remarks: `Yarn issue: ${JSON.stringify(rows)}`, items: [] })
  methods["emadi_v3.emadi.events.issue_yarn.sync_yarn_issued_totals"] = () => null
  registerSampleMethods(methods)
  return Object.keys(docs).length
}

// A few of the custom server methods the apps' scripts call, with plausible answers
export function registerSampleMethods(methods) {
  methods["emadi_v3.emadiv3.events.fetch_fabric_construction_items.fetch_fabric_construction_items"] = ({ qty }) => [
    { for: "Warp", yarn_count: "YARN-20S", consumption: 0.12, yarn_qty: 0.12 * qty },
    { for: "Weft", yarn_count: "YARN-16S", consumption: 0.2, yarn_qty: 0.2 * qty },
  ]
  methods["emadi_v3.emadiv3.events.fetch_current_stock.fetch_current_stock"] = () => ({ current_stock: 500, rate: 310 })
}
