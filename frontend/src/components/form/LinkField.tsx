import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ChevronsUpDown, X } from "lucide-react"
import { call } from "@/lib/api"
import { cn } from "@/lib/utils"
import { inputClass } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"

interface Props {
  doctype: string
  value: string | null | undefined
  onChange: (value: string | null) => void
  disabled?: boolean
  placeholder?: string
  filters?: unknown
  /** Evaluated whenever the dropdown is open: Desk `set_query` results (filters and/or a custom query method) */
  getQuery?: () => { filters?: unknown; query?: string } | undefined
  name?: string
  className?: string
  clearable?: boolean
}

/** Autocomplete over Frappe's own link search, so permissions and link filters match Desk. */
export function LinkField({ doctype, value, onChange, disabled, placeholder, filters, getQuery, name, className, clearable }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(value ?? "")
  const [txt, setTxt] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => setText(value ?? ""), [value])
  useEffect(() => {
    const t = setTimeout(() => setTxt(text === value ? "" : text), 200)
    return () => clearTimeout(t)
  }, [text, value])

  const q = open ? (getQuery?.() ?? (filters ? { filters } : undefined)) : undefined
  const { data = [], isFetching, error } = useQuery({
    queryKey: ["link", doctype, txt, q],
    queryFn: () => call<{ value: string; description?: string }[]>("search_link", { doctype, txt, filters: q?.filters, query: q?.query }),
    enabled: open,
    staleTime: 30_000,
  })

  const pick = (v: string | null) => {
    onChange(v)
    setText(v ?? "")
    setOpen(false)
  }

  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={anchorRef} className={cn("relative", className)}>
          <input
            ref={inputRef}
            data-fieldname={name}
            className={cn(inputClass, "pr-14")}
            value={text}
            disabled={disabled}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onChange={(e) => { setText(e.target.value); setOpen(true) }}
            onBlur={() => setTimeout(() => setText(value ?? ""), 150)}
            onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); if (e.key === "Enter" && data[0] && open) { e.preventDefault(); pick(data[0].value) } }}
          />
          <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1 text-muted-foreground">
            {clearable && value && !disabled ? (
              <button type="button" className="pointer-events-auto cursor-pointer rounded p-0.5 hover:bg-accent" onMouseDown={(e) => { e.preventDefault(); pick(null) }} aria-label="Clear"><X className="size-3.5" /></button>
            ) : null}
            <ChevronsUpDown className="size-3.5" />
          </div>
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-56 p-1" onOpenAutoFocus={(e) => e.preventDefault()} onInteractOutside={(e) => { if (anchorRef.current?.contains(e.target as Node)) e.preventDefault() }}>
        <div className="max-h-64 overflow-y-auto">
          {error ? <div className="px-3 py-3 text-xs text-destructive">Search failed: {(error as Error).message}</div> : data.length === 0 && <div className="px-3 py-3 text-center text-xs text-muted-foreground">{isFetching ? "Searching…" : "No results"}</div>}
          {data.map((r) => (
            <button key={r.value} type="button" onMouseDown={(e) => { e.preventDefault(); pick(r.value) }}
              className={cn("block w-full cursor-pointer rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent", r.value === value && "bg-accent")}>
              <div className="truncate">{r.value}</div>
              {r.description ? <div className="truncate text-xs text-muted-foreground">{r.description}</div> : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
