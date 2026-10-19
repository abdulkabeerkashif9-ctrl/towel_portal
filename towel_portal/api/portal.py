"""Whitelisted API used by the portal frontend.

Every method re-checks Frappe permissions, so the portal can never do more
than the logged-in user could do in Desk. Only doctypes listed in
``towel_portal.portal_config.PORTAL_DOCTYPES`` or discovered from ``PORTAL_APPS`` (portal_registry) are reachable.
"""

import frappe
import frappe.sessions
from frappe import _
from frappe.utils import cint, flt

from towel_portal.portal_config import BRAND, PORTAL_APPS, PORTAL_DOCTYPES, SECTIONS
from towel_portal.portal_registry import get_registry

PERM_TYPES = ("read", "write", "create", "submit", "cancel", "delete")
STANDARD_FIELDS = {"name", "owner", "creation", "modified", "modified_by", "docstatus", "idx"}
FIELD_KEYS = (
	"fieldname",
	"label",
	"fieldtype",
	"options",
	"reqd",
	"read_only",
	"hidden",
	"default",
	"depends_on",
	"mandatory_depends_on",
	"read_only_depends_on",
	"fetch_from",
	"in_list_view",
	"in_standard_filter",
	"description",
	"precision",
	"allow_on_submit",
	"collapsible",
	"set_only_once",
	"bold",
	"columns",
	"no_copy",
)
ALLOWED_RECALC_METHODS = ("set_missing_values", "calculate_taxes_and_totals")


# ---------------------------------------------------------------- helpers


def _cfg(doctype):
	cfg = get_registry().get(doctype)
	if not cfg:
		frappe.throw(_("{0} is not available in the portal").format(doctype), frappe.PermissionError)
	return cfg


def _perms(doctype):
	return {ptype: bool(frappe.has_permission(doctype, ptype)) for ptype in PERM_TYPES}


def _default_currency():
	company = frappe.defaults.get_user_default("Company") or frappe.db.get_single_value(
		"Global Defaults", "default_company"
	)
	currency = company and frappe.db.get_value("Company", company, "default_currency")
	return currency or frappe.db.get_default("currency") or "USD"


def _valid_field(meta, fieldname):
	return fieldname in STANDARD_FIELDS or bool(meta.has_field(fieldname))


def _public_config(doctype, cfg):
	meta = frappe.get_meta(doctype)
	out = {k: v for k, v in cfg.items()}
	out["doctype"] = doctype
	# drop references to fields this site's doctype doesn't have (customised or older versions)
	out["list_fields"] = [f for f in cfg.get("list_fields", []) if _valid_field(meta, f)]
	for key in ("date_field", "party_field", "status_field", "title_field"):
		if out.get(key) and not _valid_field(meta, out[key]):
			out[key] = None
	if out.get("report") and not meta.has_field(out["report"]["group_by"]):
		out["report"] = None
	out["is_submittable"] = cint(meta.is_submittable)
	return out


def _meta_dict(doctype):
	meta = frappe.get_meta(doctype)
	return {
		"name": doctype,
		"title_field": meta.title_field,
		"is_submittable": cint(meta.is_submittable),
		"istable": cint(meta.istable),
		"fields": [{key: df.get(key) for key in FIELD_KEYS} for df in meta.fields],
	}


def _build_filters(doctype, cfg, meta, params):
	filters = []
	date_field = cfg.get("date_field")
	if date_field and params.get("from_date"):
		filters.append([doctype, date_field, ">=", params["from_date"]])
	if date_field and params.get("to_date"):
		filters.append([doctype, date_field, "<=", params["to_date"]])
	party_field = cfg.get("party_field")
	if party_field and params.get("party"):
		filters.append([doctype, party_field, "=", params["party"]])
	if params.get("docstatus") in (0, 1, 2, "0", "1", "2"):
		filters.append([doctype, "docstatus", "=", cint(params["docstatus"])])

	or_filters = []
	search = (params.get("search") or "").strip()
	if search:
		like = f"%{search}%"
		or_filters.append([doctype, "name", "like", like])
		for fieldname in cfg.get("search_fields", []):
			if meta.has_field(fieldname):
				or_filters.append([doctype, fieldname, "like", like])
	return filters, or_filters


def _order_by(doctype, meta, order_by):
	field, direction = "modified", "desc"
	if order_by:
		parts = str(order_by).split()
		if parts and _valid_field(meta, parts[0]):
			field = parts[0]
		if len(parts) > 1 and parts[1].lower() in ("asc", "desc"):
			direction = parts[1].lower()
	return f"`tab{doctype}`.`{field}` {direction}"


# ---------------------------------------------------------- client scripts


def _read(path):
	try:
		with open(path, encoding="utf-8") as f:
			return f.read()
	except OSError:
		return ""


def _client_scripts(doctypes):
	"""Desk client scripts for these doctypes, run by the portal's compatibility layer.

	Only scripts that belong to this site's custom apps are sent (a doctype's own .js file, `doctype_js`
	hooks and enabled Client Script records). ERPNext's own form controllers are intentionally left out;
	the portal reimplements that behaviour server side (see `recalculate`).
	"""
	scripts = []
	for doctype in doctypes:
		meta = frappe.get_meta(doctype)
		module_app = frappe.local.module_app.get(frappe.scrub(meta.module or ""))
		if module_app in PORTAL_APPS and not meta.custom:
			name = frappe.scrub(doctype)
			code = _read(frappe.get_module_path(meta.module, "doctype", name, name + ".js"))
			if code.strip():
				scripts.append({"doctype": doctype, "label": f"{module_app}/{name}.js", "code": code})

		for app in PORTAL_APPS:
			if app not in frappe.get_installed_apps():
				continue
			for rel in frappe.get_hooks("doctype_js", app_name=app).get(doctype, []):
				code = _read(frappe.get_app_path(app, *rel.strip("/").split("/")))
				if code.strip():
					scripts.append({"doctype": doctype, "label": f"{app}/{rel}", "code": code})

		for row in frappe.get_all(
			"Client Script",
			filters={"dt": doctype, "enabled": 1, "view": "Form"},
			fields=["name", "script"],
		):
			if (row.script or "").strip():
				scripts.append({"doctype": doctype, "label": f"Client Script: {row.name}", "code": row.script})
	return scripts


# ------------------------------------------------------------------- boot


@frappe.whitelist()
def get_csrf_token():
	"""Used by the dev server, where the page is not rendered by Frappe."""
	return frappe.sessions.get_csrf_token()


@frappe.whitelist()
def get_boot():
	user = frappe.get_cached_doc("User", frappe.session.user)
	doctypes = []
	for doctype, cfg in get_registry().items():
		if not frappe.db.exists("DocType", doctype):
			continue  # app not installed (e.g. ERPNext modules disabled)
		doctypes.append({**_public_config(doctype, cfg), "perms": _perms(doctype)})

	return {
		"brand": BRAND,
		"sections": SECTIONS,
		"currency": _default_currency(),
		"defaults": {
			"company": frappe.defaults.get_user_default("Company"),
			"currency": _default_currency(),
			"fiscal_year": frappe.defaults.get_user_default("fiscal_year"),
		},
		"user": {
			"name": user.name,
			"full_name": user.full_name,
			"email": user.email,
			"image": user.user_image,
			"is_desk_user": user.user_type == "System User",
		},
		"roles": frappe.get_roles(),
		"doctypes": doctypes,
	}


@frappe.whitelist()
def change_password(old_password, new_password):
	from frappe.utils.password import check_password, update_password

	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	check_password(user, old_password)
	if len(new_password or "") < 8:
		frappe.throw(_("New password must be at least 8 characters"))
	update_password(user, new_password)
	return True


# ------------------------------------------------------------------- meta


@frappe.whitelist()
def get_doctype_meta(doctype):
	cfg = _cfg(doctype)
	frappe.has_permission(doctype, "read", throw=True)
	meta = _meta_dict(doctype)
	children = {}
	for df in meta["fields"]:
		if df["fieldtype"] in ("Table", "Table MultiSelect") and df["options"]:
			children[df["options"]] = _meta_dict(df["options"])
	return {
		"config": _public_config(doctype, cfg),
		"meta": meta,
		"children": children,
		"perms": _perms(doctype),
		"scripts": _client_scripts([doctype, *children]),
	}


# ------------------------------------------------------------------- list


@frappe.whitelist()
def get_list(
	doctype,
	search=None,
	from_date=None,
	to_date=None,
	party=None,
	docstatus=None,
	order_by=None,
	page=1,
	page_size=20,
):
	cfg = _cfg(doctype)
	frappe.has_permission(doctype, "read", throw=True)
	meta = frappe.get_meta(doctype)

	params = {
		"search": search,
		"from_date": from_date,
		"to_date": to_date,
		"party": party,
		"docstatus": docstatus,
	}
	filters, or_filters = _build_filters(doctype, cfg, meta, params)

	page_size = min(max(cint(page_size) or 20, 1), 500)
	page = max(cint(page) or 1, 1)

	fields = [f for f in cfg["list_fields"] if _valid_field(meta, f)]
	for extra in ("docstatus", "modified", "currency"):
		if extra not in fields and _valid_field(meta, extra):
			fields.append(extra)

	rows = frappe.get_list(
		doctype,
		fields=fields,
		filters=filters,
		or_filters=or_filters,
		order_by=_order_by(doctype, meta, order_by),
		limit_start=(page - 1) * page_size,
		limit_page_length=page_size,
	)
	total = frappe.get_list(
		doctype,
		fields=["count(name) as total"],
		filters=filters,
		or_filters=or_filters,
	)[0]["total"]

	return {"rows": rows, "total": cint(total), "page": page, "page_size": page_size}


@frappe.whitelist()
def get_report(doctype, search=None, from_date=None, to_date=None, party=None, docstatus=None):
	"""Totals grouped by the doctype's `report.group_by` field."""
	cfg = _cfg(doctype)
	frappe.has_permission(doctype, "read", throw=True)
	report = cfg.get("report")
	if not report:
		return {"group_by": None, "columns": [], "rows": []}

	meta = frappe.get_meta(doctype)
	group_by = report["group_by"]
	sums = [f for f in report["sum"] if meta.has_field(f)]
	params = {
		"search": search,
		"from_date": from_date,
		"to_date": to_date,
		"party": party,
		"docstatus": docstatus,
	}
	filters, or_filters = _build_filters(doctype, cfg, meta, params)
	if docstatus in (None, ""):
		filters.append([doctype, "docstatus", "<", 2])  # exclude cancelled by default

	fields = [group_by, "count(name) as count"] + [f"sum({f}) as {f}" for f in sums]
	rows = frappe.get_list(
		doctype,
		fields=fields,
		filters=filters,
		or_filters=or_filters,
		group_by=group_by,
		limit_page_length=0,
	)
	if sums:
		rows.sort(key=lambda r: flt(r.get(sums[0])), reverse=True)
	return {"group_by": group_by, "sums": sums, "rows": rows}


@frappe.whitelist()
def get_dashboard():
	cards, recent = [], []
	for doctype, cfg in get_registry().items():
		if doctype not in PORTAL_DOCTYPES and not cfg.get("dashboard"):
			continue  # keep the dashboard to a handful of cards; mark others with "dashboard": True
		if not frappe.db.exists("DocType", doctype) or not frappe.has_permission(doctype, "read"):
			continue
		meta = frappe.get_meta(doctype)

		counts = {0: 0, 1: 0, 2: 0}
		for row in frappe.get_list(
			doctype, fields=["docstatus", "count(name) as count"], group_by="docstatus", limit_page_length=0
		):
			counts[cint(row["docstatus"])] = cint(row["count"])

		card = {
			"doctype": doctype,
			"route": cfg["route"],
			"plural": cfg["plural"],
			"icon": cfg["icon"],
			"draft": counts[0],
			"submitted": counts[1],
			"cancelled": counts[2],
		}
		kpi = cfg.get("kpi", {})
		for key in ("amount_field", "outstanding_field"):
			fieldname = kpi.get(key)
			if fieldname and meta.has_field(fieldname):
				total = frappe.get_list(
					doctype,
					fields=[f"sum({fieldname}) as total"],
					filters=[[doctype, "docstatus", "=", 1]],
				)[0]["total"]
				card[key.replace("_field", "")] = flt(total)
		cards.append(card)

		title_field = cfg.get("title_field")
		fields = ["name", "modified", "docstatus"] + ([title_field] if title_field and meta.has_field(title_field) else [])
		for row in frappe.get_list(doctype, fields=fields, order_by="modified desc", limit_page_length=5):
			recent.append(
				{
					"doctype": doctype,
					"route": cfg["route"],
					"name": row["name"],
					"title": row.get(title_field) if title_field else None,
					"modified": str(row["modified"]),
					"docstatus": cint(row["docstatus"]),
				}
			)

	recent.sort(key=lambda r: r["modified"], reverse=True)
	return {"cards": cards, "recent": recent[:8]}


# -------------------------------------------------------------- documents


@frappe.whitelist()
def get_new_doc(doctype):
	_cfg(doctype)
	frappe.has_permission(doctype, "create", throw=True)
	doc = frappe.new_doc(doctype)
	doc.run_method("onload")
	return doc.as_dict(convert_dates_to_str=True)


@frappe.whitelist()
def get_doc(doctype, name):
	_cfg(doctype)
	doc = frappe.get_doc(doctype) if frappe.get_meta(doctype).issingle else frappe.get_doc(doctype, name)
	doc.check_permission("read")
	doc.run_method("onload")
	return {
		"doc": doc.as_dict(convert_dates_to_str=True),
		"perms": {ptype: bool(doc.has_permission(ptype)) for ptype in PERM_TYPES},
	}


@frappe.whitelist(methods=["POST"])
def save_doc(doc):
	data = frappe.parse_json(doc)
	doctype = data.get("doctype")
	_cfg(doctype)

	name = data.get("name")
	is_new = cint(data.get("__islocal")) or not name or str(name).startswith("new-")
	if is_new:
		data.pop("name", None)
		data.pop("__islocal", None)
		saved = frappe.get_doc(data)
		saved.insert()
	else:
		saved = frappe.get_doc(data)
		saved.save()  # raises TimestampMismatchError if someone else saved first

	return saved.as_dict(convert_dates_to_str=True)


@frappe.whitelist(methods=["POST"])
def submit_doc(doctype, name):
	_cfg(doctype)
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("submit")
	doc.submit()
	return doc.as_dict(convert_dates_to_str=True)


@frappe.whitelist(methods=["POST"])
def cancel_doc(doctype, name):
	_cfg(doctype)
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("cancel")
	doc.cancel()
	return doc.as_dict(convert_dates_to_str=True)


@frappe.whitelist(methods=["POST"])
def delete_doc(doctype, name):
	_cfg(doctype)
	frappe.delete_doc(doctype, name)
	return True


@frappe.whitelist()
def search_link(doctype, txt="", filters=None, query=None, page_length=10):
	"""Autocomplete for Link fields (same engine Desk uses, so link permissions apply).

	`query` is the optional custom search method a client script's ``set_query`` returned.
	"""
	from frappe.desk.search import build_for_autosuggest, search_widget

	results = search_widget(
		doctype,
		(txt or "").strip(),
		query=query or None,
		filters=frappe.parse_json(filters) if filters else None,
		page_length=min(cint(page_length) or 10, 50),
	)
	return build_for_autosuggest(results, doctype=doctype)


# ------------------------------------------------------- form interactions


@frappe.whitelist(methods=["POST"])
def recalculate(doc):
	"""Run the server side controllers on an unsaved document.

	This is what keeps totals, taxes and party defaults consistent with Desk
	without re-implementing ERPNext's client scripts in the portal.
	"""
	data = frappe.parse_json(doc)
	doctype = data.get("doctype")
	_cfg(doctype)
	frappe.has_permission(doctype, "read", throw=True)

	data.pop("__islocal", None)
	unsaved = frappe.get_doc(data)
	for method in ALLOWED_RECALC_METHODS:
		if hasattr(unsaved, method):
			unsaved.run_method(method)
	return unsaved.as_dict(convert_dates_to_str=True)


@frappe.whitelist()
def get_item_details(doctype, item_code, doc=None, qty=1):
	"""Defaults for a new item row (rate, uom, accounts, warehouse...)."""
	cfg = _cfg(doctype)
	frappe.has_permission("Item", "read", throw=True)

	basic = frappe.db.get_value(
		"Item", item_code, ["item_name", "description", "stock_uom"], as_dict=True
	) or {}
	details = {
		**basic,
		"uom": basic.get("stock_uom"),
		"conversion_factor": 1,
		"qty": flt(qty) or 1,
	}
	if cfg.get("item_details") != "erpnext":
		details["transfer_qty"] = details["qty"]
		return details

	data = frappe.parse_json(doc) if doc else {}
	from erpnext.stock.get_item_details import get_item_details as erpnext_item_details

	args = frappe._dict(
		doctype=doctype,
		item_code=item_code,
		qty=flt(qty) or 1,
		company=data.get("company"),
		customer=data.get("customer"),
		supplier=data.get("supplier"),
		currency=data.get("currency"),
		conversion_rate=flt(data.get("conversion_rate")) or 1,
		price_list=data.get("selling_price_list") or data.get("buying_price_list"),
		price_list_currency=data.get("price_list_currency"),
		plc_conversion_rate=flt(data.get("plc_conversion_rate")) or 1,
		transaction_date=data.get("posting_date") or data.get("transaction_date"),
		posting_date=data.get("posting_date"),
		update_stock=cint(data.get("update_stock")),
		set_warehouse=data.get("set_warehouse"),
		ignore_pricing_rule=cint(data.get("ignore_pricing_rule")),
		is_return=cint(data.get("is_return")),
	)
	return {**details, **(erpnext_item_details(args) or {})}
