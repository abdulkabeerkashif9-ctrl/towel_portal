import { useState } from "react"
import { Link } from "react-router-dom"
import { ChevronDown, Layers, LockKeyhole, LogOut, Shield } from "lucide-react"
import { toast } from "sonner"
import { call } from "@/lib/api"
import { useBoot } from "@/hooks/data"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function UserMenu() {
  const { user } = useBoot()
  const [pwOpen, setPwOpen] = useState(false)
  const initial = (user.full_name || user.name).charAt(0).toUpperCase()

  const signOut = async () => {
    await fetch("/api/method/logout", { method: "POST", credentials: "same-origin", headers: { "X-Frappe-CSRF-Token": window.csrf_token ?? "" } }).catch(() => {})
    window.location.href = "/login"
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-full border border-primary/40 py-1 pl-1 pr-3 text-sm font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initial}</span>
          <span className="hidden sm:inline">{user.full_name}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            <div className="font-semibold">{user.full_name}</div>
            <div className="text-xs text-muted-foreground">{user.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {user.is_desk_user && (
            <DropdownMenuItem asChild>
              <a href="/app"><Layers /> Open Desk</a>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link to="/page-access"><Shield /> Page Access</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPwOpen(true)}><LockKeyhole /> Change Password</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={signOut}><LogOut /> Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePassword open={pwOpen} onOpenChange={setPwOpen} />
    </>
  )
}

function ChangePassword({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [oldPw, setOld] = useState("")
  const [newPw, setNew] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await call("change_password", { old_password: oldPw, new_password: newPw })
      toast.success("Password updated")
      setOld(""); setNew("")
      onOpenChange(false)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Change password" description="Use at least 8 characters.">
        <form onSubmit={submit} className="space-y-3">
          <Input type="password" placeholder="Current password" autoComplete="current-password" value={oldPw} onChange={(e) => setOld(e.target.value)} required />
          <Input type="password" placeholder="New password" autoComplete="new-password" value={newPw} onChange={(e) => setNew(e.target.value)} minLength={8} required />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Update password"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
