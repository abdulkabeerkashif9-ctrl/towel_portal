"""Which doctypes the portal exposes and how it presents them.

The portal UI is metadata driven: forms and lists are rendered from each
doctype's own DocType meta, so this file only holds presentation hints.
Add an entry here (and a route is created automatically) to expose another
doctype.
"""

BRAND = {"title": "Towel Production", "subtitle": "Operations Portal"}

# Custom apps whose doctypes are discovered automatically (see portal_registry.py) and whose
# Desk client scripts (doctype .js files, `doctype_js` hooks) are run inside the portal forms.
PORTAL_APPS = ["emadi_v3", "garments_app_v3", "mjfsd_v3"]

# Sidebar label per module of those apps, and the icon used for it
MODULE_SECTIONS = {
	"Emadiv3": "Weaving (Emadi)",
	"Emadi": "Weaving (Emadi)",
	"Garments App": "Garments",
	"Loom Production": "Loom Production",
	"MJFSD": "MJFSD Weaving",
}
MASTERS_SECTION = "Masters"
SETTINGS_SECTION = "Settings"

# Order of sections in the sidebar
SECTIONS = [
	"Selling",
	"Buying",
	"Stock",
	"Accounting",
	"Weaving (Emadi)",
	"MJFSD Weaving",
	"Loom Production",
	"Garments",
	MASTERS_SECTION,
	SETTINGS_SECTION,
]

# Doctypes that are never exposed even if they live in one of PORTAL_APPS
EXCLUDE = set()

def _party(field, doctype, label):
	return {"party_field": field, "party_doctype": doctype, "party_label": label}


# Hand-tuned presentation for discovered doctypes. Anything not listed here is configured
# automatically from its DocType meta. Keys are merged over the automatic config.
OVERRIDES = {
	# --- Emadi: weaving
	"Weaving Contract": {
		"list_fields": ["name", "weaver", "date", "type", "construction", "fabric_qty", "delivery_date", "custom_status"],
		"date_field": "date",
		"status_field": "custom_status",
		"title_field": "weaver",
		"search_fields": ["weaver", "construction", "sales_order", "erp_doc", "mat_id"],
		"report": {"group_by": "weaver", "sum": ["fabric_qty", "total_yarn", "total_bags"]},
		"dashboard": True,
		**_party("weaver", "Supplier", "All weavers"),
	},
	"Fabric Production": {
		"list_fields": ["name", "posting_date", "quality", "fabric_item", "qty", "target_warehouse"],
		"title_field": "quality",
		"report": {"group_by": "quality", "sum": ["qty"]},
	},
	"Fabric Production Out Side": {
		"list_fields": ["name", "posting_date", "supplier", "quality", "fabric_item", "qty", "amount"],
		"title_field": "supplier",
		"report": {"group_by": "supplier", "sum": ["qty", "amount"]},
		**_party("supplier", "Supplier", "All suppliers"),
	},
	# --- MJFSD / Loom production
	"Sizing Program": {
		"list_fields": ["name", "date", "supplier", "item", "quality", "lbs_issue", "net_meter"],
		"title_field": "supplier",
		"report": {"group_by": "supplier", "sum": ["lbs_issue", "net_meter"]},
		**_party("supplier", "Supplier", "All suppliers"),
	},
	"Sizing Receipt": {
		"list_fields": ["name", "sizing_program", "item", "yarn_item", "beam_no", "lbs", "sizing_amount"],
		"report": {"group_by": "item", "sum": ["lbs", "sizing_amount"]},
	},
	"Weaving Receipt": {
		"list_fields": ["name", "date", "weaver", "total_pcs_received", "total_weight_challan", "total_weight_actual"],
		"report": {"group_by": "weaver", "sum": ["total_pcs_received", "total_weight_actual"]},
		**_party("weaver", "Supplier", "All weavers"),
	},
	"Dyeing Contract": {
		"list_fields": ["name", "date", "supplier", "status", "total_issue_qty", "total_received_qty", "balance_qty"],
		"report": {"group_by": "supplier", "sum": ["total_issue_qty", "total_received_qty", "balance_qty"]},
		**_party("supplier", "Supplier", "All suppliers"),
	},
	"Dyeing Receipt": {
		"list_fields": ["name", "date", "supplier", "source_warehouse", "target_warehouse", "total_received_qty"],
		"report": {"group_by": "supplier", "sum": ["total_received_qty"]},
		**_party("supplier", "Supplier", "All suppliers"),
	},
	"Dyed Fabric Issuance": {
		"list_fields": ["name", "date", "source_warehouse", "target_warehouse", "total_fabric_issued"],
		"report": {"group_by": "target_warehouse", "sum": ["total_fabric_issued"]},
	},
	"Long Hemming": {
		"list_fields": ["name", "date", "supplier", "hemming_rate", "total_fabric_issued", "total_hemming_amount"],
		"report": {"group_by": "supplier", "sum": ["total_fabric_issued", "total_hemming_amount"]},
		**_party("supplier", "Supplier", "All suppliers"),
	},
	"Stitching and Finishing": {
		"list_fields": ["name", "date", "supplier", "department", "total_a_qty", "total_b_qty", "total_qty"],
		"report": {"group_by": "supplier", "sum": ["total_a_qty", "total_b_qty", "total_qty"]},
		**_party("supplier", "Supplier", "All suppliers"),
	},
	"Loom Job": {
		"list_fields": ["name", "date", "customer_name", "item_required", "lbs", "completion_date"],
		"report": {"group_by": "customer_name", "sum": ["lbs"]},
		**_party("customer_name", "Customer", "All customers"),
	},
	"Daily Loom Production": {
		"list_fields": ["name", "date", "shift", "total_finish_qty"],
		"report": {"group_by": "shift", "sum": ["total_finish_qty"]},
	},
	"Loom Production": {
		"list_fields": ["name", "date", "shift", "total_meters", "average_efficiency"],
		"report": {"group_by": "shift", "sum": ["total_meters"]},
	},
	# --- Garments
	"Towel Costing Sheet": {
		"list_fields": ["name", "customer", "customer_order_date", "article", "qty", "total_cost"],
		"title_field": "customer",
		"report": {"group_by": "customer", "sum": ["qty", "total_cost"]},
		**_party("customer", "Customer", "All customers"),
	},
	"Job Costing": {
		"list_fields": ["name", "transaction_date", "buyer", "style", "order_qty", "delivery_date", "total"],
		"title_field": "buyer",
		"report": {"group_by": "buyer", "sum": ["order_qty", "total"]},
		**_party("buyer", "Customer", "All buyers"),
	},
	"Service Order": {
		"list_fields": ["name", "transaction_date", "customer", "total_amount", "received", "delivered", "processed"],
		"report": {"group_by": "customer", "sum": ["total_amount"]},
		**_party("customer", "Customer", "All customers"),
	},
	"Denim Operation": {
		"list_fields": ["name", "posting_date", "finished_item", "finished_qty", "total_cost"],
		"report": {"group_by": "finished_item", "sum": ["finished_qty", "total_cost"]},
	},
	"Sample Form": {
		"list_fields": ["name", "inquiry_date", "buyer_name", "article_no", "style", "order_qty", "sample_type"],
		"report": {"group_by": "buyer_name", "sum": ["order_qty"]},
		**_party("buyer_name", "Customer", "All buyers"),
	},
}

_SELLING_TAXES = {
	"template_field": "taxes_and_charges",
	"template_doctype": "Sales Taxes and Charges Template",
	"table": "taxes",
}
_BUYING_TAXES = {
	"template_field": "taxes_and_charges",
	"template_doctype": "Purchase Taxes and Charges Template",
	"table": "taxes",
}

PORTAL_DOCTYPES = {
	"Sales Invoice": {
		"route": "sales-invoice",
		"plural": "Sales Invoices",
		"icon": "receipt",
		"section": "Selling",
		"date_field": "posting_date",
		"party_field": "customer",
		"party_doctype": "Customer",
		"party_label": "All customers",
		"title_field": "customer_name",
		"status_field": "status",
		"list_fields": ["name", "customer_name", "posting_date", "due_date", "grand_total", "outstanding_amount", "status"],
		"search_fields": ["customer", "customer_name", "po_no"],
		"report": {"group_by": "customer", "sum": ["grand_total", "outstanding_amount"]},
		"kpi": {"amount_field": "grand_total", "outstanding_field": "outstanding_amount"},
		"recalculate": True,
		"item_table": "items",
		"item_details": "erpnext",
		"party_details": {"party_type": "Customer"},
		"taxes": _SELLING_TAXES,
	},
	"Delivery Note": {
		"route": "delivery-note",
		"plural": "Delivery Notes",
		"icon": "truck",
		"section": "Selling",
		"date_field": "posting_date",
		"party_field": "customer",
		"party_doctype": "Customer",
		"party_label": "All customers",
		"title_field": "customer_name",
		"status_field": "status",
		"list_fields": ["name", "customer_name", "posting_date", "status", "grand_total"],
		"search_fields": ["customer", "customer_name", "po_no"],
		"report": {"group_by": "customer", "sum": ["grand_total"]},
		"kpi": {"amount_field": "grand_total"},
		"recalculate": True,
		"item_table": "items",
		"item_details": "erpnext",
		"party_details": {"party_type": "Customer"},
		"taxes": _SELLING_TAXES,
	},
	"Purchase Invoice": {
		"route": "purchase-invoice",
		"plural": "Purchase Invoices",
		"icon": "shopping-cart",
		"section": "Buying",
		"date_field": "posting_date",
		"party_field": "supplier",
		"party_doctype": "Supplier",
		"party_label": "All suppliers",
		"title_field": "supplier_name",
		"status_field": "status",
		"list_fields": ["name", "supplier_name", "posting_date", "due_date", "bill_no", "grand_total", "outstanding_amount", "status"],
		"search_fields": ["supplier", "supplier_name", "bill_no"],
		"report": {"group_by": "supplier", "sum": ["grand_total", "outstanding_amount"]},
		"kpi": {"amount_field": "grand_total", "outstanding_field": "outstanding_amount"},
		"recalculate": True,
		"item_table": "items",
		"item_details": "erpnext",
		"party_details": {"party_type": "Supplier"},
		"taxes": _BUYING_TAXES,
	},
	"Stock Entry": {
		"route": "stock-entry",
		"plural": "Stock Entries",
		"icon": "boxes",
		"section": "Stock",
		"date_field": "posting_date",
		"title_field": "stock_entry_type",
		"list_fields": ["name", "stock_entry_type", "posting_date", "from_warehouse", "to_warehouse", "total_amount"],
		"search_fields": ["stock_entry_type", "from_warehouse", "to_warehouse", "remarks"],
		"report": {"group_by": "stock_entry_type", "sum": ["total_amount"]},
		"kpi": {"amount_field": "total_amount"},
		"item_table": "items",
		"item_details": "basic",
	},
	"Payment Entry": {
		"route": "payment-entry",
		"plural": "Payment Entries",
		"icon": "banknote",
		"section": "Accounting",
		"date_field": "posting_date",
		"party_field": "party",
		"party_doctype": None,  # party_type varies per document
		"party_label": "All parties",
		"title_field": "party_name",
		"status_field": "status",
		"list_fields": ["name", "payment_type", "party_name", "posting_date", "mode_of_payment", "paid_amount", "status"],
		"search_fields": ["party", "party_name", "reference_no"],
		"report": {"group_by": "party", "sum": ["paid_amount"]},
		"kpi": {"amount_field": "paid_amount"},
	},
	"Journal Entry": {
		"route": "journal-entry",
		"plural": "Journal Entries",
		"icon": "book-open",
		"section": "Accounting",
		"date_field": "posting_date",
		"title_field": "title",
		"list_fields": ["name", "voucher_type", "title", "posting_date", "total_debit", "total_credit"],
		"search_fields": ["title", "user_remark", "cheque_no"],
		"report": {"group_by": "voucher_type", "sum": ["total_debit", "total_credit"]},
		"kpi": {"amount_field": "total_debit"},
	},
	"Sales Order": {
		"route": "sales-order",
		"plural": "Sales Orders",
		"icon": "clipboard-list",
		"section": "Selling",
		"date_field": "transaction_date",
		"party_field": "customer",
		"party_doctype": "Customer",
		"party_label": "All customers",
		"title_field": "customer_name",
		"status_field": "status",
		"list_fields": ["name", "customer_name", "transaction_date", "delivery_date", "grand_total", "per_delivered", "status"],
		"search_fields": ["customer", "customer_name", "po_no"],
		"report": {"group_by": "customer", "sum": ["grand_total"]},
		"kpi": {"amount_field": "grand_total"},
		"recalculate": True,
		"item_table": "items",
		"item_details": "erpnext",
		"party_details": {"party_type": "Customer"},
		"taxes": _SELLING_TAXES,
	},
	"Purchase Order": {
		"route": "purchase-order",
		"plural": "Purchase Orders",
		"icon": "clipboard-list",
		"section": "Buying",
		"date_field": "transaction_date",
		"party_field": "supplier",
		"party_doctype": "Supplier",
		"party_label": "All suppliers",
		"title_field": "supplier_name",
		"status_field": "status",
		"list_fields": ["name", "supplier_name", "transaction_date", "schedule_date", "grand_total", "per_received", "status"],
		"search_fields": ["supplier", "supplier_name"],
		"report": {"group_by": "supplier", "sum": ["grand_total"]},
		"kpi": {"amount_field": "grand_total"},
		"recalculate": True,
		"item_table": "items",
		"item_details": "erpnext",
		"party_details": {"party_type": "Supplier"},
		"taxes": _BUYING_TAXES,
	},
	"Material Request": {
		"route": "material-request",
		"plural": "Material Requests",
		"icon": "boxes",
		"section": "Stock",
		"date_field": "transaction_date",
		"title_field": "material_request_type",
		"status_field": "status",
		"list_fields": ["name", "material_request_type", "transaction_date", "schedule_date", "per_ordered", "status"],
		"search_fields": ["material_request_type", "set_warehouse"],
		"item_table": "items",
		"item_details": "basic",
	},
	"Item": {
		"route": "item",
		"plural": "Items",
		"icon": "package",
		"section": "Masters",
		"title_field": "item_name",
		"list_fields": ["name", "item_name", "item_group", "stock_uom", "disabled"],
		"search_fields": ["item_name", "item_group", "description"],
		"report": {"group_by": "item_group", "sum": []},
	},
	"Customer": {
		"route": "customer",
		"plural": "Customers",
		"icon": "users",
		"section": "Masters",
		"title_field": "customer_name",
		"list_fields": ["name", "customer_name", "customer_group", "territory", "mobile_no"],
		"search_fields": ["customer_name", "mobile_no"],
		"report": {"group_by": "customer_group", "sum": []},
	},
	"Supplier": {
		"route": "supplier",
		"plural": "Suppliers",
		"icon": "users",
		"section": "Masters",
		"title_field": "supplier_name",
		"list_fields": ["name", "supplier_name", "supplier_group", "country", "mobile_no"],
		"search_fields": ["supplier_name", "mobile_no"],
		"report": {"group_by": "supplier_group", "sum": []},
	},
}
