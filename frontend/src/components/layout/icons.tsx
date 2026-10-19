import { Banknote, BookOpen, Boxes, ClipboardList, Database, FileText, Package, Receipt, Settings, ShoppingCart, Truck, Users, type LucideIcon } from "lucide-react"

const map: Record<string, LucideIcon> = {
  receipt: Receipt,
  truck: Truck,
  "shopping-cart": ShoppingCart,
  boxes: Boxes,
  banknote: Banknote,
  "book-open": BookOpen,
  "clipboard-list": ClipboardList,
  package: Package,
  users: Users,
  settings: Settings,
  database: Database,
  "file-text": FileText,
}

export function DoctypeIcon({ name, className }: { name: string; className?: string }) {
  const Icon = map[name] ?? FileText
  return <Icon className={className} />
}
