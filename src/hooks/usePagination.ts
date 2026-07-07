import { useState } from "react";

export function usePagination(initialSize = 25) {
  const [seite, setSeite] = useState(1);
  const [seitengroesse, setSeitengroesse] = useState(initialSize);
  return { seite, seitengroesse, setSeite, setSeitengroesse };
}