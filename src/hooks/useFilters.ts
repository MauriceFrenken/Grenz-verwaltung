import { useState } from "react";
import type { Filter } from "@/types";

export function useFilters(initial: Filter = {}) {
  const [filter, setFilter] = useState<Filter>(initial);
  const update = <K extends keyof Filter>(key: K, value: Filter[K]) =>
    setFilter((prev) => ({ ...prev, [key]: value }));
  const reset = () => setFilter(initial);
  return { filter, setFilter, update, reset };
}