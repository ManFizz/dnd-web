"use client";

import { useCallback, useState } from "react";

const SVG_SRC = /^data:image\/svg|\.svg(?:[?#]|$)/i;

/** Portrait that falls back when the image is missing or fails to load (e.g. an expired link). */
export function AvatarImage({ src, className, fallback }: { src: string; className?: string; fallback: React.ReactNode }) {
  const [failed, setFailed] = useState<string | null>(null);
  // A server-rendered image can fail before hydration attaches onError, so check its state on mount.
  // SVGs without an intrinsic size report naturalWidth 0 in some browsers, so they rely on onError alone.
  const check = useCallback(
    (img: HTMLImageElement | null) => {
      if (img?.complete && img.naturalWidth === 0 && !SVG_SRC.test(src)) setFailed(src);
    },
    [src],
  );
  if (!src || failed === src) return <>{fallback}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={check} src={src} alt="" className={className} onError={() => setFailed(src)} />;
}
