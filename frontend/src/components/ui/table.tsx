import * as React from "react"
import { cn } from "@/lib/utils"

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  )
}
export const THead = (p: React.ComponentProps<"thead">) => <thead className="[&_tr]:border-b" {...p} />
export const TBody = (p: React.ComponentProps<"tbody">) => <tbody className="[&_tr:last-child]:border-0" {...p} />
export function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-b border-border transition-colors", className)} {...props} />
}
export function TH({ className, ...props }: React.ComponentProps<"th">) {
  return <th className={cn("h-9 whitespace-nowrap px-3 text-left align-middle text-[11px] font-medium uppercase tracking-wider text-muted-foreground", className)} {...props} />
}
export function TD({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("whitespace-nowrap px-3 py-2.5 align-middle", className)} {...props} />
}
