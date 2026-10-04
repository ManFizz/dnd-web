"use client";

import { createContext, use } from "react";
import type { EvalResult, FValue } from "@/lib/rules/formula";

/**
 * Lets rich text resolve formulas ({DEX}, {8+PROF+INT}) and roll dice found
 * in text. Provided by the character sheet; without it formulas show as text.
 */
export type RichEnv = {
  evaluate?: (expr: string) => EvalResult;
  roll?: (label: string, value: FValue) => void;
};

export const RichEnvContext = createContext<RichEnv>({});

export function useRichEnv(): RichEnv {
  return use(RichEnvContext);
}
