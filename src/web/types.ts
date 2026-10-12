import type { Region } from "../core/types";

export interface Selection {
  in: number | null;
  out: number | null;
  regions: Region[];
}

export const emptySelection: Selection = { in: null, out: null, regions: [] };
