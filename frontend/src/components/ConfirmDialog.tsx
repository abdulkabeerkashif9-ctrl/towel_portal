import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"

interface Props {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({ open, title, description, confirmLabel, destructive, onConfirm, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title} description={description}>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Back</Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={() => { onClose(); onConfirm() }}>{confirmLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
