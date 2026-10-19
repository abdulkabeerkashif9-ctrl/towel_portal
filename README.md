# Towel Portal

A modern React + shadcn/ui front end for ERPNext. It runs next to Desk (`/app`) as a separate Frappe app and
talks to ERPNext through a small whitelisted API, so permissions, workflows, stock and accounts logic all stay in
ERPNext. **Open Desk** in the user menu links back to the standard UI.

Pages (all under `/portal`): Dashboard, Sales Invoice, Delivery Note, Purchase Invoice, Stock Entry,
Payment Entry, Journal Entry, Page Access.

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

npm run build                     # writes public/frontend and www/portal.html — commit the result
```

## Known gaps

- Link fields use Frappe's standard search; per-form `set_query` filters from Desk client scripts (for example
  warehouses filtered by company) are not replicated.
- Payment Entry and Journal Entry use the generic form; Desk-only helpers such as "Get Outstanding Invoices" are not
  ported yet. Custom client scripts in other apps (such as `emadi_v3`'s `dn.js`) do not run in the portal.
- Attach, Code, Signature, Geolocation and Table MultiSelect fields are not rendered.
- The backend API has been written against Frappe v15 / ERPNext v15 but not yet run against a live site; the UI was
  exercised against the mock server only.
