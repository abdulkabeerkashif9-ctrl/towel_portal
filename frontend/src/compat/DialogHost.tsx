import { useEffect, useRef, useSyncExternalStore } from "react"
import { Loader2 } from "lucide-react"
import { evalExpr } from "@/lib/expr"
import type { DocField } from "@/lib/types"
import { cn } from "@/lib/utils"
import { FieldInput } from "@/components/form/FieldInput"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { sanitizeHtml } from "./store"
import { uiStore, ScriptDialog, type DialogField } from "./ui"

/** Renders everything scripts can open: frappe.ui.Dialog, msgprint, confirm and the freeze overlay. */
export function DialogHost() {
  const state = useSyncExternalStore(uiStore.subscribe, uiStore.get)
  const message = state.messages[0]
  const confirm = state.confirms[0]
  const drop = <K extends "messages" | "confirms">(k: K, id: string) => uiStore.set((s) => ({ ...s, [k]: s[k].filter((m: { id: string }) => m.id !== id) }))

  return (
    <>
      {state.dialogs.map((d) => <ScriptDialogView key={d.id} dialog={d} />)}

      {message && (
        <Dialog open onOpenChange={(o) => !o && drop("messages", message.id)}>
          <DialogContent title={message.title ?? (message.indicator === "red" ? "Error" : "Message")} className="max-w-lg">
            <div
              className={cn("max-h-[60vh] overflow-y-auto text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_li]:ml-4 [&_li]:list-disc [&_ul]:space-y-1", message.indicator === "red" && "border-l-2 border-destructive pl-3")}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(message.message) }}
            />
            <div className="mt-4 flex justify-end"><Button onClick={() => drop("messages", message.id)}>OK</Button></div>
          </DialogContent>
        </Dialog>
      )}

      {confirm && (
        <Dialog open onOpenChange={(o) => { if (!o) { drop("confirms", confirm.id); confirm.onNo?.() } }}>
          <DialogContent title="Confirm">
            <div className="text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(confirm.message) }} />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { drop("confirms", confirm.id); confirm.onNo?.() }}>No</Button>
              <Button onClick={() => { drop("confirms", confirm.id); confirm.onYes() }}>Yes</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {state.freeze.count > 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-5 py-3 text-sm shadow-xl">
            <Loader2 className="size-4 animate-spin text-primary" /> {state.freeze.message ?? "Working…"}
          </div>
        </div>
      )}
    </>
  )
}

function HtmlSlot({ node }: { node: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.appendChild(node)
    return () => { node.parentNode?.removeChild(node) }
  }, [node])
  return <div ref={ref} className="frappe-html" />
}

/** Groups a flat field list into sections of columns (Section Break / Column Break). */
function group(fields: DialogField[]) {
  const sections: { label?: string; columns: DialogField[][] }[] = [{ columns: [[]] }]
  for (const f of fields) {
    if (f.fieldtype === "Section Break") sections.push({ label: f.label, columns: [[]] })
    else if (f.fieldtype === "Column Break") sections[sections.length - 1].columns.push([])
    else {
      const s = sections[sections.length - 1]
      s.columns[s.columns.length - 1].push(f)
    }
  }
  return sections.filter((s) => s.columns.some((c) => c.length))
}

function ScriptDialogView({ dialog }: { dialog: ScriptDialog }) {
  useSyncExternalStore(dialog.subscribe.bind(dialog), () => dialog.version)
  const values = dialog.values
  const primary = dialog.primaryLabel ?? (dialog.primaryAction ? "Submit" : undefined)

  const render = (df: DialogField) => {
    if (df.hidden || !evalExpr(df.depends_on, { doc: values, roles: [] }, true)) return null
    const handle = dialog.fields_dict[df.fieldname]
    if (df.fieldtype === "HTML" && handle.container) return <HtmlSlot key={df.fieldname} node={handle.container} />
    if (df.fieldtype === "MultiCheck") {
      const selected: string[] = values[df.fieldname] ?? []
      return (
        <div key={df.fieldname}>
          {df.label && <div className="mb-1.5 text-[13px] font-medium text-muted-foreground">{df.label}</div>}
          <div className="grid max-h-72 gap-1.5 overflow-y-auto rounded-md border border-border p-2" style={{ gridTemplateColumns: `repeat(${df.columns || 1}, minmax(0, 1fr))` }}>
            {(df.options ?? []).map((o: { label: string; value: string }) => (
              <label key={o.value} className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-accent">
                <Checkbox className="mt-0.5" checked={selected.includes(o.value)} onChange={(e) => void dialog.set_value(df.fieldname, e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </div>
      )
    }
    const field = { ...df, label: df.label ?? df.fieldname } as unknown as DocField
    const input = (
      <FieldInput
        df={field}
        value={values[df.fieldname]}
        doc={values}
        disabled={Boolean(df.read_only)}
        getQuery={df.get_query ? () => { try { const r = df.get_query!(); return r && typeof r === "object" ? { filters: r.filters, query: r.query } : undefined } catch { return undefined } } : undefined}
        onChange={(v) => void dialog.set_value(df.fieldname, v)}
      />
    )
    return df.fieldtype === "Check" ? (
      <label key={df.fieldname} className="flex items-center gap-2.5 text-[13px]">{input}{df.label}</label>
    ) : (
      <div key={df.fieldname}>
        <label className="mb-1.5 block text-[13px] font-medium text-muted-foreground">{df.label}{df.reqd ? <span className="text-destructive"> *</span> : null}</label>
        {input}
        {df.description ? <p className="mt-1 text-xs text-muted-foreground">{df.description}</p> : null}
      </div>
    )
  }

  const wide = dialog.size === "large" || dialog.size === "extra-large" || dialog.fields.some((f) => f.fieldtype === "HTML")
  return (
    <Dialog open onOpenChange={(o) => !o && dialog.hide()}>
      <DialogContent title={dialog.title || "Dialog"} className={cn("max-h-[88vh] overflow-y-auto", wide ? "max-w-4xl" : "max-w-xl")}>
        <div className="space-y-4">
          {group(dialog.fields).map((s, i) => (
            <div key={i} className="space-y-3">
              {s.label && <div className="border-b border-border pb-1.5 text-sm font-semibold">{s.label}</div>}
              <div className="grid gap-x-5 gap-y-3" style={{ gridTemplateColumns: `repeat(${s.columns.filter((c) => c.length).length}, minmax(0, 1fr))` }}>
                {s.columns.filter((c) => c.length).map((col, ci) => <div key={ci} className="min-w-0 space-y-3">{col.map(render)}</div>)}
              </div>
            </div>
          ))}
        </div>
        {(primary || dialog.secondaryLabel) && (
          <div className="mt-5 flex justify-end gap-2">
            {dialog.secondaryLabel && <Button variant="outline" onClick={() => dialog.secondaryAction?.()}>{dialog.secondaryLabel}</Button>}
            {primary && (
              <Button disabled={dialog.primaryDisabled} onClick={() => { const v = dialog.get_values(); if (v) dialog.primaryAction?.(v) }}>{primary}</Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
