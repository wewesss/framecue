import type { Region } from "../core/types";

export interface Selection {
  in: number | null;
  out: number | null;
  region: Region | null;
}

export const emptySelection: Selection = { in: null, out: null, region: null };
