import { Check, Minus } from "lucide-react"
import { useBoot } from "@/hooks/data"
import { Badge } from "@/components/ui/badge"
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table"

const PERMS = ["read", "write", "create", "submit", "cancel", "delete"] as const

/** Read-only view: portal access is governed by ERPNext role permissions, not by a second system. */
export function PageAccess() {
  const { doctypes, roles, user } = useBoot()
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Page Access</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">What {user.full_name} can do in each page. Change this in Desk under Role Permissions Manager.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">{roles.filter((r) => !["All", "Guest"].includes(r)).map((r) => <Badge key={r} tone="info">{r}</Badge>)}</div>
      <div className="rounded-xl border border-border bg-card">
        <Table>
          <THead><TR><TH>Page</TH>{PERMS.map((p) => <TH key={p} className="text-center capitalize">{p}</TH>)}</TR></THead>
          <TBody>
            {doctypes.map((d) => (
              <TR key={d.route}>
                <TD className="font-medium">{d.plural}</TD>
                {PERMS.map((p) => (
                  <TD key={p} className="text-center">{d.perms[p] ? <Check className="mx-auto size-4 text-success" /> : <Minus className="mx-auto size-4 text-muted-foreground/50" />}</TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  )
}
