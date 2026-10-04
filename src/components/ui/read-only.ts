"use client";

import { createContext, use } from "react";

/**
 * True when the surrounding screen is view-only (the GM looking at a player's
 * sheet). Form controls from the UI kit read it and stop accepting input.
 */
export const ReadOnlyContext = createContext(false);

export const useReadOnly = () => use(ReadOnlyContext);
