import * as AlertDialogPrimitive from "@base-ui/react/alert-dialog"

import { Button } from "@/components/ui/button"

function AlertDialog({ open, onOpenChange, title, description, confirmLabel = "Continue", cancelLabel = "Cancel", onConfirm, destructive = false, disabled = false }) {
  return <AlertDialogPrimitive.AlertDialog.Root open={open} onOpenChange={onOpenChange}><AlertDialogPrimitive.AlertDialog.Portal><AlertDialogPrimitive.AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" /><AlertDialogPrimitive.AlertDialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-4"><AlertDialogPrimitive.AlertDialog.Popup className="w-full max-w-md rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-2xl outline-none"><AlertDialogPrimitive.AlertDialog.Title className="text-lg font-semibold">{title}</AlertDialogPrimitive.AlertDialog.Title><AlertDialogPrimitive.AlertDialog.Description className="mt-2 text-sm text-muted-foreground">{description}</AlertDialogPrimitive.AlertDialog.Description><div className="mt-6 flex justify-end gap-3"><AlertDialogPrimitive.AlertDialog.Close render={<Button variant="outline" />} disabled={disabled}>{cancelLabel}</AlertDialogPrimitive.AlertDialog.Close><Button variant={destructive ? "destructive" : "default"} onClick={onConfirm} disabled={disabled}>{confirmLabel}</Button></div></AlertDialogPrimitive.AlertDialog.Popup></AlertDialogPrimitive.AlertDialog.Viewport></AlertDialogPrimitive.AlertDialog.Portal></AlertDialogPrimitive.AlertDialog.Root>
}

export { AlertDialog }
