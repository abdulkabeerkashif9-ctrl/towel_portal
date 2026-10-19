import { Banknote, BookOpen, Boxes, FileText, Receipt, ShoppingCart, Truck, type LucideIcon } from "lucide-react"

const map: Record<string, LucideIcon> = {
  receipt: Receipt,
  truck: Truck,
  "shopping-cart": ShoppingCart,
  boxes: Boxes,
  banknote: Banknote,
  "book-open": BookOpen,
}

export function DoctypeIcon({ name, className }: { name: string; className?: string }) {
  const Icon = map[name] ?? FileText
  return <Icon className={className} />
}
