import * as React from "react"
import { cn } from "@/lib/utils"

export function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      className={cn("size-4 cursor-pointer appearance-none rounded border border-input bg-transparent checked:border-primary checked:bg-primary checked:bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E\")] disabled:cursor-not-allowed disabled:opacity-50", className)}
      {...props}
    />
  )
}
