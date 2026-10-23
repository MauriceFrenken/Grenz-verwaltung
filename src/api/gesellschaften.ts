import { supabase } from "@/lib/supabase";
import type { Gesellschaft } from "@/types";

export const gesellschaftenApi = {
  async list(): Promise<Gesellschaft[]> {
    const { data, error } = await supabase
      .from("gesellschaften")
      .select("id, name, kuerzel")
      .order("id", { ascending: true });

    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      kuerzel: String(row.kuerzel),
    }));
  },
};
