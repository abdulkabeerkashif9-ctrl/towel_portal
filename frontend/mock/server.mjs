// Tiny stand-in for the Frappe API so the UI can be developed without a bench.
//   npm run mock      (listens on :8000)   then   npm run dev
import http from "node:http"

const PORT = Number(process.env.PORT || 8000)
const f = (fieldname, label, fieldtype, extra = {}) => ({
  fieldname, label, fieldtype, options: null, reqd: 0, read_only: 0, hidden: 0, default: null, depends_on: null,
  mandatory_depends_on: null, read_only_depends_on: null, fetch_from: null, in_list_view: 0, in_standard_filter: 0,
  description: null, precision: null, allow_on_submit: 0, collapsible: 0, set_only_once: 0, columns: null, ...extra,
})

const invoiceFields = (party) => [
  f("naming_series", "Series", "Select", { options: "ACC-SINV-.YYYY.-", reqd: 1 }),
  f("customer", "Customer", "Link", { options: "Customer", reqd: 1 }),
  f("customer_name", "Customer Name", "Data", { read_only: 1, fetch_from: "customer.customer_name" }),
  f("cb1", null, "Column Break"),
  f("posting_date", "Date", "Date", { reqd: 1, default: "Today" }),
  f("due_date", "Payment Due Date", "Date"),
  f("cb2", null, "Column Break"),
  f("company", "Company", "Link", { options: "Company", reqd: 1 }),
  f("currency", "Currency", "Link", { options: "Currency", reqd: 1 }),
  f("sb1", "Items", "Section Break"),
  f("items", "Items", "Table", { options: "Sales Invoice Item", reqd: 1 }),
  f("sb2", "Totals", "Section Break"),
  f("total_qty", "Total Quantity", "Float", { read_only: 1 }),
  f("cb3", null, "Column Break"),
  f("net_total", "Net Total", "Currency", { read_only: 1 }),
  f("cb4", null, "Column Break"),
  f("grand_total", "Grand Total", "Currency", { read_only: 1, bold: 1 }),
  f("outstanding_amount", "Outstanding Amount", "Currency", { read_only: 1 }),
  f("status", "Status", "Select", { read_only: 1, options: "Draft\nUnpaid\nPaid\nOverdue" }),
  f("sb3", "More Information", "Section Break", { collapsible: 1 }),
  f("po_no", "Customer's Purchase Order", "Data"),
  f("remarks", "Remarks", "Small Text"),
].map((x) => (party === "supplier" ? { ...x, fieldname: x.fieldname.replace("customer", "supplier") } : x))

const childFields = [
  f("item_code", "Item Code", "Link", { options: "Item", reqd: 1, in_list_view: 1, columns: 3 }),
  f("item_name", "Item Name", "Data", { read_only: 1, in_list_view: 1, columns: 3 }),
  f("qty", "Quantity", "Float", { reqd: 1, in_list_view: 1, default: "1", columns: 1 }),
  f("uom", "UOM", "Link", { options: "UOM", in_list_view: 1, columns: 1 }),
  f("rate", "Rate", "Currency", { reqd: 1, in_list_view: 1, columns: 2 }),
  f("amount", "Amount", "Currency", { read_only: 1, in_list_view: 1, columns: 2 }),
]

const simple = (extra) => [f("posting_date", "Posting Date", "Date", { reqd: 1, default: "Today" }), f("remarks", "Remarks", "Small Text"), ...extra]
const metas = {
  "Sales Invoice": { title_field: "customer_name", is_submittable: 1, fields: invoiceFields() },
  "Delivery Note": { title_field: "customer_name", is_submittable: 1, fields: invoiceFields() },
  "Purchase Invoice": { title_field: "supplier_name", is_submittable: 1, fields: invoiceFields("supplier") },
  "Stock Entry": { title_field: "stock_entry_type", is_submittable: 1, fields: simple([f("stock_entry_type", "Entry Type", "Link", { options: "Stock Entry Type", reqd: 1, in_list_view: 1 }), f("total_amount", "Total Amount", "Currency", { read_only: 1 })]) },
  "Payment Entry": { title_field: "party_name", is_submittable: 1, fields: simple([f("payment_type", "Payment Type", "Select", { options: "Receive\nPay\nInternal Transfer", reqd: 1 }), f("party", "Party", "Dynamic Link", { options: "party_type" }), f("party_name", "Party Name", "Data", { read_only: 1 }), f("paid_amount", "Paid Amount", "Currency", { reqd: 1 }), f("mode_of_payment", "Mode of Payment", "Link", { options: "Mode of Payment" })]) },
  "Journal Entry": { title_field: "title", is_submittable: 1, fields: simple([f("voucher_type", "Entry Type", "Select", { options: "Journal Entry\nBank Entry\nCash Entry", reqd: 1 }), f("title", "Title", "Data"), f("total_debit", "Total Debit", "Currency", { read_only: 1 }), f("total_credit", "Total Credit", "Currency", { read_only: 1 })]) },
}
const config = (route, plural, icon, section, extra) => ({ route, plural, icon, section, list_fields: ["name"], ...extra })
const cfgs = {
  "Sales Invoice": config("sales-invoice", "Sales Invoices", "receipt", "Selling", { date_field: "posting_date", party_field: "customer", party_doctype: "Customer", party_label: "All customers", title_field: "customer_name", status_field: "status", list_fields: ["name", "customer_name", "posting_date", "due_date", "grand_total", "outstanding_amount", "status"], report: { group_by: "customer", sum: ["grand_total", "outstanding_amount"] }, recalculate: true, item_table: "items", item_details: "erpnext" }),
  "Delivery Note": config("delivery-note", "Delivery Notes", "truck", "Selling", { date_field: "posting_date", party_field: "customer", party_doctype: "Customer", party_label: "All customers", title_field: "customer_name", status_field: "status", list_fields: ["name", "customer_name", "posting_date", "status", "grand_total"], report: { group_by: "customer", sum: ["grand_total"] }, recalculate: true, item_table: "items" }),
  "Purchase Invoice": config("purchase-invoice", "Purchase Invoices", "shopping-cart", "Buying", { date_field: "posting_date", party_field: "supplier", party_doctype: "Supplier", party_label: "All suppliers", title_field: "supplier_name", status_field: "status", list_fields: ["name", "supplier_name", "posting_date", "grand_total", "outstanding_amount", "status"], report: { group_by: "supplier", sum: ["grand_total"] }, recalculate: true, item_table: "items" }),
  "Stock Entry": config("stock-entry", "Stock Entries", "boxes", "Stock", { date_field: "posting_date", list_fields: ["name", "stock_entry_type", "posting_date", "total_amount"], report: { group_by: "stock_entry_type", sum: ["total_amount"] } }),
  "Payment Entry": config("payment-entry", "Payment Entries", "banknote", "Accounting", { date_field: "posting_date", party_field: "party", party_doctype: null, list_fields: ["name", "payment_type", "party_name", "posting_date", "paid_amount", "status"], status_field: "status", report: { group_by: "party", sum: ["paid_amount"] } }),
  "Journal Entry": config("journal-entry", "Journal Entries", "book-open", "Accounting", { date_field: "posting_date", list_fields: ["name", "voucher_type", "title", "posting_date", "total_debit"], report: { group_by: "voucher_type", sum: ["total_debit"] } }),
}
const allPerms = { read: true, write: true, create: true, submit: true, cancel: true, delete: true }

// ---- sample data
const customers = ["Cotton Tex", "Al-Noor Textiles", "Prime Linen", "Karachi Home Fabrics"]
const db = { "Sales Invoice": [], "Delivery Note": [], "Purchase Invoice": [], "Stock Entry": [], "Payment Entry": [], "Journal Entry": [] }
const seed = (dt, prefix, n, make) => { for (let i = 1; i <= n; i++) db[dt].push({ doctype: dt, name: `${prefix}-2026-${String(i).padStart(5, "0")}`, docstatus: i % 4 === 0 ? 0 : 1, modified: `2026-10-${String(10 + (i % 9)).padStart(2, "0")} 10:00:00`, currency: "PKR", ...make(i) }) }
const inv = (party, nameKey) => (i) => {
  const qty = 100 * i, rate = 250 + i * 10, total = qty * rate, paid = i % 3 === 0
  return { [party]: customers[i % 4], [nameKey]: customers[i % 4], posting_date: `2026-10-${String(1 + i).padStart(2, "0")}`, due_date: `2026-11-${String(1 + i).padStart(2, "0")}`, items: [{ doctype: "Item", item_code: "TWL-30x60", item_name: "Bath Towel 30x60", qty, rate, amount: total, uom: "Nos" }], total_qty: qty, net_total: total, grand_total: total, outstanding_amount: paid ? 0 : total, status: paid ? "Paid" : i % 5 === 0 ? "Overdue" : "Unpaid", company: "Towel Production", naming_series: "ACC-SINV-.YYYY.-" }
}
seed("Sales Invoice", "ACC-SINV", 14, inv("customer", "customer_name"))
seed("Delivery Note", "MAT-DN", 6, (i) => ({ ...inv("customer", "customer_name")(i), status: "To Bill" }))
seed("Purchase Invoice", "ACC-PINV", 8, inv("supplier", "supplier_name"))
seed("Stock Entry", "MAT-STE", 5, (i) => ({ stock_entry_type: i % 2 ? "Material Transfer" : "Material Issue", posting_date: `2026-10-0${i}`, total_amount: 40000 * i }))
seed("Payment Entry", "ACC-PAY", 6, (i) => ({ payment_type: "Receive", party: customers[i % 4], party_name: customers[i % 4], posting_date: `2026-10-0${i}`, paid_amount: 150000 * i, status: "Submitted" }))
seed("Journal Entry", "ACC-JV", 4, (i) => ({ voucher_type: "Journal Entry", title: `Adjustment ${i}`, posting_date: `2026-10-0${i}`, total_debit: 9000 * i, total_credit: 9000 * i }))

const recalc = (doc) => {
  const rows = (doc.items ?? []).map((r) => ({ ...r, amount: (Number(r.qty) || 0) * (Number(r.rate) || 0) }))
  const total = rows.reduce((a, r) => a + r.amount, 0)
  return { ...doc, items: rows, total_qty: rows.reduce((a, r) => a + (Number(r.qty) || 0), 0), net_total: total, grand_total: total }
}

const methods = {
  get_csrf_token: () => "mock",
  get_boot: () => ({ brand: { title: "Towel Production", subtitle: "Operations Portal" }, sections: ["Selling", "Buying", "Stock", "Accounting"], currency: "PKR", roles: ["System Manager", "Accounts User"], user: { name: "Administrator", full_name: "Administrator", email: "admin@example.com", image: null, is_desk_user: true }, doctypes: Object.entries(cfgs).map(([dt, c]) => ({ doctype: dt, ...c, is_submittable: 1, perms: dt === "Journal Entry" ? { ...allPerms, delete: false } : allPerms })) }),
  get_doctype_meta: ({ doctype }) => ({ config: { doctype, ...cfgs[doctype] }, meta: { name: doctype, title_field: metas[doctype].title_field, is_submittable: 1, istable: 0, fields: metas[doctype].fields }, children: { [`${doctype} Item`]: { name: `${doctype} Item`, istable: 1, is_submittable: 0, title_field: null, fields: childFields }, "Sales Invoice Item": { name: "Sales Invoice Item", istable: 1, is_submittable: 0, title_field: null, fields: childFields } }, perms: allPerms }),
  get_list: ({ doctype, search, party, docstatus, from_date, to_date, order_by, page = 1, page_size = 20 }) => {
    const c = cfgs[doctype]
    let rows = db[doctype].filter((r) => (!search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase())) && (!party || r[c.party_field] === party) && (docstatus === null || docstatus === undefined || docstatus === "" || r.docstatus === Number(docstatus)) && (!from_date || r.posting_date >= from_date) && (!to_date || r.posting_date <= to_date))
    if (order_by) { const [k, d] = order_by.split(" "); rows = [...rows].sort((a, b) => (a[k] > b[k] ? 1 : -1) * (d === "desc" ? -1 : 1)) }
    return { rows: rows.slice((page - 1) * page_size, page * page_size), total: rows.length, page, page_size }
  },
  get_report: ({ doctype }) => {
    const r = cfgs[doctype].report, groups = {}
    for (const row of db[doctype]) { const g = (groups[row[r.group_by]] ??= { [r.group_by]: row[r.group_by], count: 0 }); g.count++; for (const s of r.sum) g[s] = (g[s] || 0) + (row[s] || 0) }
    return { group_by: r.group_by, sums: r.sum, rows: Object.values(groups).sort((a, b) => b[r.sum[0]] - a[r.sum[0]]) }
  },
  get_dashboard: () => ({
    cards: Object.entries(cfgs).map(([dt, c]) => ({ doctype: dt, route: c.route, plural: c.plural, icon: c.icon, draft: db[dt].filter((r) => r.docstatus === 0).length, submitted: db[dt].filter((r) => r.docstatus === 1).length, cancelled: 0, amount: db[dt].reduce((a, r) => a + (r.grand_total || r.paid_amount || r.total_amount || r.total_debit || 0), 0), ...(c.list_fields.includes("outstanding_amount") ? { outstanding: db[dt].reduce((a, r) => a + (r.outstanding_amount || 0), 0) } : {}) })),
    recent: Object.entries(db).flatMap(([dt, rows]) => rows.slice(0, 2).map((r) => ({ doctype: dt, route: cfgs[dt].route, name: r.name, title: r.customer_name || r.supplier_name || r.title || null, modified: r.modified, docstatus: r.docstatus }))).slice(0, 8),
  }),
  get_new_doc: ({ doctype }) => ({ doctype, name: "new-" + Date.now(), __islocal: 1, docstatus: 0, company: "Towel Production", currency: "PKR", posting_date: new Date().toISOString().slice(0, 10), naming_series: "ACC-SINV-.YYYY.-", items: [] }),
  get_doc: ({ doctype, name }) => { const doc = db[doctype].find((r) => r.name === name); if (!doc) throw Object.assign(new Error(`${doctype} ${name} not found`), { status: 404 }); return { doc, perms: allPerms } },
  save_doc: ({ doc }) => { const dt = doc.doctype; const isNew = !doc.name || String(doc.name).startsWith("new-"); const saved = { ...recalc(doc), modified: new Date().toISOString().slice(0, 19).replace("T", " ") }; delete saved.__islocal; if (isNew) { saved.name = `NEW-${dt.replace(/ /g, "").slice(0, 4).toUpperCase()}-${String(db[dt].length + 1).padStart(5, "0")}`; db[dt].unshift(saved) } else db[dt][db[dt].findIndex((r) => r.name === doc.name)] = saved; return saved },
  submit_doc: ({ doctype, name }) => { const d = db[doctype].find((r) => r.name === name); d.docstatus = 1; return d },
  cancel_doc: ({ doctype, name }) => { const d = db[doctype].find((r) => r.name === name); d.docstatus = 2; return d },
  delete_doc: ({ doctype, name }) => { db[doctype] = db[doctype].filter((r) => r.name !== name); return true },
  recalculate: ({ doc }) => recalc(doc),
  get_item_details: ({ item_code }) => ({ item_name: item_code === "TWL-30x60" ? "Bath Towel 30x60" : `Item ${item_code}`, uom: "Nos", rate: 275, qty: 1 }),
  search_link: ({ doctype, txt }) => { const pool = { Customer: customers, Supplier: ["Yarn Traders", "Dye House Ltd"], Item: ["TWL-30x60", "TWL-20x40", "YARN-20S"], Company: ["Towel Production"], Currency: ["PKR", "USD"] }[doctype] ?? [`${doctype} A`, `${doctype} B`]; return pool.filter((v) => v.toLowerCase().includes((txt || "").toLowerCase())).map((value) => ({ value, description: doctype })) },
  change_password: () => true,
  "frappe.client.get_value": ({ doctype, filters }) => ({ customer_name: filters, supplier_name: filters, item_name: filters }),
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  const m = url.pathname.match(/^\/api\/method\/(?:towel_portal\.api\.portal\.)?(.+)$/)
  if (!m || !methods[m[1]]) { res.writeHead(404); return res.end("{}") }
  let body = ""
  req.on("data", (c) => (body += c))
  req.on("end", () => {
    try {
      const out = methods[m[1]](body ? JSON.parse(body) : {})
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ message: out }))
    } catch (e) {
      res.writeHead(e.status || 417, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ exception: `frappe.exceptions.ValidationError: ${e.message}`, _server_messages: JSON.stringify([JSON.stringify({ message: e.message })]) }))
    }
  })
}).listen(PORT, () => console.log(`mock Frappe API on :${PORT}`))
