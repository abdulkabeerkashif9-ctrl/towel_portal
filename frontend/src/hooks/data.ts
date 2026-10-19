import { createContext, useContext } from "react"
import { useQuery } from "@tanstack/react-query"
import { call } from "@/lib/api"
import type { Boot, MetaBundle } from "@/lib/types"

export const BootContext = createContext<Boot | null>(null)

export function useBoot(): Boot {
  const boot = useContext(BootContext)
  if (!boot) throw new Error("useBoot outside BootContext")
  return boot
}

export function useBootQuery() {
  return useQuery({ queryKey: ["boot"], queryFn: () => call<Boot>("get_boot"), staleTime: 5 * 60_000 })
}

export function useMeta(doctype: string) {
  return useQuery({
    queryKey: ["meta", doctype],
    queryFn: () => call<MetaBundle>("get_doctype_meta", { doctype }),
    staleTime: 10 * 60_000,
  })
}

export function useTheme() {
  const toggle = () => {
    const dark = document.documentElement.classList.toggle("dark")
    try { localStorage.setItem("portal-theme", dark ? "dark" : "light") } catch { /* private mode */ }
  }
  return toggle
}
