import { useEffect, useState } from "react"
import type { DocField, Row } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input, NativeSelect, Textarea } from "@/components/ui/input"
import { LinkField } from "./LinkField"

export const NUMERIC = ["Int", "Float", "Currency", "Percent"]
export const TEXTAREA = ["Small Text", "Text", "Long Text", "Text Editor", "Markdown Editor", "HTML Editor", "Code"]
export const TEXTLIKE = ["Data", "Phone", "Barcode", "Autocomplete", "Color", "Rating", "Duration", "Read Only", "Password"]
export const INPUT_TYPES = [...NUMERIC, ...TEXTAREA, ...TEXTLIKE, "Select", "Link", "Dynamic Link", "Date", "Datetime", "Time", "Check", "Button"]

interface Props {
  df: DocField
  value: any
  onChange: (value: any) => void
  doc: Row
  disabled?: boolean
  compact?: boolean
  getQuery?: () => { filters?: unknown; query?: string } | undefined
  /** Button fields: Frappe triggers the event named after the field */
  onAction?: () => void
}

function NumberInput({ value, onChange, disabled, integer, className, name }: { value: number | null | undefined; onChange: (v: number | null) => void; disabled?: boolean; integer?: boolean; className?: string; name?: string }) {
  const [text, setText] = useState(value == null ? "" : String(value))
  // Re-sync when the value changes from outside (server recalculation), but not while typing
  useEffect(() => {
    if ((text === "" ? null : Number(text)) !== (value ?? null)) setText(value == null ? "" : String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <Input
      className={className}
      data-fieldname={name}
      inputMode="decimal"
      disabled={disabled}
      value={text}
      onChange={(e) => {
        const t = e.target.value
        if (!/^-?\d*\.?\d*$/.test(t) || (integer && t.includes("."))) return
        setText(t)
        onChange(t === "" || t === "-" || t === "." ? null : Number(t))
      }}
      style={{ textAlign: "right" }}
    />
  )
}

export function FieldInput({ df, value, onChange, doc, disabled, compact, getQuery, onAction }: Props) {
  const cls = compact ? "h-7 text-xs" : undefined
  const fn = df.fieldname
  switch (df.fieldtype) {
    case "Button":
      return <Button type="button" variant="outline" size="sm" onClick={onAction}>{(df.label ?? df.fieldname).replace(/<[^>]*>/g, "")}</Button>
    case "Check":
      return <Checkbox checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(e.target.checked ? 1 : 0)} />
    case "Int":
      return <NumberInput name={fn} integer value={value} onChange={onChange} disabled={disabled} className={cls} />
    case "Float":
    case "Currency":
    case "Percent":
      return <NumberInput name={fn} value={value} onChange={onChange} disabled={disabled} className={cls} />
    case "Select": {
      const options = (df.options ?? "").split("\n")
      return (
        <NativeSelect data-fieldname={fn} className={cls} value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </NativeSelect>
      )
    }
    case "Link":
      return <LinkField name={fn} getQuery={getQuery} doctype={df.options ?? ""} value={value} onChange={onChange} disabled={disabled} className={compact ? "[&_input]:h-7 [&_input]:text-xs" : undefined} />
    case "Dynamic Link": {
      const target = df.options ? doc[df.options] : null
      return target ? <LinkField name={fn} getQuery={getQuery} doctype={target} value={value} onChange={onChange} disabled={disabled} /> : <Input disabled value={value ?? ""} placeholder={`Set ${df.options} first`} className={cls} />
    }
    case "Date":
      return <Input type="date" data-fieldname={fn} className={cls} value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} />
    case "Datetime":
      return <Input type="datetime-local" data-fieldname={fn} className={cls} value={value ? String(value).replace(" ", "T").slice(0, 16) : ""} disabled={disabled} onChange={(e) => onChange(e.target.value ? e.target.value.replace("T", " ") + ":00" : null)} />
    case "Time":
      return <Input type="time" data-fieldname={fn} className={cls} value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} />
    default:
      if (TEXTAREA.includes(df.fieldtype))
        return <Textarea data-fieldname={fn} className={compact ? "h-7 min-h-7 py-1 text-xs" : undefined} value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)} rows={compact ? 1 : 3} />
      return <Input data-fieldname={fn} className={cls} value={value ?? ""} disabled={disabled || df.fieldtype === "Read Only"} onChange={(e) => onChange(e.target.value)} />
  }
}
