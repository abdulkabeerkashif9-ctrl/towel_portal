# Towel Portal

A modern React + shadcn/ui front end for ERPNext. It runs next to Desk (`/app`) as a separate Frappe app and
talks to ERPNext through a small whitelisted API, so permissions, workflows, stock and accounts logic all stay in
ERPNext. **Open Desk** in the user menu links back to the standard UI.

Pages (all under `/portal`): Dashboard, Sales/Purchase documents, Stock Entry, Payment/Journal Entry, Page Access,
plus a page for every doctype in the custom apps listed in `PORTAL_APPS` (`emadi_v3`, `garments_app_v3`,
`mjfsd_v3`): lists, report view and forms with the same behaviour as in Desk.

## Install

```bash
bench get-app https://github.com/abdulkabeerkashif9-ctrl/towel_portal.git
bench --site <site> install-app towel_portal
bench --site <site> migrate
```

Open `https://<site>/portal`. The compiled front end is committed (`towel_portal/public/frontend`,
`towel_portal/www/portal.html`), so no Node is needed on the server.

## How it works

- **Metadata driven.** Lists and forms are rendered from each doctype's own DocType meta (sections, columns, tabs,
  `depends_on`, `read_only_depends_on`, `mandatory_depends_on`, `fetch_from`, child tables), so a custom field you add
  in Desk shows up in the portal with no code.
- **Server stays the source of truth.** On every change the form posts the unsaved document to `recalculate`, which
  runs ERPNext's own `set_missing_values` / `calculate_taxes_and_totals`. Item rows use
  `erpnext.stock.get_item_details`; tax templates use `get_taxes_and_charges`.
- **Permissions.** Every endpoint in `towel_portal/api/portal.py` uses Frappe permission checks, and only doctypes
  listed in `towel_portal/portal_config.py` are reachable.

## Your apps' forms (Emadi, Garments, MJFSD)

- **Discovered automatically.** Every non-child doctype in the modules of `PORTAL_APPS` gets a sidebar entry, a
  list/report view and a form, configured from its DocType meta (`portal_registry.py`). Fine-tune columns, party
  filter and report grouping in `OVERRIDES` (`portal_config.py`).
- **Their Desk scripts run unchanged.** The portal loads each doctype's own `.js` file, the `doctype_js` hooks of
  those apps and enabled *Client Script* records, and runs them against a small `frappe`/`frm` compatibility layer
  (`frontend/src/compat`). Supported: `frappe.ui.form.on` (field, child-row, `refresh`, `validate`, `before_save`,
  `on_submit`, `*_add`/`*_remove` ...), `frm.set_value`, `frappe.model.set_value`, `add_child`, `clear_table`,
  `set_query` (filters and custom query methods), `set_df_property`, `toggle_display/reqd/enable`,
  `add_custom_button` (including groups and colours), `frappe.call`/`frm.call`, `frappe.ui.Dialog` (including HTML
  and MultiCheck fields with jQuery), `frappe.prompt`/`confirm`/`msgprint`/`throw`, `frappe.new_doc`,
  `frappe.set_route`, `frappe.model.sync` + `open_mapped_doc`, `frappe.db.*`.
- **Anything else is a no-op, not a crash.** Unsupported Desk APIs (dashboard banners, page menus ...) are ignored and
  logged at debug level in the browser console.

## Add or change a page

Edit `towel_portal/portal_config.py`: add a doctype entry (route, list columns, search fields, report grouping)
and it appears in the sidebar, command palette, dashboard and Page Access automatically. Brand name/subtitle are in
the same file.

## Front-end development

```bash
cd frontend
npm install
cp .env.example .env.local        # point at your bench
npm run dev                       # http://localhost:5173 (log in at /login on this origin)

# or, without a bench, against fake data:
npm run mock                      # in one terminal
npm run dev                       # in another

# the mock can also load the real doctypes and Desk scripts of your apps:
PORTAL_APP_ROOTS=/path/emadi_v3:/path/garments_app_v3:/path/mjfsd_v3 npm run mock

npm run build                     # writes public/frontend and www/portal.html — commit the result
```

## Known gaps

- ERPNext's own form controllers are not run (only your apps' scripts and Client Scripts are). Standard doctypes get
  totals, taxes and party defaults from the server (`recalculate`), but Desk-only helpers such as "Get Items From"
  or "Get Outstanding Invoices" are not available. Per-form link filters that ERPNext's JS sets (for example
  warehouses filtered by company) are not replicated.
- Scripts that manipulate the Desk page itself (`$('input[data-fieldname=...]')` colouring, `frm.page`, grid internals,
  `frm.dashboard`) have no effect. Query reports and script reports of the apps are not ported.
- Attach, Code, Signature, Geolocation and Table MultiSelect fields are not rendered.
- The backend API has been written against Frappe v15 / ERPNext v15 but not yet run against a live site; the UI was
  exercised against the mock server only.
