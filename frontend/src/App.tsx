import { BrowserRouter, Route, Routes } from "react-router-dom"
import { useEffect } from "react"
import { Toaster } from "sonner"
import { DialogHost } from "@/compat/DialogHost"
import { showServerMessages } from "@/compat/ui"
import { onServerMessages } from "@/lib/api"
import { BootContext, useBootQuery } from "@/hooks/data"
import { AppShell } from "@/components/layout/AppShell"
import { Skeleton } from "@/components/ui/skeleton"
import { Dashboard } from "@/pages/Dashboard"
import { FormPage } from "@/pages/FormPage"
import { ListPage } from "@/pages/ListPage"
import { PageAccess } from "@/pages/PageAccess"

export default function App() {
  const { data, error } = useBootQuery()
  useEffect(() => onServerMessages(showServerMessages), [])

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <p className="font-medium">Couldn’t load the portal</p>
        <p className="max-w-sm text-sm text-muted-foreground">{(error as Error).message}</p>
        <a className="mt-2 text-sm text-primary underline" href="/login?redirect-to=/portal">Sign in again</a>
      </div>
    )
  }
  if (!data) return <div className="flex h-full"><Skeleton className="m-4 h-[calc(100%-2rem)] w-64" /><div className="flex-1 space-y-4 p-8"><Skeleton className="h-10 w-72" /><Skeleton className="h-96" /></div></div>

  return (
    <BootContext.Provider value={data}>
      <BrowserRouter basename={import.meta.env.DEV ? "/" : "/portal"}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="page-access" element={<PageAccess />} />
            <Route path=":route" element={<ListPage />} />
            <Route path=":route/:name" element={<FormPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <DialogHost />
      <Toaster theme="system" position="bottom-right" richColors />
    </BootContext.Provider>
  )
}
