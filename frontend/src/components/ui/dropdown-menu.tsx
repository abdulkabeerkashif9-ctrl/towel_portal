import * as React from "react"
import * as M from "@radix-ui/react-dropdown-menu"
import { cn } from "@/lib/utils"

export const DropdownMenu = M.Root
export const DropdownMenuTrigger = M.Trigger

export function DropdownMenuContent({ className, sideOffset = 8, ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        sideOffset={sideOffset}
        className={cn("z-50 min-w-56 rounded-lg border border-border bg-card p-1.5 text-foreground shadow-xl shadow-black/30 data-[state=open]:animate-in data-[state=open]:fade-in-0", className)}
        {...props}
      />
    </M.Portal>
  )
}

export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof M.Item>) {
  return (
    <M.Item
      className={cn("flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground", className)}
      {...props}
    />
  )
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-2.5 py-2", className)} {...props} />
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof M.Separator>) {
  return <M.Separator className={cn("-mx-1.5 my-1.5 h-px bg-border", className)} {...props} />
}
