"use client";

import { Fragment } from "react";
import { cn } from "@/lib/cn";
import { DICE_IN_TEXT, formatValue, hasDice, type FValue } from "@/lib/rules/formula";
import type { RichDoc, RichMark, RichNode } from "@/lib/rules/richtext";
import { Tip } from "@/components/ui/overlay";
import { useRichEnv } from "./context";

/** Inline chip for a formula: shows the computed value, rolls when it has dice. */
export function FormulaChip({ expr, label, onEdit, selected }: { expr: string; label?: string; onEdit?: () => void; selected?: boolean }) {
  const env = useRichEnv();
  const result = env.evaluate ? env.evaluate(expr) : null;
  const base =
    "formula-chip inline-flex items-baseline rounded-md px-1 mx-px font-semibold tabular-nums leading-tight align-baseline transition-colors";
  if (!result) {
    return (
      <span className={cn(base, "bg-panel-3 text-muted")} onClick={onEdit} title={onEdit ? "Изменить формулу" : undefined}>
        {`{${expr}}`}
      </span>
    );
  }
  if (!result.ok) {
    return (
      <Tip content={`Ошибка в формуле «${expr}»: ${result.error}`}>
        <span className={cn(base, "bg-danger-soft text-danger", onEdit && "cursor-pointer")} onClick={onEdit}>
          {`{${expr}}`}
        </span>
      </Tip>
    );
  }
  const value = result.value;
  const dice = hasDice(value);
  const text = formatValue(value);
  const tip = `${expr} = ${text}${dice ? (onEdit ? "" : " · нажмите, чтобы бросить") : ""}`;
  return (
    <Tip content={tip}>
      <span
        role={dice && !onEdit ? "button" : undefined}
        tabIndex={dice && !onEdit ? 0 : undefined}
        onClick={() => {
          if (onEdit) onEdit();
          else if (dice) env.roll?.(label ?? expr, value);
        }}
        className={cn(
          base,
          dice ? "bg-accent-soft text-accent" : "bg-info-soft text-info",
          (dice || onEdit) && "cursor-pointer hover:brightness-125",
          selected && "outline outline-2 outline-accent",
        )}
      >
        {text}
      </span>
    </Tip>
  );
}

function diceValue(m: RegExpExecArray): FValue {
  const count = m[1] ? Number(m[1]) : 1;
  const sides = Number(m[2]);
  const sign = m[3] === "-" || m[3] === "−" ? -1 : 1;
  const n = m[4] ? sign * Number(m[4]) : 0;
  return { n, dice: [{ count: Math.max(1, count), sides, sign: 1 }] };
}

/** Plain text with clickable dice notation ("2к6", "1d8 + 3"). */
function DiceText({ text, label }: { text: string; label?: string }) {
  const env = useRichEnv();
  if (!env.roll) return <>{text}</>;
  const re = new RegExp(DICE_IN_TEXT.source, DICE_IN_TEXT.flags);
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const sides = Number(m[2]);
    if (![2, 3, 4, 6, 8, 10, 12, 20, 100].includes(sides)) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    const value = diceValue(m);
    const roll = env.roll;
    const matched = m[0];
    out.push(
      <button
        key={m.index}
        type="button"
        onClick={() => roll(label ?? matched, value)}
        title="Бросить"
        className="rounded px-0.5 font-semibold text-accent underline decoration-accent/40 decoration-dotted underline-offset-2 hover:bg-accent-soft"
      >
        {m[0]}
      </button>,
    );
    last = m.index + m[0].length;
  }
  if (!out.length) return <>{text}</>;
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

function withMarks(content: React.ReactNode, marks: RichMark[] | undefined, key: React.Key): React.ReactNode {
  let node = content;
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case "bold":
        node = <strong>{node}</strong>;
        break;
      case "italic":
        node = <em>{node}</em>;
        break;
      case "underline":
        node = <u>{node}</u>;
        break;
      case "strike":
        node = <s>{node}</s>;
        break;
      case "code":
        node = <code>{node}</code>;
        break;
      case "link": {
        const href = String(mark.attrs?.href ?? "");
        if (/^https?:\/\//i.test(href) || href.startsWith("/")) {
          node = (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {node}
            </a>
          );
        }
        break;
      }
    }
  }
  return <Fragment key={key}>{node}</Fragment>;
}

function renderNodes(nodes: RichNode[] | undefined, label: string | undefined): React.ReactNode[] {
  return (nodes ?? []).map((n, i) => renderNode(n, i, label));
}

function renderNode(node: RichNode, key: number, label: string | undefined): React.ReactNode {
  const children = () => renderNodes(node.content, label);
  switch (node.type) {
    case "text": {
      const isLink = node.marks?.some((m) => m.type === "link");
      const inner = isLink ? node.text : <DiceText text={node.text ?? ""} label={label} />;
      return withMarks(inner, node.marks, key);
    }
    case "formula":
      return <FormulaChip key={key} expr={String(node.attrs?.expr ?? "")} label={label} />;
    case "hardBreak":
      return <br key={key} />;
    case "paragraph":
      return <p key={key}>{node.content?.length ? children() : <br />}</p>;
    case "heading": {
      const level = Math.min(4, Math.max(1, Number(node.attrs?.level ?? 3)));
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
      return <Tag key={key}>{children()}</Tag>;
    }
    case "bulletList":
      return <ul key={key}>{children()}</ul>;
    case "orderedList":
      return (
        <ol key={key} start={Number(node.attrs?.start ?? 1)}>
          {children()}
        </ol>
      );
    case "listItem":
      return <li key={key}>{children()}</li>;
    case "blockquote":
      return <blockquote key={key}>{children()}</blockquote>;
    case "horizontalRule":
      return <hr key={key} />;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{(node.content ?? []).map((c) => c.text ?? "").join("")}</code>
        </pre>
      );
    case "table":
      return (
        <div key={key} className="table-wrap">
          <table>
            <tbody>{children()}</tbody>
          </table>
        </div>
      );
    case "tableRow":
      return <tr key={key}>{children()}</tr>;
    case "tableHeader":
    case "tableCell": {
      const Tag = node.type === "tableHeader" ? "th" : "td";
      return (
        <Tag key={key} colSpan={Number(node.attrs?.colspan ?? 1)} rowSpan={Number(node.attrs?.rowspan ?? 1)}>
          {children()}
        </Tag>
      );
    }
    default:
      return node.content ? <Fragment key={key}>{children()}</Fragment> : null;
  }
}

export function RichView({ doc, className, label, empty }: { doc: RichDoc | null | undefined; className?: string; label?: string; empty?: React.ReactNode }) {
  const nodes = doc?.content ?? [];
  const isEmpty = !nodes.length || nodes.every((n) => n.type === "paragraph" && !n.content?.length);
  if (isEmpty) return empty ? <>{empty}</> : null;
  return <div className={cn("rich text-sm", className)}>{renderNodes(nodes, label)}</div>;
}
