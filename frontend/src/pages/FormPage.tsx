import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, ChevronDown, ExternalLink, LayoutTemplate, Printer, Save, Send, Trash2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { attachScripts, clearRouteOptions, pendingDocs, peekRouteOptions } from "@/compat/frappe"
import { FormRuntime, isNewName, type CustomButton, type Host, type View } from "@/compat/runtime"
import { call } from "@/lib/api"
import { DOCSTATUS_LABEL, toneFor } from "@/lib/format"
import type { MetaBundle, Perms, PortalDoctype, Row } from "@/lib/types"
import { useBoot, useMeta } from "@/hooks/data"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { DesignedForm } from "@/designs/DesignedForm"
import { designs } from "@/designs/specs"
import { FormLayout } from "@/components/form/FormLayout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"

const deskSlug = (doctype: string) => doctype.toLowerCase().replace(/[^a-z0-9]+/g, "-")

export function FormPage() {
  const { route = "", name = "new" } = useParams()
  const cfg = useBoot().doctypes.find((d) => d.route === route)
  if (!cfg || !cfg.perms.read) return <div className="py-20 text-center text-muted-foreground">Page not found or not permitted.</div>
  return <DocLoader key={`${route}/${name}`} cfg={cfg} name={name} />
}

interface Loaded { doc: Row; perms?: Perms; initialValues?: Row }

function DocLoader({ cfg, name }: { cfg: PortalDoctype; name: string }) {
  const [nonce, setNonce] = useState(0)
  const metaQ = useMeta(cfg.doctype)
  const docQ = useQuery({
    queryKey: ["doc", cfg.doctype, name, nonce],
    queryFn: async (): Promise<Loaded> => {
      const pending = pendingDocs.get(`${cfg.doctype}/${name}`)
      if (pending) return { doc: pending }
      if (isNewName(name) || name === "new") {
        return { doc: await call<Row>("get_new_doc", { doctype: cfg.doctype }), initialValues: peekRouteOptions(cfg.doctype) }
      }
      return call<{ doc: Row; perms: Perms }>("get_doc", { doctype: cfg.doctype, name })
    },
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })

  const error = metaQ.error ?? docQ.error
  if (error) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="font-medium">Couldn’t open {name === "new" ? `new ${cfg.label ?? cfg.doctype}` : name}</p>
        <p className="mt-1 text-sm text-muted-foreground">{(error as Error).message}</p>
        <Button asChild variant="outline" className="mt-4"><Link to={`/${cfg.route}`}>Back to {cfg.plural}</Link></Button>
      </div>
    )
  }
  if (!metaQ.data || !docQ.data) return <div className="space-y-4"><Skeleton className="h-9 w-64" /><Skeleton className="h-64 w-full" /><Skeleton className="h-48 w-full" /></div>

  const loaded = docQ.data
  const perms = loaded.perms ?? { ...metaQ.data.perms, write: metaQ.data.perms.create }
  return <DocEditor key={nonce} cfg={cfg} bundle={metaQ.data} initial={loaded.doc} initialValues={loaded.initialValues} perms={perms} reload={() => setNonce((n) => n + 1)} />
}

function CustomButtons({ rt, view }: { rt: FormRuntime; view: View }) {
  const visible = view.buttons.filter((b) => b.el[0]?.style.display !== "none")
  const groups = new Map<string, CustomButton[]>()
  for (const b of visible) if (b.group) groups.set(b.group, [...(groups.get(b.group) ?? []), b])

  return (
    <>
      {visible.filter((b) => !b.group).map((b) => {
        const st = b.el[0]?.style
        return (
          <Button key={b.id} variant="outline" size="sm" onClick={() => void rt.clickButton(b)} style={{ backgroundColor: st?.backgroundColor || undefined, color: st?.color || undefined, fontWeight: st?.fontWeight || undefined, borderColor: st?.backgroundColor || undefined }}>
            {b.label}
          </Button>
        )
      })}
      {[...groups].map(([group, items]) => (
        <DropdownMenu key={group}>
          <DropdownMenuTrigger asChild><Button variant="outline" size="sm">{group} <ChevronDown /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            {items.map((b) => <DropdownMenuItem key={b.id} onSelect={() => void rt.clickButton(b)}>{b.label}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
    </>
  )
}

function DocEditor({ cfg, bundle, initial, initialValues, perms, reload }: { cfg: PortalDoctype; bundle: MetaBundle; initial: Row; initialValues?: Row; perms: Perms; reload: () => void }) {
  const boot = useBoot()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const host = useMemo<Host>(
    () => ({
      boot,
      routeFor: (doctype) => boot.doctypes.find((d) => d.doctype === doctype && d.perms.read)?.route,
      navigate: (path, opts) => navigate(path, opts),
      reload,
    }),
    [boot, navigate, reload],
  )

  const [rt] = useState(() => {
    const runtime = new FormRuntime(bundle, initial, host)
    const spec = designs[bundle.config.doctype]
    if (spec) runtime.configure({ rowDefaults: spec.rowDefaults, rowFormulas: spec.rowFormulas, rowFetch: spec.rowFetch })
    attachScripts(runtime, bundle.scripts)
    return runtime
  })
  const started = useRef(false)
  useEffect(() => {
    rt.revive()
    if (!started.current) {
      started.current = true
      // design defaults fill empty fields of a new document ("$company" = the user's default company)
      const spec = designs[cfg.doctype]
      const defaults = rt.isNew && spec?.defaults
        ? Object.fromEntries(Object.entries(spec.defaults).map(([k, v]) => [k, v === "$company" ? boot.defaults.company : v]).filter(([k, v]) => v && !rt.doc[k as string]))
        : {}
      void rt.start({ ...defaults, ...initialValues }).then(clearRouteOptions)
    }
    return () => rt.dispose()
  }, [rt, initialValues, cfg.doctype, boot.defaults.company])

  const view = useSyncExternalStore(rt.subscribe, rt.getView)
  const doc = view.doc
  const [errors, setErrors] = useState<{ fields: Set<string>; at: number }>({ fields: new Set(), at: 0 })
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<null | "submit" | "cancel" | "delete">(null)
  const design = designs[cfg.doctype]
  const storeKey = `portal-design:${cfg.doctype}`
  const [designed, setDesigned] = useState(() => {
    try { return localStorage.getItem(storeKey) !== "0" } catch { return true }
  })
  const showDesign = Boolean(design && (designed || design.minimal))
  const toggleDesign = () => {
    setDesigned(!designed)
    try { localStorage.setItem(storeKey, designed ? "0" : "1") } catch { /* private mode */ }
  }
  const shownErrors = errors.at === view.uiEdits ? errors.fields : new Set<string>()

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["list", cfg.doctype] })
    void qc.invalidateQueries({ queryKey: ["report", cfg.doctype] })
    void qc.invalidateQueries({ queryKey: ["dashboard"] })
  }

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    try { await fn() } finally { setBusy(null) }
  }

  const act = (action: "Save" | "Update" | "Submit" | "Cancel") =>
    run(action, async () => {
      const wasNew = rt.isNew
      const result = await rt.save(action)
      if (result.missing) {
        setErrors({ fields: new Set(result.missing), at: rt.getView().uiEdits })
        const labels = rt.missing().map((m) => m.label)
        toast.error(`Missing: ${labels.join(", ")}`)
        return
      }
      if (!result.ok) return
      invalidate()
      toast.success(action === "Submit" ? `${rt.doc.name} submitted` : action === "Cancel" ? `${rt.doc.name} cancelled` : wasNew ? `${rt.doc.name} created` : "Saved")
      if (wasNew && !isNewName(rt.doc.name)) navigate(`/${cfg.route}/${encodeURIComponent(rt.doc.name)}`, { replace: true })
    })

  const remove = () =>
    run("delete", async () => {
      if (await rt.remove()) {
        invalidate()
        toast.success(`${doc.name} deleted`)
        navigate(`/${cfg.route}`, { replace: true })
      }
    })

  // Ctrl/Cmd+S and unsaved-changes guard
  const actRef = useRef(act)
  actRef.current = act
  const dirtyRef = useRef(view.dirty)
  dirtyRef.current = view.dirty
  const docstatus = doc.docstatus ?? 0
  const canSaveRef = useRef(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        if (canSaveRef.current) void actRef.current(docstatus === 1 ? "Update" : "Save")
      }
    }
    const onUnload = (e: BeforeUnloadEvent) => { if (dirtyRef.current && !rt.isNew) e.preventDefault() }
    document.addEventListener("keydown", onKey)
    window.addEventListener("beforeunload", onUnload)
    return () => { document.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", onUnload) }
  }, [docstatus, rt])

  const isNew = rt.isNew
  const submittable = Boolean(cfg.is_submittable)
  const editable = isNew ? perms.create : perms.write
  const hasAllowOnSubmit = bundle.meta.fields.some((f) => f.allow_on_submit)
  const canWrite = docstatus === 0 ? editable : docstatus === 1 && hasAllowOnSubmit && perms.write
  canSaveRef.current = Boolean(canWrite) && !busy
  const statusText = cfg.status_field && doc[cfg.status_field] ? String(doc[cfg.status_field]) : DOCSTATUS_LABEL[docstatus]
  const title = isNew ? `New ${cfg.label ?? cfg.doctype}` : doc.name
  const heading = !isNew && cfg.title_field && doc[cfg.title_field] && doc[cfg.title_field] !== doc.name ? doc[cfg.title_field] : null
  const isSingle = Boolean(cfg.is_single)

  return (
    <div className="space-y-4 pb-8">
      <div className="sticky top-0 z-20 -mx-4 -mt-4 border-b border-border bg-background/85 px-4 py-2 backdrop-blur md:-mx-6 md:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
        {!isSingle && <Button asChild variant="ghost" size="icon-sm"><Link to={`/${cfg.route}`} aria-label="Back"><ArrowLeft /></Link></Button>}
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="truncate text-lg font-semibold tracking-tight">{isSingle ? cfg.doctype : title}</h1>
            {!isNew && !isSingle && <Badge tone={toneFor(statusText)}>{statusText}</Badge>}
            {view.dirty && !(isNew && !canWrite) && <Badge tone="warning">Not saved</Badge>}
          </div>
          {(showDesign && design?.subtitle?.(doc)) || heading ? <p className="truncate text-xs text-muted-foreground">{(showDesign && design?.subtitle?.(doc)) || heading}</p> : null}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <CustomButtons rt={rt} view={view} />
          {design && !design.minimal && <Button variant="ghost" size="sm" onClick={toggleDesign} title="Switch between the designed layout and the standard field layout"><LayoutTemplate /> {designed ? "Standard layout" : "Designed layout"}</Button>}
          {!isNew && !isSingle && (
            <Button asChild variant="ghost" size="sm">
              <a href={`/printview?doctype=${encodeURIComponent(cfg.doctype)}&name=${encodeURIComponent(doc.name)}${bundle.meta.default_print_format ? `&format=${encodeURIComponent(bundle.meta.default_print_format)}` : ""}&trigger_print=1&no_letterhead=1`} target="_blank" rel="noreferrer"><Printer /> Print</a>
            </Button>
          )}
          {!isNew && <Button asChild variant="ghost" size="sm"><a href={`/app/${deskSlug(cfg.doctype)}/${encodeURIComponent(isSingle ? cfg.doctype : doc.name)}`}><ExternalLink /> Desk</a></Button>}
          {docstatus === 0 && !isNew && !isSingle && perms.delete && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => setConfirm("delete")}><Trash2 /> Delete</Button>}
          {docstatus === 1 && perms.cancel && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => setConfirm("cancel")}><XCircle /> Cancel</Button>}
          {canWrite && (view.dirty || docstatus === 0) && (
            <Button variant={submittable && docstatus === 0 ? "outline" : "default"} size="sm" disabled={!!busy} onClick={() => void act(docstatus === 1 ? "Update" : "Save")}>
              <Save /> {busy === "Save" || busy === "Update" ? "Saving…" : docstatus === 1 ? "Update" : "Save"}
            </Button>
          )}
          {docstatus === 0 && submittable && perms.submit && <Button size="sm" disabled={!!busy} onClick={() => setConfirm("submit")}><Send /> {busy === "Submit" ? "Submitting…" : "Submit"}</Button>}
        </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl space-y-4">
      {view.intro.map((i, n) => (
        <div key={n} className={`rounded-lg border px-4 py-2.5 text-sm ${i.color === "red" ? "border-destructive/40 bg-destructive/10" : i.color === "orange" || i.color === "yellow" ? "border-warning/40 bg-warning/10" : i.color === "green" ? "border-success/40 bg-success/10" : "border-primary/40 bg-primary/10"}`}>{i.message}</div>
      ))}

      {showDesign && design ? (
        <DesignedForm design={design} bundle={bundle} rt={rt} view={view} roles={boot.roles} canWrite={Boolean(canWrite)} errors={shownErrors} />
      ) : (
        <FormLayout bundle={bundle} rt={rt} view={view} roles={boot.roles} canWrite={Boolean(canWrite)} errors={shownErrors} />
      )}

      </div>

      <ConfirmDialog open={confirm === "submit"} title={`Submit ${doc.name ?? cfg.label ?? cfg.doctype}?`} description="Once submitted the document can’t be edited, only cancelled." confirmLabel="Submit" onClose={() => setConfirm(null)} onConfirm={() => void act("Submit")} />
      <ConfirmDialog open={confirm === "cancel"} title={`Cancel ${doc.name}?`} description="This reverses its ledger and stock entries." confirmLabel="Cancel document" destructive onClose={() => setConfirm(null)} onConfirm={() => void act("Cancel")} />
      <ConfirmDialog open={confirm === "delete"} title={`Delete ${doc.name}?`} description="This can’t be undone." confirmLabel="Delete" destructive onClose={() => setConfirm(null)} onConfirm={() => void remove()} />
    </div>
  )
}
