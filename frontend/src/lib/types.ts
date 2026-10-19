export type Row = Record<string, any>

export interface DocField {
  fieldname: string
  label: string | null
  fieldtype: string
  options: string | null
  reqd: 0 | 1
  read_only: 0 | 1
  hidden: 0 | 1
  default: string | null
  depends_on: string | null
  mandatory_depends_on: string | null
  read_only_depends_on: string | null
  fetch_from: string | null
  in_list_view: 0 | 1
  in_standard_filter: 0 | 1
  description: string | null
  precision: string | null
  allow_on_submit: 0 | 1
  collapsible: 0 | 1
  set_only_once: 0 | 1
  columns: number | null
}

export interface MetaDict {
  name: string
  title_field: string | null
  is_submittable: 0 | 1
  istable: 0 | 1
  fields: DocField[]
}

export type Perms = Record<"read" | "write" | "create" | "submit" | "cancel" | "delete", boolean>

export interface PortalDoctype {
  doctype: string
  route: string
  plural: string
  icon: string
  section: string
  date_field?: string
  party_field?: string
  party_doctype?: string | null
  party_label?: string
  title_field?: string
  status_field?: string
  list_fields: string[]
  search_fields?: string[]
  report?: { group_by: string; sum: string[] }
  kpi?: { amount_field?: string; outstanding_field?: string }
  recalculate?: boolean
  item_table?: string
  item_details?: "erpnext" | "basic"
  party_details?: { party_type: string }
  taxes?: { template_field: string; template_doctype: string; table: string }
  is_submittable: 0 | 1
  is_single?: boolean
  module?: string
  perms: Perms
}

export interface Boot {
  brand: { title: string; subtitle: string }
  sections: string[]
  currency: string
  defaults: { company: string | null; currency: string; fiscal_year: string | null }
  user: { name: string; full_name: string; email: string; image: string | null; is_desk_user: boolean }
  roles: string[]
  doctypes: PortalDoctype[]
}

export interface ScriptSource {
  doctype: string
  label: string
  code: string
}

export interface MetaBundle {
  config: PortalDoctype
  meta: MetaDict
  children: Record<string, MetaDict>
  perms: Perms
  scripts: ScriptSource[]
}

export interface ListResponse {
  rows: Row[]
  total: number
  page: number
  page_size: number
}

export interface ReportResponse {
  group_by: string | null
  sums?: string[]
  rows: Row[]
}

export interface DashboardResponse {
  cards: {
    doctype: string
    route: string
    plural: string
    icon: string
    draft: number
    submitted: number
    cancelled: number
    amount?: number
    outstanding?: number
  }[]
  recent: { doctype: string; route: string; name: string; title: string | null; modified: string; docstatus: number }[]
}
