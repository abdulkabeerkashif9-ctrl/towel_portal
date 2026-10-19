import { useMemo, useState } from "react"
import { ChevronRight } from "lucide-react"
import { evalExpr } from "@/lib/expr"
import type { DocField, MetaBundle, Row } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ChildTable } from "./ChildTable"
import { FieldInput } from "./FieldInput"
import { buildLayout, type Section } from "./layout"

export interface FormApi {
  setValue: (fieldname: string, value: any) => void
  setCell: (table: string, rowIndex: number, fieldname: string, value: any) => void
  addRow: (table: string) => void
  removeRow: (table: string, rowIndex: number) => void
}

interface Props {
  bundle: MetaBundle
  doc: Row
  roles: string[]
  canWrite: boolean
  isNew: boolean
  api: FormApi
  errors: Set<string>
}

export function isReadOnlyField(df: DocField, doc: Row, canWrite: boolean, isNew: boolean, roles: string[]) {
  if (!canWrite || df.fieldtype === "Read Only") return true
  if (doc.docstatus === 2) return true
  if (doc.docstatus === 1 && !df.allow_on_submit) return true
  if (df.set_only_once && !isNew && doc[df.fieldname]) return true
  return Boolean(df.read_only) || evalExpr(df.read_only_depends_on, { doc, roles }, false)
}

export function FormLayout({ bundle, doc, roles, canWrite, isNew, api, errors }: Props) {
  const tabs = useMemo(() => buildLayout(bundle.meta.fields), [bundle])
  const [active, setActive] = useState(0)
  const tab = tabs[Math.min(active, tabs.length - 1)]

  return (
    <div className="space-y-4">
      {tabs.length > 1 && (
        <div className="flex gap-1 border-b border-border">
          {tabs.map((t, i) => (
            <button key={t.key} onClick={() => setActive(i)} className={cn("-mb-px cursor-pointer border-b-2 px-4 py-2 text-sm font-medium", i === active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      {tab?.sections.map((s) => (
        <SectionCard key={s.key} section={s} bundle={bundle} doc={doc} roles={roles} canWrite={canWrite} isNew={isNew} api={api} errors={errors} />
      ))}
    </div>
  )
}

function SectionCard({ section, bundle, doc, roles, canWrite, isNew, api, errors }: Props & { section: Section }) {
  const [open, setOpen] = useState(!section.collapsible)
  if (!evalExpr(section.depends_on, { doc, roles }, true)) return null

  // hide the whole card when none of its fields are visible
  const visible = section.columns.map((c) => c.filter((df) => evalExpr(df.depends_on, { doc, roles }, true)))
  if (!visible.some((c) => c.length)) return null

  return (
    <section className="rounded-xl border border-border bg-card">
      {section.label || section.collapsible ? (
        <button type="button" disabled={!section.collapsible} onClick={() => setOpen(!open)} className={cn("flex w-full items-center gap-2 px-5 py-3 text-left text-sm font-semibold", section.collapsible && "cursor-pointer")}>
          {section.collapsible && <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")} />}
          {section.label ?? "More"}
        </button>
      ) : null}
      {open && (
        <div className={cn("grid gap-x-6 gap-y-4 px-5 pb-5", !(section.label || section.collapsible) && "pt-5")} style={{ gridTemplateColumns: `repeat(${visible.filter((c) => c.length).length}, minmax(0, 1fr))` }}>
          {visible.filter((c) => c.length).map((col, ci) => (
            <div key={ci} className="min-w-0 space-y-4">
              {col.map((df) => (
                <FieldRow key={df.fieldname} sectionLabel={section.label} df={df} bundle={bundle} doc={doc} roles={roles} canWrite={canWrite} isNew={isNew} api={api} invalid={errors.has(df.fieldname)} />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function FieldRow({ sectionLabel, df, bundle, doc, roles, canWrite, isNew, api, invalid }: { sectionLabel: string | null; df: DocField; bundle: MetaBundle; doc: Row; roles: string[]; canWrite: boolean; isNew: boolean; api: FormApi; invalid: boolean }) {
  const readOnly = isReadOnlyField(df, doc, canWrite, isNew, roles)

  if (df.fieldtype === "Table") {
    const child = df.options ? bundle.children[df.options] : undefined
    if (!child) return null
    return (
      <div className="space-y-1.5">
        {df.label !== sectionLabel || invalid ? <div className="text-[13px] font-medium">{df.label}{invalid ? <span className="ml-2 text-xs text-destructive">required</span> : null}</div> : null}
        <ChildTable df={df} meta={child} doc={doc} roles={roles} readOnly={readOnly && !(doc.docstatus === 1 && df.allow_on_submit)} onCell={(i, f, v) => api.setCell(df.fieldname, i, f, v)} onAdd={() => api.addRow(df.fieldname)} onRemove={(i) => api.removeRow(df.fieldname, i)} />
      </div>
    )
  }

  const required = Boolean(df.reqd) || evalExpr(df.mandatory_depends_on, { doc, roles }, false)
  return (
    <div className={cn(df.fieldtype === "Check" && "flex items-center gap-2.5 pt-1")}>
      {df.fieldtype === "Check" ? (
        <>
          <FieldInput df={df} value={doc[df.fieldname]} doc={doc} disabled={readOnly} onChange={(v) => api.setValue(df.fieldname, v)} />
          <label className="text-[13px]">{df.label}</label>
        </>
      ) : (
        <>
          <label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">
            {df.label}{required ? <span className="text-destructive"> *</span> : null}
          </label>
          <div className={cn(invalid && "[&_input]:border-destructive [&_select]:border-destructive [&_textarea]:border-destructive")}>
            <FieldInput df={df} value={doc[df.fieldname]} doc={doc} disabled={readOnly} onChange={(v) => api.setValue(df.fieldname, v)} />
          </div>
          {df.description ? <p className="mt-1 text-xs text-muted-foreground">{df.description}</p> : null}
        </>
      )}
    </div>
  )
}
