import { cn } from "@/lib/utils"

const tones = {
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/15 text-destructive",
  info: "bg-primary/15 text-primary",
  muted: "bg-muted text-muted-foreground",
}

export function Badge({ tone = "muted", className, children }: { tone?: keyof typeof tones; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>
}
