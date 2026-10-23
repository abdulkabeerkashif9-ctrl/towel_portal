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
const metaOf = (j) => ({ name: j.name, title_field: j.title_field ?? null, is_submittable: j.is_submittable ?? 0, istable: j.istable ?? 0, default_print_format: j.default_print_format ?? null, fields: (j.fields ?? []).map(toField) })

function autoConfig(j) {
  const fields = metaOf(j).fields.filter((f) => !f.hidden)
  let cols = fields.filter((f) => f.in_list_view && !NO_COLUMN.has(f.fieldtype))
  if (cols.length < 3) cols = [...cols, ...fields.filter((f) => !NO_COLUMN.has(f.fieldtype) && !cols.includes(f) && !["naming_series", "amended_from", "company"].includes(f.fieldname))].slice(0, 5)
  const date = fields.find((f) => f.fieldtype === "Date" && f.fieldname.includes("date")) ?? fields.find((f) => f.fieldtype === "Date")
  const list = ["name", ...(date && !cols.includes(date) ? [date.fieldname] : []), ...cols.map((c) => c.fieldname)].slice(0, 7)
  const single = Boolean(j.issingle)
  return {
    route: slugOf(j.name), plural: plural(j.name), icon: single ? "settings" : j.is_submittable ? "file-text" : "database",
    section: single ? "Settings" : j.is_submittable ? ({ Emadiv3: "Weaving (Emadi)", "Garments App": "Garments", "Loom Production": "Loom Production", MJFSD: "MJFSD Weaving", Alwadaq: "Alwadaq Bales" }[j.module] ?? j.module) : "Masters",
    title_field: j.title_field ?? null, list_fields: list, search_fields: [], is_single: single, ...(date ? { date_field: date.fieldname } : {}),
  }
}

const bale = (i, item, w) => ({ serial_no: `BL-${String(i).padStart(5, "0")}`, item_code: item, weight_per_bale: w, total_weight: w, qty: 1, rate: 310, amount: 310 * w })
const rows = (doctype, list) => list.map((r, i) => ({ doctype, name: `${doctype.replace(/ /g, "-").toLowerCase()}-${i}`, idx: i + 1, ...r }))
const SEEDS = {
  "Daily Issuance": { date: "2026-10-19", company: "Alwadaq", warehouse: "Stores - ARHC", bale: "Big", stock_entry_reference: "MAT-STE-2026-00012", total_bales_issued: 5, total_weight_of_bales: 212.5, total_amount: 65875,
    daily_issuance_item: rows("Daily Issuance Item", [bale(101, "Cotton Waste A", 45), bale(102, "Cotton Waste A", 45), bale(103, "Cotton Waste B", 40), { ...bale(104, "Cotton Waste B", 40), status: "Cancelled" }, { ...bale(105, "Cotton Waste C", 42.5), status: "Issued" }].map((r, i) => ({ ...r, status: r.status ?? "Issued", purchase_receipt_reference: "MAT-PRE-2026-0000" + (i + 1) }))) },
  "Daily Production": { date: "2026-10-19", custom_customer: "Cotton Tex", custom_company: "Alwadaq", naming_series: "DP-.WW.-", stock_entry: "MAT-STE-2026-00013", total_qty: 4, total_amount: 52000, custom_total_weight_in_kgs_raw: 180, total_completed_qty: 3, total_finished_amount: 61000, custom_total_weight_in_kgs_finished: 162, custom_waste_weight: 18, custom_waste_item: "Waste Fibre",
    daily_production_raw_material: rows("Daily Production Raw Materials", [bale(101, "Cotton Waste A", 45), bale(102, "Cotton Waste A", 45), bale(103, "Cotton Waste B", 45), bale(104, "Cotton Waste B", 45)].map((r) => ({ ...r, custom_weight_per_bale: r.weight_per_bale, warehouse: "Stores - ARHC" }))),
    daily_production_finished_goods: rows("Daily Production Finished Goods", [{ item_code: "Recycled Bale 54kg", qty: 1, custom_weight_per_bale: 54, custom_serial_no: "FG-0001", custom_batch: "B1", rate: 380, amount: 380, warehouse: "Stores - ARHC" }, { item_code: "Recycled Bale 54kg", qty: 1, custom_weight_per_bale: 54, custom_serial_no: "FG-0002", custom_batch: "B1", rate: 380, amount: 380, warehouse: "Stores - ARHC" }, { item_code: "Recycled Bale 54kg", qty: 1, custom_weight_per_bale: 54, custom_serial_no: "FG-0003", custom_batch: "B1", rate: 380, amount: 380, warehouse: "Stores - ARHC" }]) },
  "Daily Receipt": { date: "2026-10-19", custom_bale: "Big", company: "Alwadaq", warehouse: "Stores - ARHC", stock_entry_reference: "MAT-STE-2026-00014", total_produced_qty: 3, total_produced_weight: 162, total_balance_weight: 50.5, sales_order: "SAL-ORD-2026-00031",
    daily_receipt_item: rows("Daily Receipt Item", [0, 1, 2].map((i) => ({ serial_no: `FG-000${i + 1}`, item_code: "Recycled Bale 54kg", qty: 1, weight_per_bale: 54, total_weight: 54, rate: 380, amount: 380, print: i < 2 ? 1 : 0, status: "Produced", sales_order: "SAL-ORD-2026-00031" }))),
    daily_receipt_issuance_ref: rows("Daily Receipt Issuance Reference", [{ daily_issuance: "DI-2026-10-19-01", issuance_total_weight: 212.5, available_balance: 212.5, weight_taken: 162, weight_after_current_issuance: 50.5, issuance_total_amount: 65875 }]) },
  "Master Bale Production": { date: "2026-10-19", sales_order: "SAL-ORD-2026-00031", custom_company: "Alwadaq", mixed_bale: 0, naming_series: "MBP-26-", stock_entry: "MAT-STE-2026-00015", total_qty: 3, total_completed_qty: 1, total_amount: 1140, total_finished_amount: 1200, custom_total_weight_in_kgs_raw: 162, custom_total_weight_in_kgs_finished: 160,
    master_bale_raw_material: rows("Master Bale Raw Materials", [1, 2, 3].map((i) => ({ serial_no: `FG-000${i}`, item_code: "Recycled Bale 54kg", bale_no: `B${i}`, custom_weight_per_bale: 54, qty: 1, rate: 380, amount: 380, warehouse: "Stores - ARHC" }))),
    master_bale_finished_goods: rows("Master Bale Finished Goods", [{ custom_serial_no: "MB-0001", item_code: "Master Bale 160kg", bale_no: "M1", bundle_no: 1, custom_weight_per_bale: 160, qty: 1, rate: 1200, amount: 1200, warehouse: "Stores - ARHC" }]) },
  "Weaving Contract": { type: "External", custom_status: "Open", construction: "FAB-30x60", weaver: "Cotton Tex", fabric_qty: 500, bom_items: [
    { doctype: "BOM Items", name: "row1", yarn_count: "YARN-20S", yarn_qty: 120, yarn_issued: 20, consumption: 0.12, idx: 1 },
    { doctype: "BOM Items", name: "row2", yarn_count: "YARN-16S", yarn_qty: 200, yarn_issued: 0, consumption: 0.2, idx: 2 } ] },
}

/** Custom Fields / Property Setters shipped in <app>/custom/*.json, applied like `bench migrate` does */
function applyCustomizations(roots, docs, metas) {
  const standardChildren = {}
  for (const root of roots) {
    for (const file of walk(root)) {
      if (!/[\\/]custom[\\/][^\\/]+\.json$/.test(file)) continue
      const json = JSON.parse(fs.readFileSync(file, "utf8"))
      for (const cf of json.custom_fields ?? []) {
        const field = toField({ ...cf, fieldname: cf.fieldname, fieldtype: cf.fieldtype })
        const target = docs[cf.dt]?.json ?? metas[cf.dt]
        if (target) {
          const list = target.fields ?? (target.fields = [])
          const at = list.findIndex((f) => f.fieldname === cf.insert_after)
          list.splice(at >= 0 ? at + 1 : list.length, 0, field)
        } else (standardChildren[cf.dt] ??= []).push(field)
      }
      for (const ps of json.property_setters ?? []) {
        if (ps.property === "default_print_format") {
          const target = docs[ps.doc_type]?.json ?? metas[ps.doc_type]
          if (target) target.default_print_format = ps.value
        }
      }
    }
  }
  return standardChildren
}

export function registerApps({ methods, cfgs, db, allPerms, metas }) {
  const roots = process.env.PORTAL_APP_ROOTS.split(path.delimiter).filter(Boolean)
  const docs = loadApps(roots)
  // Purchase Receipt / Serial No exist in ERPNext but not in the basic mock
  metas["Purchase Receipt"] ??= { title_field: "supplier_name", is_submittable: 1, fields: structuredClone(metas["Purchase Invoice"].fields) }
  cfgs["Purchase Receipt"] ??= { ...cfgs["Purchase Invoice"], route: "purchase-receipt", plural: "Purchase Receipts", icon: "package", list_fields: ["name", "supplier_name", "posting_date", "total_qty", "grand_total", "status"] }
  db["Purchase Receipt"] ??= structuredClone(db["Purchase Invoice"]).map((r) => ({ ...r, doctype: "Purchase Receipt", name: r.name.replace("PINV", "PREC") }))
  for (const dt of ["Delivery Note", "Purchase Invoice", "Stock Entry", "Purchase Receipt"]) metas[dt].fields = structuredClone(metas[dt].fields)
  const customChildren = applyCustomizations(roots, docs, metas)
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
    boot.sections = [...new Set([...boot.sections, "Alwadaq Bales", "Weaving (Emadi)", "MJFSD Weaving", "Loom Production", "Garments", "Masters", "Settings"])]
    boot.defaults = { company: "Towel Production", currency: "PKR", fiscal_year: "2026" }
    boot.doctypes = [...new Map([...boot.doctypes, ...mains.filter((d) => !boot.doctypes.some((x) => x.doctype === d.json.name)).map((d) => ({ doctype: d.json.name, ...cfgs[d.json.name], is_submittable: d.json.is_submittable ?? 0, perms: allPerms }))].map((x) => [x.doctype, x])).values()]
    return boot
  }

  const baseMeta = methods.get_doctype_meta
  methods.get_doctype_meta = (a) => {
    const d = docs[a.doctype]
    if (!d) {
      const out = { ...baseMeta(a), scripts: [] }
      for (const [name, child] of Object.entries(out.children)) {
        const extra = customChildren[`${a.doctype} Item`] ?? []
        if (name === `${a.doctype} Item`) out.children[name] = { ...child, fields: [...child.fields, ...extra] }
      }
      return out
    }
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
