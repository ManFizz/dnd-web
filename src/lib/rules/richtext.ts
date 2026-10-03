// Rich text is stored as ProseMirror/TipTap JSON. These helpers work on the
// plain JSON so they can run on the server, in tests and in the browser.

export type RichMark = { type: string; attrs?: Record<string, unknown> };

export type RichNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  text?: string;
  marks?: RichMark[];
};

export type RichDoc = { type: "doc"; content?: RichNode[] };

export function emptyDoc(): RichDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/** Build a document from plain text: one paragraph per line. */
export function textToDoc(text: string): RichDoc {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return {
    type: "doc",
    content: lines.map((line) =>
      line.trim() ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" },
    ),
  };
}

/** Flatten a document to plain text (used for search, previews and exports). */
export function docToText(doc: RichDoc | RichNode | null | undefined): string {
  if (!doc) return "";
  const out: string[] = [];
  const walk = (node: RichNode, depth: number) => {
    if (node.type === "text") {
      out.push(node.text ?? "");
      return;
    }
    if (node.type === "formula") {
      out.push(`{${String(node.attrs?.expr ?? "")}}`);
      return;
    }
    if (node.type === "hardBreak") {
      out.push("\n");
      return;
    }
    const block = node.type !== "doc" && node.type !== "text";
    if (node.type === "listItem") out.push("• ");
    for (const child of node.content ?? []) walk(child, depth + 1);
    if (block && depth > 0 && !["listItem", "tableCell", "tableHeader"].includes(node.type)) out.push("\n");
    if (["listItem", "tableRow"].includes(node.type)) out.push("\n");
    if (["tableCell", "tableHeader"].includes(node.type)) out.push(" | ");
  };
  walk(doc as RichNode, 0);
  return out
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isDocEmpty(doc: RichDoc | null | undefined): boolean {
  if (!doc?.content?.length) return true;
  return docToText(doc).trim().length === 0 && !JSON.stringify(doc).includes('"formula"');
}

/** Split a document into sections by headings (level 1-3). */
export function splitDocByHeadings(doc: RichDoc): { title: string; doc: RichDoc }[] {
  const sections: { title: string; doc: RichDoc }[] = [];
  let current: { title: string; doc: RichDoc } | null = null;
  for (const node of doc.content ?? []) {
    if (node.type === "heading") {
      current = { title: docToText(node).trim(), doc: { type: "doc", content: [] } };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { title: "", doc: { type: "doc", content: [] } };
      sections.push(current);
    }
    current.doc.content!.push(node);
  }
  return sections
    .map((s) => ({ ...s, doc: trimDoc(s.doc) }))
    .filter((s) => s.title || !isDocEmpty(s.doc));
}

/** Remove leading and trailing empty paragraphs. */
export function trimDoc(doc: RichDoc): RichDoc {
  const content = [...(doc.content ?? [])];
  const isEmptyPara = (n: RichNode) => n.type === "paragraph" && !(n.content ?? []).length;
  while (content.length && isEmptyPara(content[0])) content.shift();
  while (content.length && isEmptyPara(content[content.length - 1])) content.pop();
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}
