"use client";

import { mergeAttributes, Node, nodeInputRule } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState, type Editor, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Sigma,
  Strikethrough,
  Table as TableIcon,
  Underline,
  Undo2,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import type { RichDoc } from "@/lib/rules/richtext";
import { Menu } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { useReadOnly } from "@/components/ui/read-only";
import { FormulaChip } from "./view";

function FormulaView({ node, updateAttributes, selected, deleteNode }: NodeViewProps) {
  const ask = useAsk();
  const expr = String(node.attrs.expr ?? "");
  return (
    <NodeViewWrapper as="span" className="inline">
      <FormulaChip
        expr={expr}
        selected={selected}
        onEdit={async () => {
          const next = await ask.text({
            title: "Формула",
            label: "Выражение",
            defaultValue: expr,
            description: "Например: 1d4+2, DEX, 8+PROF+INT, @counter.рубины. Пустое поле удалит формулу.",
          });
          if (next === null) return;
          if (!next.trim()) deleteNode();
          else updateAttributes({ expr: next.trim() });
        }}
      />
    </NodeViewWrapper>
  );
}

/** Inline formula: `{1d4+DEX}` typed in text becomes a live chip. */
export const FormulaNode = Node.create({
  name: "formula",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { expr: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "span[data-formula]", getAttrs: (el) => ({ expr: (el as HTMLElement).getAttribute("data-formula") ?? "" }) }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-formula": node.attrs.expr }), `{${node.attrs.expr}}`];
  },
  renderText({ node }) {
    return `{${node.attrs.expr}}`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(FormulaView);
  },
  addInputRules() {
    return [
      nodeInputRule({
        find: /\{([^{}\n]{1,200})\}$/,
        type: this.type,
        getAttributes: (match) => ({ expr: match[1].trim() }),
      }),
    ];
  },
});

const extensions = (placeholder: string) => [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
    link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
    codeBlock: false,
    code: false,
  }),
  Placeholder.configure({ placeholder }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  FormulaNode,
];

function ToolButton({
  active,
  onClick,
  title,
  children,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-panel-3 hover:text-text disabled:opacity-35 [&_svg]:size-4",
        active && "bg-accent-soft text-accent",
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const ask = useAsk();
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      table: e.isActive("table"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-1.5 py-1">
      <ToolButton title="Жирный (Ctrl+B)" active={state.bold} onClick={() => chain().toggleBold().run()}>
        <Bold />
      </ToolButton>
      <ToolButton title="Курсив (Ctrl+I)" active={state.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic />
      </ToolButton>
      <ToolButton title="Подчёркнутый (Ctrl+U)" active={state.underline} onClick={() => chain().toggleUnderline().run()}>
        <Underline />
      </ToolButton>
      <ToolButton title="Зачёркнутый" active={state.strike} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough />
      </ToolButton>
      <span className="mx-1 h-5 w-px bg-line" />
      <ToolButton title="Заголовок" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
        <Heading2 />
      </ToolButton>
      <ToolButton title="Подзаголовок" active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
        <Heading3 />
      </ToolButton>
      <ToolButton title="Список" active={state.bullet} onClick={() => chain().toggleBulletList().run()}>
        <List />
      </ToolButton>
      <ToolButton title="Нумерованный список" active={state.ordered} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered />
      </ToolButton>
      <ToolButton title="Цитата" active={state.quote} onClick={() => chain().toggleBlockquote().run()}>
        <Quote />
      </ToolButton>
      <ToolButton title="Разделитель" onClick={() => chain().setHorizontalRule().run()}>
        <Minus />
      </ToolButton>
      <span className="mx-1 h-5 w-px bg-line" />
      <ToolButton
        title="Ссылка"
        active={state.link}
        onClick={async () => {
          const prev = (editor.getAttributes("link").href as string | undefined) ?? "";
          const url = await ask.text({ title: "Ссылка", label: "Адрес", defaultValue: prev, placeholder: "https://dnd.su/…" });
          if (url === null) return;
          if (!url.trim()) chain().extendMarkRange("link").unsetLink().run();
          else chain().extendMarkRange("link").setLink({ href: url.trim() }).run();
        }}
      >
        <Link2 />
      </ToolButton>
      {state.table ? (
        <Menu
          align="start"
          trigger={
            <button type="button" title="Таблица" className="inline-flex size-7 items-center justify-center rounded-md bg-accent-soft text-accent [&_svg]:size-4">
              <TableIcon />
            </button>
          }
          items={[
            { label: "Строка ниже", onSelect: () => chain().addRowAfter().run() },
            { label: "Столбец справа", onSelect: () => chain().addColumnAfter().run() },
            { label: "Удалить строку", onSelect: () => chain().deleteRow().run() },
            { label: "Удалить столбец", onSelect: () => chain().deleteColumn().run() },
            "separator",
            { label: "Удалить таблицу", danger: true, onSelect: () => chain().deleteTable().run() },
          ]}
        />
      ) : (
        <ToolButton title="Таблица" onClick={() => chain().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()}>
          <TableIcon />
        </ToolButton>
      )}
      <ToolButton
        title="Формула: {1d4+DEX} считается по персонажу"
        onClick={async () => {
          const expr = await ask.text({
            title: "Вставить формулу",
            label: "Выражение",
            placeholder: "1d6 + INT",
            description: "Кости (1d6, 2к8), характеристики (СИЛ, DEX, @int.mod), PROF, LVL, @spell.dc, счётчики (@counter.рубины). Можно и прямо в тексте: {1d4+2}.",
          });
          if (expr?.trim()) chain().insertContent({ type: "formula", attrs: { expr: expr.trim() } }).run();
        }}
      >
        <Sigma />
      </ToolButton>
      <span className="ml-auto" />
      <ToolButton title="Отменить" disabled={!state.canUndo} onClick={() => chain().undo().run()}>
        <Undo2 />
      </ToolButton>
      <ToolButton title="Повторить" disabled={!state.canRedo} onClick={() => chain().redo().run()}>
        <Redo2 />
      </ToolButton>
    </div>
  );
}

const EMPTY: RichDoc = { type: "doc", content: [{ type: "paragraph" }] };

/**
 * Rich text editor. With `debounceMs` the value is reported after a pause and
 * on blur, which keeps the character journal and autosave calm while typing.
 */
export function RichEditor({
  value,
  onChange,
  placeholder = "Пишите здесь… {1d6+DEX} превратится в формулу",
  className,
  debounceMs = 0,
  autoFocus,
  minHeight = "6rem",
}: {
  value: RichDoc | null | undefined;
  onChange: (doc: RichDoc) => void;
  placeholder?: string;
  className?: string;
  debounceMs?: number;
  autoFocus?: boolean;
  minHeight?: string;
}) {
  const onChangeRef = useRef(onChange);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef<string>(JSON.stringify(value ?? EMPTY));
  const readOnly = useReadOnly();

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const flush = (editor: Editor) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const json = editor.getJSON() as RichDoc;
    const text = JSON.stringify(json);
    if (text === lastSent.current) return;
    lastSent.current = text;
    onChangeRef.current(json);
  };

  const editor = useEditor({
    extensions: extensions(placeholder),
    content: value ?? EMPTY,
    immediatelyRender: false,
    editable: !readOnly,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: { class: "rich text-sm px-3 py-2.5 focus:outline-none", style: `min-height:${minHeight}` },
    },
    onUpdate: ({ editor: e }) => {
      if (!debounceMs) return flush(e);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(e), debounceMs);
    },
    onBlur: ({ editor: e }) => flush(e),
  });

  // Follow outside changes (undo, import) while the editor is not focused.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const incoming = JSON.stringify(value ?? EMPTY);
    if (incoming === lastSent.current) return;
    lastSent.current = incoming;
    editor.commands.setContent(value ?? EMPTY, { emitUpdate: false });
  }, [editor, value]);

  // Report pending text when the editor goes away (tab switch, dialog close).
  useEffect(() => {
    return () => {
      if (editor && timer.current) flush(editor);
    };
  }, [editor]);

  return (
    <div className={cn("overflow-hidden rounded-lg border border-line bg-panel-2 focus-within:border-accent", className)}>
      {readOnly ? null : editor ? <Toolbar editor={editor} /> : <div className="h-9 border-b border-line" />}
      <EditorContent editor={editor} />
    </div>
  );
}
