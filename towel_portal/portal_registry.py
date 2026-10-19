"""Builds the full list of portal doctypes.

Explicit entries come from ``portal_config.PORTAL_DOCTYPES``. Every non-child doctype that belongs to
one of ``PORTAL_APPS`` is added automatically from its DocType meta, so new doctypes in those apps
show up in the portal without touching this app.
"""

import frappe
from frappe.utils import cint

from towel_portal.portal_config import (
	EXCLUDE,
	MASTERS_SECTION,
	MODULE_SECTIONS,
	OVERRIDES,
	PORTAL_APPS,
	PORTAL_DOCTYPES,
	SETTINGS_SECTION,
)

# Field types that make a poor list column
NO_COLUMN = {
	"Section Break", "Column Break", "Tab Break", "Table", "Table MultiSelect", "HTML", "Button", "Text",
	"Small Text", "Long Text", "Text Editor", "Markdown Editor", "HTML Editor", "Code", "Attach", "Attach Image",
	"Heading", "Image", "Check", "Geolocation", "Signature", "JSON", "Password", "Read Only",
}
NUMERIC = ("Currency", "Float", "Int", "Percent")
SKIP_FIELDS = {"amended_from", "naming_series", "company"}
AMOUNT_WORDS = ("grand_total", "total_amount", "total", "amount", "net_total", "qty", "weight", "bags", "pieces")


def get_registry():
	"""Per-request cached registry: {doctype: config}."""
	cached = getattr(frappe.local, "portal_registry", None)
	if cached is not None:
		return cached

	registry = {dt: dict(cfg) for dt, cfg in PORTAL_DOCTYPES.items()}
	installed = set(frappe.get_installed_apps())
	for app in PORTAL_APPS:
		if app not in installed:
			continue
		for module in frappe.get_module_list(app):
			rows = frappe.get_all(
				"DocType",
				filters={"module": module, "istable": 0, "custom": 0},
				fields=["name", "issingle", "is_submittable"],
				order_by="name",
			)
			for row in rows:
				if row.name in registry or row.name in EXCLUDE:
					continue
				registry[row.name] = {**_auto_config(row.name, module), **OVERRIDES.get(row.name, {})}

	for doctype, override in OVERRIDES.items():
		if doctype in registry:
			registry[doctype] = {**registry[doctype], **override}

	frappe.local.portal_registry = registry
	return registry


def _plural(name):
	if name.endswith("y") and name[-2:-1] not in "aeiou":
		return name[:-1] + "ies"
	if name.endswith(("s", "x", "ch", "sh")):
		return name + "es"
	return name + "s"


def _auto_config(doctype, module):
	meta = frappe.get_meta(doctype)
	fields = [f for f in meta.fields if not f.hidden]
	by_name = {f.fieldname: f for f in meta.fields}

	columns = [f for f in fields if f.in_list_view and f.fieldtype not in NO_COLUMN and f.fieldname not in SKIP_FIELDS]
	if len(columns) < 3:
		simple = [
			f for f in fields
			if f.fieldtype not in NO_COLUMN and f.fieldname not in SKIP_FIELDS and f not in columns
		]
		# required fields first, then the order they appear in the form
		simple.sort(key=lambda f: 0 if f.reqd else 1)
		columns += simple[: 5 - len(columns)]
	columns = columns[:6]

	date_field = next((f.fieldname for f in meta.fields if f.fieldtype == "Date" and "date" in f.fieldname), None)
	date_field = date_field or next((f.fieldname for f in meta.fields if f.fieldtype == "Date"), None)
	if date_field and date_field not in [c.fieldname for c in columns]:
		columns.insert(1, by_name[date_field])

	party = next((f for f in fields if f.fieldtype == "Link" and f.options in ("Customer", "Supplier")), None)
	status_field = "status" if "status" in by_name and by_name["status"].fieldtype == "Select" else None
	if status_field and status_field not in [c.fieldname for c in columns]:
		columns.append(by_name[status_field])

	title_field = meta.title_field or (party.fieldname if party else None)
	if not title_field:
		first = next((f for f in fields if f.fieldtype in ("Data", "Link") and f.reqd), None)
		title_field = first.fieldname if first else None

	search = [s.strip() for s in (meta.search_fields or "").split(",") if s.strip()]
	search += [f.fieldname for f in fields if f.in_standard_filter and f.fieldtype in ("Data", "Link")]
	search += [c.fieldname for c in columns if c.fieldtype in ("Data", "Link")]
	search = list(dict.fromkeys(s for s in search if s in by_name))[:6]

	list_fields = ["name"] + [c.fieldname for c in columns if c.fieldname != "name"]

	numeric = [f.fieldname for f in meta.fields if f.fieldtype in NUMERIC and f.fieldname in by_name]
	sums = [n for n in numeric if any(w in n for w in AMOUNT_WORDS)][:2]
	group_by = party.fieldname if party else next(
		(f.fieldname for f in fields if f.fieldtype == "Link" and f.fieldname not in SKIP_FIELDS | {"amended_from"}),
		None,
	)

	is_single = cint(meta.issingle)
	section = SETTINGS_SECTION if is_single else (
		MASTERS_SECTION if not cint(meta.is_submittable) else MODULE_SECTIONS.get(module, module)
	)

	cfg = {
		"route": frappe.scrub(doctype).replace("_", "-"),
		"plural": _plural(doctype),
		"icon": "settings" if is_single else ("file-text" if cint(meta.is_submittable) else "database"),
		"section": section,
		"module": module,
		"title_field": title_field,
		"list_fields": list_fields,
		"search_fields": search,
		"is_single": bool(is_single),
	}
	if date_field:
		cfg["date_field"] = date_field
	if status_field:
		cfg["status_field"] = status_field
	if party:
		cfg.update(
			party_field=party.fieldname,
			party_doctype=party.options,
			party_label=f"All {party.options.lower()}s",
		)
	if group_by and not is_single:
		cfg["report"] = {"group_by": group_by, "sum": sums}
	if sums:
		cfg["kpi"] = {"amount_field": sums[0]}
	return cfg
