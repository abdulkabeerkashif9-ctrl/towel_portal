import { useMemo, useState } from "react"
import { ChevronRight } from "lucide-react"
import { effectiveDf, type FormRuntime, type View } from "@/compat/runtime"
import { evalExpr } from "@/lib/expr"
import type { DocField, MetaBundle, Row } from "@/lib/types"
import { sanitizeHtml } from "@/compat/store"
import { cn } from "@/lib/utils"
import { ChildTable } from "./ChildTable"
import { FieldInput } from "./FieldInput"
import { buildLayout, type Section } from "./layout"

interface Props {
  bundle: MetaBundle
  rt: FormRuntime
  view: View
  roles: string[]
  canWrite: boolean
  errors: Set<string>
}

export function isReadOnlyField(df: DocField, doc: Row, canWrite: boolean, isNew: boolean, roles: string[]) {
  if (!canWrite || df.fieldtype === "Read Only") return true
  if (doc.docstatus === 2) return true
  if (doc.docstatus === 1 && !df.allow_on_submit) return true
  if (df.set_only_once && !isNew && doc[df.fieldname]) return true
  return Boolean(df.read_only) || evalExpr(df.read_only_depends_on, { doc, roles }, false)
}

/** Frappe labels may contain HTML (for example coloured spans) */
function Label({ text }: { text: string | null }) {
  if (!text) return null
  return text.includes("<") ? <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(text) }} /> : <>{text}</>
}

export function FormLayout(props: Props) {
  const { bundle, view } = props
  const tabs = useMemo(() => buildLayout(bundle.meta.fields), [bundle])
  const [active, setActive] = useState(0)
  const tab = tabs[Math.min(active, tabs.length - 1)]

  return (
    <div className="space-y-4">
      {tabs.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b border-border">
          {tabs.map((t, i) => (
            <button key={t.key} onClick={() => setActive(i)} className={cn("-mb-px shrink-0 cursor-pointer border-b-2 px-4 py-2 text-sm font-medium", i === active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      {tab?.sections.map((s) => <SectionCard key={s.key} section={s} {...props} doc={view.doc} />)}
    </div>
  )
}

function SectionCard({ section, bundle, rt, view, roles, canWrite, errors, doc }: Props & { section: Section; doc: Row }) {
  const [open, setOpen] = useState(!section.collapsible)
  const secDf = section.fieldname ? effectiveDf(view.overrides, { fieldname: section.fieldname, hidden: section.hidden ? 1 : 0 } as DocField) : null
  if (secDf?.hidden || !evalExpr(section.depends_on, { doc, roles }, true)) return null

  // hide the whole card when none of its fields are visible
  const visible = section.columns.map((c) =>
    c.filter((df) => {
      const eff = effectiveDf(view.overrides, df)
      return !eff.hidden && evalExpr(eff.depends_on, { doc, roles }, true)
    }),
  )
  // Tables span the full width of the card, whichever column they were declared in
  const tables = visible.flat().filter((df) => df.fieldtype === "Table")
  const cols = visible.map((c) => c.filter((df) => df.fieldtype !== "Table")).filter((c) => c.length)
  if (!cols.length && !tables.length) return null

  return (
    <section className="rounded-xl border border-border bg-card">
      {section.label || section.collapsible ? (
        <button type="button" disabled={!section.collapsible} onClick={() => setOpen(!open)} className={cn("flex w-full items-center gap-2 px-5 py-3 text-left text-sm font-semibold", section.collapsible && "cursor-pointer")}>
          {section.collapsible && <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")} />}
          {section.label ?? "More"}
        </button>
      ) : null}
      {open && (
        <div className={cn("space-y-4 px-5 pb-5", !(section.label || section.collapsible) && "pt-5")}>
          {cols.length > 0 && (
            <div className="grid gap-x-6 gap-y-4 max-md:!grid-cols-1" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
              {cols.map((col, ci) => (
                <div key={ci} className="min-w-0 space-y-4">
                  {col.map((df, i) => (
                    <FieldRow key={`${df.fieldname}-${i}`} sectionLabel={section.label} df={df} bundle={bundle} rt={rt} view={view} roles={roles} canWrite={canWrite} invalid={errors.has(df.fieldname)} />
                  ))}
                </div>
              ))}
            </div>
          )}
          {tables.map((df, i) => (
            <FieldRow key={`${df.fieldname}-${i}`} sectionLabel={section.label} df={df} bundle={bundle} rt={rt} view={view} roles={roles} canWrite={canWrite} invalid={errors.has(df.fieldname)} />
          ))}
        </div>
      )}
    </section>
  )
}

function FieldRow({ sectionLabel, df: base, bundle, rt, view, roles, canWrite, invalid }: { sectionLabel: string | null; df: DocField; bundle: MetaBundle; rt: FormRuntime; view: View; roles: string[]; canWrite: boolean; invalid: boolean }) {
  const df = effectiveDf(view.overrides, base)
  const doc = view.doc
  const editable = canWrite && !view.readOnlyAll
  const readOnly = isReadOnlyField(df, doc, editable, rt.isNew, roles)

  if (df.fieldtype === "Table") {
    const child = df.options ? bundle.children[df.options] : undefined
    if (!child) return null
    return (
      <div className="space-y-1.5">
        {df.label !== sectionLabel || invalid ? <div className="text-[13px] font-medium"><Label text={df.label} />{invalid ? <span className="ml-2 text-xs text-destructive">required</span> : null}</div> : null}
        <ChildTable df={df} meta={child} rt={rt} view={view} roles={roles} readOnly={readOnly && !(doc.docstatus === 1 && df.allow_on_submit)} />
      </div>
    )
  }

  const required = Boolean(df.reqd) || evalExpr(df.mandatory_depends_on, { doc, roles }, false)
  const getQuery = () => rt.getQuery(null, df.fieldname)
  return (
    <div className={cn(df.fieldtype === "Check" && "flex items-center gap-2.5 pt-1")}>
      {df.fieldtype === "Check" ? (
        <>
          <FieldInput df={df} value={doc[df.fieldname]} doc={doc} disabled={readOnly} onChange={(v) => rt.uiSetValue(null, null, df.fieldname, v)} />
          <label className="text-[13px]"><Label text={df.label} /></label>
        </>
      ) : (
        <>
          <label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
            <Label text={df.label} />{required ? <span className="text-destructive"> *</span> : null}
          </label>
          <div className={cn(invalid && "[&_input]:border-destructive [&_select]:border-destructive [&_textarea]:border-destructive")}>
            <FieldInput df={df} value={doc[df.fieldname]} doc={doc} disabled={readOnly} getQuery={getQuery} onChange={(v) => rt.uiSetValue(null, null, df.fieldname, v)} />
          </div>
          {df.description ? <p className="mt-1 text-xs text-muted-foreground">{df.description}</p> : null}
        </>
      )}
    </div>
  )
}
