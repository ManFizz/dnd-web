"use client";

import { Maximize, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { gridDistance, normRect, snap, type FogOp, type MapPin, type MapRow, type MapToken } from "@/lib/maps";
import { Button } from "@/components/ui/button";

// The map canvas: an SVG whose viewBox is the camera. Wheel zooms around the
// cursor, dragging the background pans; tools draw fog rectangles, drop pins
// and measure distances. Coordinates are image pixels.

export type MapTool = "pan" | "reveal" | "hide" | "pin" | "measure";

type Pt = { x: number; y: number };
type View = { x: number; y: number; w: number; h: number };

const PIN_FILL: Record<MapPin["color"], string> = {
  accent: "var(--accent)",
  danger: "var(--danger)",
  good: "var(--good)",
  info: "var(--info)",
  magic: "var(--magic)",
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

export function MapView({
  map,
  imageUrl,
  gm,
  tool = "pan",
  canMove,
  onMove,
  onFog,
  onPin,
  onPinClick,
  onTokenClick,
  activeTokenId,
  className,
}: {
  map: MapRow;
  imageUrl: string | null;
  /** The GM sees through the fog (dimmed) and hidden things (faded). */
  gm: boolean;
  tool?: MapTool;
  canMove?: (t: MapToken) => boolean;
  onMove?: (t: MapToken, p: Pt) => void;
  onFog?: (op: FogOp) => void;
  onPin?: (p: Pt) => void;
  onPinClick?: (pin: MapPin) => void;
  onTokenClick?: (t: MapToken) => void;
  /** Highlighted token (whose turn it is). */
  activeTokenId?: string | null;
  className?: string;
}) {
  const width = map.width || 1600;
  const height = map.height || 1000;
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, w: width, h: height });
  const viewRef = useRef(view);
  useLayoutEffect(() => {
    viewRef.current = view;
  });
  const maskId = useId().replace(/:/g, "");
  const gridId = `${maskId}g`;

  // A new picture (another map) resets the camera.
  const [camFor, setCamFor] = useState(`${map.id}:${width}x${height}`);
  if (camFor !== `${map.id}:${width}x${height}`) {
    setCamFor(`${map.id}:${width}x${height}`);
    setView({ x: 0, y: 0, w: width, h: height });
  }

  const [drag, setDrag] = useState<
    | { kind: "pan"; start: Pt; view: View }
    | { kind: "rect"; op: FogOp["op"]; a: Pt; b: Pt }
    | { kind: "measure"; a: Pt; b: Pt }
    | { kind: "token"; token: MapToken; p: Pt; moved: boolean }
    | null
  >(null);

  const toPoint = useCallback((clientX: number, clientY: number): Pt => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const zoom = useCallback(
    (factor: number, around?: Pt) => {
      setView((v) => {
        const w = Math.min(width * 4, Math.max(width / 40, v.w * factor));
        const h = (v.h / v.w) * w;
        const c = around ?? { x: v.x + v.w / 2, y: v.y + v.h / 2 };
        return { x: c.x - ((c.x - v.x) / v.w) * w, y: c.y - ((c.y - v.y) / v.h) * h, w, h };
      });
    },
    [width],
  );

  // React's wheel listener is passive; the page must not scroll while zooming.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, toPoint(e.clientX, e.clientY));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoom, toPoint]);

  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const p = toPoint(e.clientX, e.clientY);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (tool === "reveal" || tool === "hide") setDrag({ kind: "rect", op: tool, a: p, b: p });
    else if (tool === "measure") setDrag({ kind: "measure", a: p, b: p });
    else if (tool === "pin") onPin?.({ x: Math.round(p.x), y: Math.round(p.y) });
    else setDrag({ kind: "pan", start: { x: e.clientX, y: e.clientY }, view: viewRef.current });
  };

  const tokenDown = (e: React.PointerEvent, t: MapToken) => {
    if (e.button !== 0 || tool !== "pan") return;
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    if (canMove?.(t)) setDrag({ kind: "token", token: t, p: { x: t.x, y: t.y }, moved: false });
    else onTokenClick?.(t);
  };

  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    if (drag.kind === "pan") {
      const rect = svgRef.current!.getBoundingClientRect();
      // preserveAspectRatio="meet": one screen pixel is the larger ratio.
      const k = Math.max(drag.view.w / rect.width, drag.view.h / rect.height);
      setView({ ...drag.view, x: drag.view.x - (e.clientX - drag.start.x) * k, y: drag.view.y - (e.clientY - drag.start.y) * k });
      return;
    }
    const p = toPoint(e.clientX, e.clientY);
    if (drag.kind === "token") setDrag({ ...drag, p, moved: drag.moved || Math.hypot(p.x - drag.token.x, p.y - drag.token.y) > map.grid.size / 4 });
    else setDrag({ ...drag, b: p });
  };

  const up = () => {
    if (!drag) return;
    if (drag.kind === "rect") {
      const r = normRect(drag.a, drag.b, width, height);
      if (r.w > 2 && r.h > 2) onFog?.({ op: drag.op, ...r });
    } else if (drag.kind === "token") {
      if (drag.moved) onMove?.(drag.token, snap(map.grid, drag.p.x, drag.p.y, drag.token.size));
      else onTokenClick?.(drag.token);
    }
    setDrag(null);
  };

  // Marker sizes follow the zoom so they stay readable.
  const unit = view.w / 70;
  const cell = map.grid.size;
  const fogOpacity = gm ? 0.55 : 1;
  const draggedId = drag?.kind === "token" ? drag.token.id : null;

  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-line bg-[#0b0b0f]", className)}>
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        className={cn(
          "block h-full w-full touch-none select-none",
          tool === "pan" ? (drag?.kind === "pan" ? "cursor-grabbing" : "cursor-grab") : "cursor-crosshair",
        )}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setDrag(null)}
        role="img"
        aria-label={map.name}
      >
        <defs>
          <pattern id={gridId} width={cell} height={cell} patternUnits="userSpaceOnUse" x={map.grid.offsetX} y={map.grid.offsetY}>
            <path d={`M ${cell} 0 L 0 0 0 ${cell}`} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={Math.max(1, cell / 50)} />
          </pattern>
          <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
            <rect width={width} height={height} fill="white" />
            {map.fog.ops.map((o, i) => (
              <rect key={i} x={o.x} y={o.y} width={o.w} height={o.h} fill={o.op === "reveal" ? "black" : "white"} />
            ))}
          </mask>
        </defs>

        {imageUrl ? (
          <image href={imageUrl} x={0} y={0} width={width} height={height} preserveAspectRatio="none" />
        ) : (
          <rect width={width} height={height} fill="#2a2a33" />
        )}
        {map.grid.show && <rect width={width} height={height} fill={`url(#${gridId})`} pointerEvents="none" />}
        {/* Players get fogged pins and tokens filtered out on the server, so markers go above the fog. */}
        {map.fog.enabled && <rect width={width} height={height} fill="#0b0b0f" opacity={fogOpacity} mask={`url(#${maskId})`} pointerEvents="none" />}

        {map.pins.map((p) => (
          <g
            key={p.id}
            transform={`translate(${p.x} ${p.y})`}
            className="cursor-pointer"
            opacity={p.hidden ? 0.55 : 1}
            onPointerDown={(e) => {
              if (tool !== "pan") return;
              e.stopPropagation();
              onPinClick?.(p);
            }}
          >
            <title>{p.label}</title>
            <path
              d={`M 0 0 C ${-unit * 0.9} ${-unit * 1.4} ${-unit * 1.2} ${-unit * 2.4} 0 ${-unit * 2.6} C ${unit * 1.2} ${-unit * 2.4} ${unit * 0.9} ${-unit * 1.4} 0 0 Z`}
              fill={PIN_FILL[p.color]}
              stroke="#111"
              strokeWidth={unit * 0.12}
              strokeDasharray={p.hidden ? `${unit * 0.3} ${unit * 0.2}` : undefined}
            />
            <circle cy={-unit * 1.75} r={unit * 0.4} fill="#111" />
            {p.label && (
              <text
                y={unit * 1.1}
                textAnchor="middle"
                fontSize={unit * 1.1}
                fontWeight={600}
                fill="#fff"
                stroke="#000"
                strokeWidth={unit * 0.25}
                paintOrder="stroke"
                className="pointer-events-none"
              >
                {p.label}
              </text>
            )}
          </g>
        ))}

        {map.tokens.map((t) => {
          const at = t.id === draggedId && drag?.kind === "token" ? drag.p : t;
          const r = (t.size * cell) / 2;
          const movable = canMove?.(t) ?? false;
          return (
            <g
              key={t.id}
              transform={`translate(${at.x} ${at.y})`}
              opacity={t.hidden ? 0.5 : 1}
              className={movable && tool === "pan" ? "cursor-move" : "cursor-pointer"}
              onPointerDown={(e) => tokenDown(e, t)}
              data-token={t.name}
            >
              <title>{t.name}</title>
              {t.id === activeTokenId && <circle r={r * 1.25} fill="none" stroke="var(--accent)" strokeWidth={r * 0.18} />}
              <circle
                r={r * 0.92}
                fill={t.color}
                stroke={t.kind === "pc" ? "#fff" : "#111"}
                strokeWidth={r * 0.1}
                strokeDasharray={t.hidden ? `${r * 0.3} ${r * 0.2}` : undefined}
              />
              <text textAnchor="middle" dominantBaseline="central" fontSize={r * 0.8} fontWeight={700} fill="#fff" className="pointer-events-none">
                {initials(t.name)}
              </text>
            </g>
          );
        })}

        {drag?.kind === "rect" &&
          (() => {
            const r = normRect(drag.a, drag.b, width, height);
            return (
              <rect
                {...{ x: r.x, y: r.y, width: r.w, height: r.h }}
                fill={drag.op === "reveal" ? "rgba(212,173,63,0.15)" : "rgba(0,0,0,0.4)"}
                stroke="var(--accent)"
                strokeWidth={unit * 0.2}
                strokeDasharray={`${unit} ${unit / 2}`}
              />
            );
          })()}
        {drag?.kind === "measure" && (
          <g pointerEvents="none">
            <line
              x1={drag.a.x}
              y1={drag.a.y}
              x2={drag.b.x}
              y2={drag.b.y}
              stroke="var(--accent)"
              strokeWidth={unit * 0.3}
              strokeDasharray={`${unit} ${unit / 2}`}
            />
            <text
              x={drag.b.x}
              y={drag.b.y - unit}
              fontSize={unit * 1.6}
              fontWeight={700}
              fill="#fff"
              stroke="#000"
              strokeWidth={unit * 0.3}
              paintOrder="stroke"
              textAnchor="middle"
            >
              {gridDistance(map.grid, drag.a, drag.b)} фт.
            </text>
          </g>
        )}
      </svg>
      <div className="absolute right-2 bottom-2 flex flex-col gap-1">
        <Button size="icon-sm" variant="secondary" aria-label="Приблизить" onClick={() => zoom(1 / 1.4)}>
          <Plus />
        </Button>
        <Button size="icon-sm" variant="secondary" aria-label="Отдалить" onClick={() => zoom(1.4)}>
          <Minus />
        </Button>
        <Button size="icon-sm" variant="secondary" aria-label="Вся карта" onClick={() => setView({ x: 0, y: 0, w: width, h: height })}>
          <Maximize />
        </Button>
      </div>
    </div>
  );
}
