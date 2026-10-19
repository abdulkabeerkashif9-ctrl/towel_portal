import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, ExternalLink, Save, Send, Trash2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { call } from "@/lib/api"
import { defaultFor, findMissing, itemDefaults, mergeServerDoc } from "@/lib/doc"
import { DOCSTATUS_LABEL, toneFor } from "@/lib/format"
import type { MetaBundle, Perms, PortalDoctype, Row } from "@/lib/types"
import { useBoot, useMeta } from "@/hooks/data"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { FormLayout, type FormApi } from "@/components/form/FormLayout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export function FormPage() {
  const { route = "", name = "new" } = useParams()
  const cfg = useBoot().doctypes.find((d) => d.route === route)
  if (!cfg || !cfg.perms.read) return <div className="py-20 text-center text-muted-foreground">Page not found or not permitted.</div>
  return <DocLoader key={`${route}/${name}`} cfg={cfg} name={name} />
}

function DocLoader({ cfg, name }: { cfg: PortalDoctype; name: string }) {
  const metaQ = useMeta(cfg.doctype)
  const isNew = name === "new"
  const docQ = useQuery({
    queryKey: ["doc", cfg.doctype, name],
    queryFn: (): Promise<{ doc: Row; perms?: Perms }> =>
      isNew ? call<Row>("get_new_doc", { doctype: cfg.doctype }).then((doc) => ({ doc })) : call<{ doc: Row; perms: Perms }>("get_doc", { doctype: cfg.doctype, name }),
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })

  const error = metaQ.error ?? docQ.error
  if (error) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="font-medium">Couldn’t open {isNew ? `new ${cfg.doctype}` : name}</p>
        <p className="mt-1 text-sm text-muted-foreground">{(error as Error).message}</p>
        <Button asChild variant="outline" className="mt-4"><Link to={`/${cfg.route}`}>Back to {cfg.plural}</Link></Button>
      </div>
    )
  }
  if (!metaQ.data || !docQ.data) return <div className="space-y-4"><Skeleton className="h-9 w-64" /><Skeleton className="h-64 w-full" /><Skeleton className="h-48 w-full" /></div>

  const perms = docQ.data.perms ?? { ...metaQ.data.perms, write: metaQ.data.perms.create }
  return <DocEditor cfg={cfg} bundle={metaQ.data} initial={docQ.data.doc} perms={perms} isNew={isNew} />
}

function DocEditor({ cfg, bundle, initial, perms, isNew }: { cfg: PortalDoctype; bundle: MetaBundle; initial: Row; perms: Perms; isNew: boolean }) {
  const { roles } = useBoot()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [doc, setDoc] = useState<Row>(initial)
  const [dirty, setDirty] = useState(isNew)
  const [errors, setErrors] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<null | "submit" | "cancel" | "delete">(null)

  const docRef = useRef(doc)
  const version = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const bundleRef = useRef(bundle)
  bundleRef.current = bundle

  // ---------------------------------------------------------------- state helpers
  const replace = (next: Row, markDirty = true) => {
    docRef.current = next
    setDoc(next)
    if (markDirty) { version.current++; setDirty(true); setErrors(new Set()) }
  }

  const recalc = useCallback(async () => {
    const snapshot = docRef.current
    const sent = version.current
    if (!cfg.recalculate || !cfg.item_table || !(snapshot[cfg.item_table] ?? []).some((r: Row) => r.item_code)) return
    try {
      const server = await call<Row>("recalculate", { doc: snapshot })
      if (version.current !== sent) return // user kept typing; a newer recalculation is queued
      replace(mergeServerDoc(docRef.current, server), false)
    } catch (e) {
      toast.error((e as Error).message, { id: "recalc" })
    }
  }, [cfg])

  const scheduleRecalc = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(recalc, 600)
  }, [recalc])
  useEffect(() => () => clearTimeout(timer.current), [])

  /** Applies async results (fetched values, item defaults) without clobbering newer edits. */
  const patch = (fn: (current: Row) => Row) => {
    replace(fn(docRef.current))
    scheduleRecalc()
  }

  // ---------------------------------------------------------------- field interactions
  const fetchFrom = async (fields: MetaBundle["meta"]["fields"], linkField: string, linkValue: string | null, linkDoctype: string) => {
    const deps = fields.filter((f) => f.fetch_from?.startsWith(`${linkField}.`))
    if (!deps.length) return {}
    if (!linkValue) return Object.fromEntries(deps.map((f) => [f.fieldname, null]))
    const targets = deps.map((f) => f.fetch_from!.split(".")[1])
    const got = await call<Row>("frappe.client.get_value", { doctype: linkDoctype, fieldname: JSON.stringify([...new Set(targets)]), filters: linkValue })
    return Object.fromEntries(deps.map((f) => [f.fieldname, got?.[f.fetch_from!.split(".")[1]] ?? null]))
  }

  const afterParentChange = async (fieldname: string, value: any) => {
    try {
      const df = bundleRef.current.meta.fields.find((f) => f.fieldname === fieldname)
      if (df?.fieldtype === "Link" && df.options) {
        const updates = await fetchFrom(bundleRef.current.meta.fields, fieldname, value, df.options)
        if (Object.keys(updates).length) patch((d) => ({ ...d, ...updates }))
      }
      const taxes = cfg.taxes
      if (taxes && fieldname === taxes.template_field) {
        const rows = value ? await call<Row[]>("erpnext.controllers.accounts_controller.get_taxes_and_charges", { master_doctype: taxes.template_doctype, master_name: value }) : []
        const clean = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !["name", "parent", "parenttype", "parentfield", "creation", "modified", "owner", "modified_by", "docstatus", "idx"].includes(k))))
        patch((d) => ({ ...d, [taxes.table]: clean }))
      } else if (cfg.recalculate && df && !["Data", "Small Text", "Text", "Long Text", "Text Editor"].includes(df.fieldtype)) {
        scheduleRecalc()
      }
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const afterCellChange = async (table: string, index: number, fieldname: string, value: any) => {
    try {
      const tdf = bundleRef.current.meta.fields.find((f) => f.fieldname === table)
      const child = tdf?.options ? bundleRef.current.children[tdf.options] : undefined
      if (!child) return
      const df = child.fields.find((f) => f.fieldname === fieldname)
      let updates: Row = {}
      if (df?.fieldtype === "Link" && df.options) updates = await fetchFrom(child.fields, fieldname, value, df.options)
      if (table === cfg.item_table && fieldname === "item_code" && value) {
        const row = docRef.current[table]?.[index] ?? {}
        const details = await call<Row>("get_item_details", { doctype: cfg.doctype, item_code: value, doc: docRef.current, qty: row.qty || 1 })
        updates = { ...updates, ...itemDefaults(details, child.fields) }
      }
      if (Object.keys(updates).length) {
        patch((d) => ({ ...d, [table]: d[table].map((r: Row, i: number) => (i === index ? { ...r, ...updates } : r)) }))
      } else if (cfg.recalculate) scheduleRecalc()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const api: FormApi = {
    setValue: (fieldname, value) => { replace({ ...docRef.current, [fieldname]: value }); void afterParentChange(fieldname, value) },
    setCell: (table, index, fieldname, value) => {
      replace({ ...docRef.current, [table]: docRef.current[table].map((r: Row, i: number) => (i === index ? { ...r, [fieldname]: value } : r)) })
      void afterCellChange(table, index, fieldname, value)
    },
    addRow: (table) => {
      const tdf = bundleRef.current.meta.fields.find((f) => f.fieldname === table)!
      const child = bundleRef.current.children[tdf.options!]
      const rows: Row[] = docRef.current[table] ?? []
      const row: Row = { doctype: tdf.options, parentfield: table, parenttype: cfg.doctype, docstatus: 0, __islocal: 1, idx: rows.length + 1 }
      for (const f of child.fields) { const d = defaultFor(f); if (d !== undefined) row[f.fieldname] = d }
      replace({ ...docRef.current, [table]: [...rows, row] })
    },
    removeRow: (table, index) => {
      replace({ ...docRef.current, [table]: docRef.current[table].filter((_: Row, i: number) => i !== index).map((r: Row, i: number) => ({ ...r, idx: i + 1 })) })
      scheduleRecalc()
    },
  }

  // ---------------------------------------------------------------- actions
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["list", cfg.doctype] })
    void qc.invalidateQueries({ queryKey: ["report", cfg.doctype] })
    void qc.invalidateQueries({ queryKey: ["dashboard"] })
  }

  const persist = async (opts: { navigate: boolean }): Promise<Row | null> => {
    const childFields = Object.fromEntries(Object.entries(bundle.children).map(([k, v]) => [k, v.fields]))
    const missing = findMissing(bundle.meta.fields, docRef.current, roles, childFields)
    if (missing.length) {
      setErrors(new Set(missing.map((m) => m.fieldname)))
      toast.error(`Missing: ${missing.map((m) => m.label).join(", ")}`)
      return null
    }
    clearTimeout(timer.current)
    const saved = await call<Row>("save_doc", { doc: docRef.current })
    replace(saved, false)
    setDirty(false)
    invalidate()
    if (isNew && opts.navigate) navigate(`/${cfg.route}/${encodeURIComponent(saved.name)}`, { replace: true })
    return saved
  }

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    try { await fn() } catch (e) { toast.error((e as Error).message) } finally { setBusy(null) }
  }

  const save = () => run("save", async () => { if (await persist({ navigate: true })) toast.success(`${doc.name ? "Saved" : "Created"}`) })

  const submit = () => run("submit", async () => {
    const saved = dirty ? await persist({ navigate: false }) : docRef.current
    if (!saved) return
    const done = await call<Row>("submit_doc", { doctype: cfg.doctype, name: saved.name })
    replace(done, false); setDirty(false); invalidate()
    toast.success(`${done.name} submitted`)
    if (isNew) navigate(`/${cfg.route}/${encodeURIComponent(done.name)}`, { replace: true })
  })

  const cancelDoc = () => run("cancel", async () => {
    const done = await call<Row>("cancel_doc", { doctype: cfg.doctype, name: doc.name })
    replace(done, false); setDirty(false); invalidate()
    toast.success(`${done.name} cancelled`)
  })

  const remove = () => run("delete", async () => {
    await call("delete_doc", { doctype: cfg.doctype, name: doc.name })
    invalidate()
    toast.success(`${doc.name} deleted`)
    navigate(`/${cfg.route}`, { replace: true })
  })

  // Ctrl/Cmd+S and unsaved-changes guard
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (perms.write || isNew) saveRef.current() } }
    const onUnload = (e: BeforeUnloadEvent) => { if (dirtyRef.current) e.preventDefault() }
    document.addEventListener("keydown", onKey)
    window.addEventListener("beforeunload", onUnload)
    return () => { document.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", onUnload) }
  }, [perms.write, isNew])
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  // ---------------------------------------------------------------- render
  const docstatus = doc.docstatus ?? 0
  const submittable = Boolean(cfg.is_submittable)
  const editable = isNew ? perms.create : perms.write
  const hasAllowOnSubmit = bundle.meta.fields.some((f) => f.allow_on_submit)
  const canWrite = docstatus === 0 ? editable : docstatus === 1 && hasAllowOnSubmit && perms.write
  const statusText = cfg.status_field && doc[cfg.status_field] ? String(doc[cfg.status_field]) : DOCSTATUS_LABEL[docstatus]
  const title = isNew ? `New ${cfg.doctype}` : doc.name
  const heading = !isNew && cfg.title_field && doc[cfg.title_field] && doc[cfg.title_field] !== doc.name ? doc[cfg.title_field] : null

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon-sm"><Link to={`/${cfg.route}`} aria-label="Back"><ArrowLeft /></Link></Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
            {!isNew && <Badge tone={toneFor(statusText)}>{statusText}</Badge>}
            {dirty && <Badge tone="warning">Not saved</Badge>}
          </div>
          {heading && <p className="text-sm text-muted-foreground">{heading}</p>}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!isNew && <Button asChild variant="ghost" size="sm"><a href={`/app/${cfg.doctype.toLowerCase().replace(/ /g, "-")}/${encodeURIComponent(doc.name)}`}><ExternalLink /> Desk</a></Button>}
          {docstatus === 0 && !isNew && perms.delete && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => setConfirm("delete")}><Trash2 /> Delete</Button>}
          {docstatus === 1 && perms.cancel && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => setConfirm("cancel")}><XCircle /> Cancel</Button>}
          {canWrite && (dirty || docstatus === 0) && <Button variant={submittable && docstatus === 0 ? "outline" : "default"} size="sm" disabled={!!busy} onClick={save}><Save /> {busy === "save" ? "Saving…" : docstatus === 1 ? "Update" : "Save"}</Button>}
          {docstatus === 0 && submittable && perms.submit && <Button size="sm" disabled={!!busy} onClick={() => setConfirm("submit")}><Send /> {busy === "submit" ? "Submitting…" : "Submit"}</Button>}
        </div>
      </div>

      <FormLayout bundle={bundle} doc={doc} roles={roles} canWrite={Boolean(canWrite)} isNew={isNew} api={api} errors={errors} />

      <ConfirmDialog open={confirm === "submit"} title={`Submit ${doc.name ?? cfg.doctype}?`} description="Once submitted the document can’t be edited, only cancelled." confirmLabel="Submit" onClose={() => setConfirm(null)} onConfirm={submit} />
      <ConfirmDialog open={confirm === "cancel"} title={`Cancel ${doc.name}?`} description="This reverses its ledger and stock entries." confirmLabel="Cancel document" destructive onClose={() => setConfirm(null)} onConfirm={cancelDoc} />
      <ConfirmDialog open={confirm === "delete"} title={`Delete ${doc.name}?`} description="This can’t be undone." confirmLabel="Delete" destructive onClose={() => setConfirm(null)} onConfirm={remove} />
    </div>
  )
}
