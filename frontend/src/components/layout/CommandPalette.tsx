import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Command } from "cmdk"
import { LayoutDashboard, Plus, Search } from "lucide-react"
import { useBoot } from "@/hooks/data"
import { DoctypeIcon } from "./icons"

export function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border border-input px-3 text-sm text-muted-foreground hover:bg-accent">
      <Search className="size-4" /> <span className="flex-1 text-left">Search</span>
      <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium">Ctrl K</kbd>
    </button>
  )
}

export function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const { doctypes } = useBoot()
  const navigate = useNavigate()
  const [value, setValue] = useState("")

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen(!open)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, setOpen])

  const go = (path: string) => {
    setOpen(false)
    setValue("")
    navigate(path)
  }
  const visible = doctypes.filter((d) => d.perms.read)
  const item = "flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm aria-selected:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground"

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Search" className="fixed left-1/2 top-[18%] z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      <Command.Input value={value} onValueChange={setValue} placeholder="Jump to a page, or type a document number…" className="h-12 w-full border-b border-border bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground" />
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">No pages found.</Command.Empty>
        <Command.Group heading="Pages" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
          <Command.Item className={item} onSelect={() => go("/")}><LayoutDashboard /> Dashboard</Command.Item>
          {visible.map((d) => (
            <Command.Item key={d.route} className={item} value={d.plural} onSelect={() => go(`/${d.route}`)}>
              <DoctypeIcon name={d.icon} /> {d.plural}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Create" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
          {visible.filter((d) => d.perms.create).map((d) => (
            <Command.Item key={`new-${d.route}`} className={item} value={`new ${d.doctype}`} onSelect={() => go(`/${d.route}/new`)}>
              <Plus /> New {d.doctype}
            </Command.Item>
          ))}
        </Command.Group>
        {value.trim().length > 2 && (
          <Command.Group heading="Open document" className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
            {visible.map((d) => (
              <Command.Item key={`open-${d.route}`} forceMount className={item} value={`open ${d.doctype} ${value}`} onSelect={() => go(`/${d.route}/${encodeURIComponent(value.trim())}`)}>
                <DoctypeIcon name={d.icon} /> Open {d.doctype} “{value.trim()}”
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  )
}
