import { useState } from "react"
import { Link, NavLink, Outlet, useLocation } from "react-router-dom"
import { ChevronRight, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, Moon, Sun } from "lucide-react"
import { useBoot, useTheme } from "@/hooks/data"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { CommandPalette, SearchButton } from "./CommandPalette"
import { DoctypeIcon } from "./icons"
import { UserMenu } from "./UserMenu"

export function AppShell() {
  const { brand, doctypes, sections } = useBoot()
  const toggleTheme = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const location = useLocation()
  // Sections the user collapsed; remembered between visits
  const [closed, setClosed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("portal-closed-sections") ?? '["Masters","Settings"]')) } catch { return new Set(["Masters", "Settings"]) }
  })
  const toggleSection = (name: string) =>
    setClosed((prev) => {
      const next = new Set(prev)
      if (!next.delete(name)) next.add(name)
      try { localStorage.setItem("portal-closed-sections", JSON.stringify([...next])) } catch { /* private mode */ }
      return next
    })

  const link = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4 [&_svg]:shrink-0",
      isActive && "bg-accent text-foreground shadow-[inset_2px_0_0_var(--primary)]",
      collapsed && "justify-center px-0 [&_span]:hidden",
    )

  const known = new Set(sections)
  const grouped = [...sections, ...new Set(doctypes.map((d) => d.section).filter((s) => !known.has(s)))]
    .map((s) => ({ section: s, items: doctypes.filter((d) => d.section === s && d.perms.read) }))
    .filter((g) => g.items.length)

  // Title shown in the top bar, derived from the first path segment
  const first = location.pathname.split("/")[1]
  const current = doctypes.find((d) => d.route === first)
  const title = current?.plural ?? (first === "page-access" ? "Page Access" : "Dashboard")

  const nav = (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-16 items-center gap-3 px-4", collapsed && "justify-center px-0")}>
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="size-8 rounded-lg" />
        {!collapsed && (
          <div className="leading-tight">
            <div className="text-sm font-semibold">{brand.title}</div>
            <div className="text-[11px] text-muted-foreground">{brand.subtitle}</div>
          </div>
        )}
      </div>
      {!collapsed && <div className="px-3 pb-3"><SearchButton onClick={() => setSearchOpen(true)} /></div>}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2" onClick={() => setMobileOpen(false)}>
        <div>
          {!collapsed && <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Overview</div>}
          <NavLink to="/" end className={link}><LayoutDashboard /> <span>Dashboard</span></NavLink>
        </div>
        {grouped.map(({ section, items }) => {
          const activeInside = items.some((d) => location.pathname.split("/")[1] === d.route)
          const isOpen = collapsed || activeInside || !closed.has(section)
          return (
            <div key={section}>
              {!collapsed && (
                <button onClick={() => toggleSection(section)} className="mb-1.5 flex w-full cursor-pointer items-center gap-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 hover:text-foreground">
                  <ChevronRight className={cn("size-3 transition-transform", isOpen && "rotate-90")} />
                  {section}
                  <span className="ml-auto font-normal tabular-nums">{items.length}</span>
                </button>
              )}
              {isOpen && (
                <div className="space-y-0.5">
                  {items.map((d) => (
                    <NavLink key={d.route} to={`/${d.route}`} className={link} title={d.plural}>
                      <DoctypeIcon name={d.icon} /> <span className="truncate">{d.plural}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>
      <div className="border-t border-border p-3">
        <button onClick={() => setCollapsed(!collapsed)} className={cn("hidden w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent md:flex", collapsed && "justify-center px-0")}>
          {collapsed ? <PanelLeftOpen className="size-4" /> : <><PanelLeftClose className="size-4" /> Collapse</>}
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-full">
      <aside className={cn("hidden shrink-0 border-r border-border bg-sidebar transition-[width] md:block", collapsed ? "w-16" : "w-64")}>{nav}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border bg-sidebar" onClick={(e) => e.stopPropagation()}>{nav}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 md:px-6">
          <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Menu"><Menu /></Button>
          <Link to={current ? `/${current.route}` : "/"} className="text-sm font-semibold">{title}</Link>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" onClick={toggleTheme} aria-label="Toggle theme">
              <Sun className="hidden dark:block" /><Moon className="dark:hidden" />
            </Button>
            <UserMenu />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-4 md:px-6"><ErrorBoundary key={location.pathname}><Outlet /></ErrorBoundary></div>
        </main>
      </div>
      <CommandPalette open={searchOpen} setOpen={setSearchOpen} />
    </div>
  )
}
