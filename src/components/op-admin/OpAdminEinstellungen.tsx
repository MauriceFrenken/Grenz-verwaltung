import { Settings } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useOpAdminStore } from "@/store/op-admin";

export function OpAdminEinstellungen() {
  const zensurAktiv = useOpAdminStore((s) => s.zensurAktiv);
  const setZensurAktiv = useOpAdminStore((s) => s.setZensurAktiv);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center hover:bg-surface-muted"
          aria-label="OP Admin"
        >
          <Settings className="h-4 w-4 text-text-muted" strokeWidth={1.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        data-op-zensur-ausnahme=""
        className="w-56 rounded-none border-hairline p-4 shadow-none"
      >
        <p className="label-caps text-text-subtle">OP Admin</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <Label htmlFor="op-admin-zensur" className="text-sm font-medium text-heading">
            Zensur
          </Label>
          <Switch
            id="op-admin-zensur"
            checked={zensurAktiv}
            onCheckedChange={setZensurAktiv}
            aria-label="Zensur"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
