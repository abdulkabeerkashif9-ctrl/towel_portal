import type { Row } from "@/lib/types"
import type { Design } from "./types"

const num = (v: unknown) => Number(v) || 0
const dash = (...parts: unknown[]) => parts.filter(Boolean).join(" · ") || null

/** Share of `part` in `whole` as 0..1, or null when there's nothing to compare yet. */
const ratio = (part: unknown, whole: unknown) => (num(whole) > 0 ? num(part) / num(whole) : null)

// ------------------------------------------------------------------ Alwadaq: bale workflow

const dailyIssuance: Design = {
  doctype: "Daily Issuance",
  subtitle: (d) => dash(d.warehouse, d.date),
  scan: { field: "scan_serial_no", label: "Scan bale to issue", placeholder: "Scan a bale serial number, then press Enter" },
  stats: [
    { label: "Bales issued", field: "total_bales_issued", format: "int", tone: "info" },
    { label: "Total weight (kg)", field: "total_weight_of_bales", format: "float" },
    { label: "Total amount", field: "total_amount", format: "currency" },
  ],
  blocks: [
    { type: "fields", title: "Issuance", columns: 4, fields: ["date", "company", "warehouse", "bale"] },
    { type: "links", fields: ["stock_entry_reference"] },
    {
      type: "table",
      title: "Issued bales",
      description: "Each scanned bale is one row; cancel an issuance from its row.",
      table: "daily_issuance_item",
      columns: ["serial_no", "item_code", "weight_per_bale", "total_weight", "qty", "rate", "amount", "purchase_receipt_reference", "status", "cancel_issuance"],
      totals: ["qty", "total_weight", "amount"],
    },
  ],
}

const yieldOf = (d: Row) => ratio(d.custom_total_weight_in_kgs_finished, d.custom_total_weight_in_kgs_raw)
const yieldCaption = (d: Row) =>
  num(d.custom_total_weight_in_kgs_raw) > 0
    ? `${num(d.custom_total_weight_in_kgs_finished).toFixed(1)} kg finished from ${num(d.custom_total_weight_in_kgs_raw).toFixed(1)} kg raw`
    : "Scan raw bales and add finished goods to see the yield"

const dailyProduction: Design = {
  doctype: "Daily Production",
  subtitle: (d) => dash(d.custom_customer, d.date),
  scan: { field: "scan_serial_no", label: "Scan raw bale consumed", placeholder: "Scan a raw bale serial number, then press Enter" },
  stats: [
    { label: "Raw consumed (bales)", field: "total_qty", format: "float" },
    { label: "Raw weight (kg)", field: "custom_total_weight_in_kgs_raw", format: "float" },
    { label: "Finished (bales)", field: "total_completed_qty", format: "float", tone: "info" },
    { label: "Finished weight (kg)", field: "custom_total_weight_in_kgs_finished", format: "float", tone: "success" },
    { label: "Waste (kg)", field: "custom_waste_weight", format: "float", tone: "warning" },
  ],
  blocks: [
    {
      type: "split",
      left: { type: "fields", title: "Production", columns: 2, fields: ["date", "custom_customer", "custom_company", "naming_series"] },
      right: { type: "meter", title: "Yield", ratio: yieldOf, caption: yieldCaption },
    },
    { type: "links", fields: ["stock_entry"] },
    {
      type: "table",
      title: "Raw materials consumed",
      table: "daily_production_raw_material",
      columns: ["serial_no", "item_code", "custom_weight_per_bale", "qty", "rate", "amount", "warehouse"],
      totals: ["qty", "amount"],
    },
    {
      type: "table",
      title: "Finished goods produced",
      table: "daily_production_finished_goods",
      columns: ["item_code", "qty", "custom_weight_per_bale", "custom_serial_no", "custom_batch", "custom_sales_order", "rate", "amount", "warehouse"],
      totals: ["qty", "amount"],
    },
    { type: "fields", title: "Waste", columns: 3, fields: ["custom_waste_item", "custom_waste_weight", "total_finished_amount"] },
  ],
}

const dailyReceipt: Design = {
  doctype: "Daily Receipt",
  subtitle: (d) => dash(d.custom_bale && `${d.custom_bale} bales`, d.warehouse, d.date),
  stats: [
    { label: "Produced (bales)", field: "total_produced_qty", format: "int", tone: "info" },
    { label: "Produced weight (kg)", field: "total_produced_weight", format: "float", tone: "success" },
    { label: "Issuance balance (kg)", field: "total_balance_weight", format: "float", tone: "warning" },
  ],
  blocks: [
    { type: "fields", title: "Receipt", columns: 4, fields: ["custom_bale", "date", "company", "warehouse", "sales_order"] },
    { type: "links", fields: ["stock_entry_reference"] },
    {
      type: "table",
      title: "Produced bales",
      description: "Tick Print on the bales whose labels you want to print.",
      table: "daily_receipt_item",
      columns: ["serial_no", "item_code", "qty", "weight_per_bale", "total_weight", "rate", "amount", "sales_order", "print", "status", "cancel_production"],
      totals: ["qty", "total_weight", "amount"],
    },
    {
      type: "table",
      title: "Issuances drawn from",
      description: "Weight taken from each daily issuance and what is left on it.",
      table: "daily_receipt_issuance_ref",
      columns: ["daily_issuance", "issuance_total_weight", "available_balance", "weight_taken", "weight_after_current_issuance", "issuance_total_amount"],
      totals: ["weight_taken"],
    },
  ],
}

const masterBale: Design = {
  doctype: "Master Bale Production",
  subtitle: (d) => dash(d.mixed_bale ? "Mixed bale" : null, d.sales_order, d.date),
  scan: { field: "scan_serial_no", label: "Scan bale into master bale", placeholder: "Scan a bale serial number, then press Enter" },
  stats: [
    { label: "Bales packed", field: "total_qty", format: "float" },
    { label: "Raw weight (kg)", field: "custom_total_weight_in_kgs_raw", format: "float" },
    { label: "Master bales", field: "total_completed_qty", format: "float", tone: "info" },
    { label: "Master weight (kg)", field: "custom_total_weight_in_kgs_finished", format: "float", tone: "success" },
  ],
  blocks: [
    {
      type: "split",
      left: { type: "fields", title: "Master bale", columns: 2, fields: ["date", "sales_order", "custom_company", "mixed_bale", "naming_series"] },
      right: { type: "meter", title: "Weight carried over", ratio: yieldOf, caption: yieldCaption },
    },
    { type: "links", fields: ["stock_entry"] },
    {
      type: "table",
      title: "Bales packed",
      table: "master_bale_raw_material",
      columns: ["serial_no", "item_code", "bale_no", "custom_weight_per_bale", "qty", "rate", "amount", "warehouse"],
      totals: ["qty", "custom_weight_per_bale", "amount"],
    },
    {
      type: "table",
      title: "Master bales produced",
      table: "master_bale_finished_goods",
      columns: ["custom_serial_no", "item_code", "bale_no", "bundle_no", "custom_weight_per_bale", "qty", "rate", "amount", "warehouse"],
      totals: ["qty", "custom_weight_per_bale", "amount"],
    },
  ],
}

// ------------------------------------------------------------------ standard doctypes customised by Alwadaq

/** "Purchase Gate Pass" is the Purchase Receipt doctype with only the fields the gate needs. */
const purchaseGatePass: Design = {
  doctype: "Purchase Receipt",
  minimal: true,
  subtitle: (d) => dash(d.supplier_name || d.supplier, d.posting_date),
  defaults: { company: "$company" },
  labels: { weight_per_unit: "Weight per bale", custom_serial_list: "Serial list", item_code: "Item" },
  rowDefaults: { items: { uom: "Bale", stock_uom: "Bale", conversion_factor: 1 } },
  rowFetch: [{ table: "items", link: "item_code", source: "custom_weight_per_bale", target: "weight_per_unit" }],
  rowFormulas: { items: { total_weight: (r) => num(r.qty) * num(r.weight_per_unit) } },
  blocks: [
    { type: "fields", columns: 3, fields: ["posting_date", "supplier", "set_warehouse"] },
    {
      type: "table",
      title: "Bales",
      table: "items",
      columns: ["item_code", "qty", "weight_per_unit", "total_weight", "custom_serial_list"],
      totals: ["qty", "total_weight"],
    },
  ],
}

const deliveryNote: Design = {
  doctype: "Delivery Note",
  subtitle: (d) => dash(d.customer_name || d.customer, d.custom_container_no && `Container ${d.custom_container_no}`, d.posting_date),
  scan: { field: "custom_scan_master_bale", label: "Scan master bale to load", placeholder: "Scan a master bale serial number, then press Enter" },
  stats: [
    { label: "Master bales", field: "total_qty", format: "float", tone: "info" },
    { label: "Net weight (kg)", field: "total_net_weight", format: "float" },
    { label: "Grand total", field: "grand_total", format: "currency", tone: "success" },
  ],
  blocks: [
    { type: "fields", title: "Delivery", columns: 4, fields: ["customer", "customer_name", "custom_sales_order", "posting_date", "posting_time", "set_posting_time", "custom_container_no", "company", "set_warehouse", "currency"] },
    {
      type: "table",
      title: "Master bales",
      table: "items",
      columns: ["custom_master_bale_no", "item_code", "item_name", "qty", "uom", "rate", "amount", "warehouse"],
      totals: ["qty", "amount"],
    },
  ],
}

const purchaseInvoice: Design = {
  doctype: "Purchase Invoice",
  subtitle: (d) => dash(d.supplier_name || d.supplier, d.bill_no && `Bill ${d.bill_no}`, d.posting_date),
  stats: [
    { label: "Serial numbers", field: "custom_total_serial_count", format: "int", tone: "info" },
    { label: "Total", field: "grand_total", format: "currency", tone: "success" },
    { label: "Outstanding", field: "outstanding_amount", format: "currency", tone: "warning" },
  ],
  blocks: [
    { type: "fields", title: "Invoice", columns: 4, fields: ["supplier", "supplier_name", "posting_date", "due_date", "bill_no", "bill_date", "company", "currency"] },
    {
      type: "table",
      title: "Items",
      table: "items",
      columns: ["item_code", "item_name", "custom_serial_no_count", "custom_weight_kg", "custom_weight_lbs", "qty", "uom", "rate", "amount"],
      totals: ["qty", "custom_serial_no_count", "custom_weight_kg", "amount"],
    },
  ],
}

const stockEntry: Design = {
  doctype: "Stock Entry",
  subtitle: (d) => dash(d.stock_entry_type, d.posting_date),
  stats: [{ label: "Total value", field: "total_amount", format: "currency", tone: "success" }],
  blocks: [
    { type: "fields", title: "Stock entry", columns: 4, fields: ["stock_entry_type", "posting_date", "posting_time", "company", "from_warehouse", "to_warehouse"] },
    { type: "links", fields: ["custom_daily_issuance_reference", "custom_daily_receipt_reference"] },
    {
      type: "table",
      title: "Items",
      table: "items",
      columns: ["s_warehouse", "t_warehouse", "item_code", "item_name", "qty", "uom", "basic_rate", "amount"],
      totals: ["qty", "amount"],
    },
  ],
}

export const designs: Record<string, Design> = Object.fromEntries(
  [dailyIssuance, dailyProduction, dailyReceipt, masterBale, purchaseGatePass, deliveryNote, purchaseInvoice, stockEntry].map((d) => [d.doctype, d]),
)
