"""Which doctypes the portal exposes and how it presents them.

The portal UI is metadata driven: forms and lists are rendered from each
doctype's own DocType meta, so this file only holds presentation hints.
Add an entry here (and a route is created automatically) to expose another
doctype.
"""

BRAND = {"title": "Towel Production", "subtitle": "Operations Portal"}

# Order of sections in the sidebar
SECTIONS = ["Selling", "Buying", "Stock", "Accounting"]

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
}
