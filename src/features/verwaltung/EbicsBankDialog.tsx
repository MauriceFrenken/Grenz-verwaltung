import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EbicsAktionenPanel } from "./EbicsAktionenPanel";

export function EbicsBankDialog({
  offen,
  onOpenChange,
  gesellschaftId,
}: {
  offen: boolean;
  onOpenChange: (offen: boolean) => void;
  gesellschaftId?: string | null;
}) {
  return (
    <Dialog open={offen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-none">
        <DialogHeader>
          <DialogTitle>EBICS</DialogTitle>
        </DialogHeader>
        {offen ? (
          <EbicsAktionenPanel gesellschaftId={gesellschaftId} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
