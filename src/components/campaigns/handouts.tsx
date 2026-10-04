"use client";

import { Eye, EyeOff, ImagePlus, Pencil, Plus, ScrollText, Target, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { emptyDoc } from "@/lib/rules/richtext";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, QUEST_STATUS_LABELS, QUEST_STATUSES, type HandoutInput, type HandoutRow } from "@/lib/sessions";
import { RichEditor } from "@/components/rich/editor";
import { RichView } from "@/components/rich/view";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch } from "@/components/ui/input";
import { Badge, Empty, Panel, Segmented, Spinner } from "@/components/ui/misc";
import { Modal } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { apiError } from "./api";
import { api } from "./api";
import { run, useCampaign, useScopeData } from "./context";
import { CharacterPicker, useParty } from "./grants";

// Handouts (letters, maps, portraits) and quests. The GM prepares them in
// secret and reveals them to the whole party or to chosen characters.

export const fileUrl = (campaignId: string, fileId: string) => `/api/campaigns/${campaignId}/files/${fileId}`;

/** Uploads an image to the campaign and returns its id. */
export async function uploadImage(campaignId: string, file: File): Promise<string | null> {
  if (!IMAGE_TYPES.includes(file.type)) {
    toast.error("Можно загрузить PNG, JPEG, WebP или GIF");
    return null;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    toast.error("Картинка больше 8 МБ");
    return null;
  }
  const res = await fetch(`/api/campaigns/${campaignId}/files?name=${encodeURIComponent(file.name)}`, {
    method: "POST",
    headers: { "content-type": file.type },
    body: file,
  });
  if (!res.ok) {
    toast.error((await apiError(res)).message);
    return null;
  }
  return ((await res.json()) as { id: string }).id;
}

function HandoutEditor({ initial, id, onClose }: { initial: HandoutInput; id: string | null; onClose: () => void }) {
  const { id: campaignId } = useCampaign();
  const [h, setH] = useState(initial);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const party = useParty();
  const everyone = !h.visibleTo.length;
  const save = async () => {
    setBusy(true);
    const ok = await run(() =>
      api(id ? `/api/campaigns/${campaignId}/handouts/${id}` : `/api/campaigns/${campaignId}/handouts`, { method: id ? "PUT" : "POST", body: h }),
    );
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={id ? initial.title : h.kind === "quest" ? "Новый квест" : "Новая раздатка"}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !h.title.trim()}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Segmented
            value={h.kind}
            onChange={(kind) => setH({ ...h, kind })}
            options={[
              { value: "handout", label: "Раздатка" },
              { value: "quest", label: "Квест" },
            ]}
          />
          <Field label="Название" className="min-w-48 flex-1">
            <Input value={h.title} onChange={(e) => setH({ ...h, title: e.target.value })} />
          </Field>
          {h.kind === "quest" && (
            <Field label="Статус" className="w-36">
              <Select
                value={h.status}
                onChange={(e) => setH({ ...h, status: e.target.value as HandoutInput["status"] })}
                options={QUEST_STATUSES.map((s) => ({ value: s, label: QUEST_STATUS_LABELS[s] }))}
              />
            </Field>
          )}
        </div>
        <RichEditor value={h.body} onChange={(body) => setH({ ...h, body })} placeholder="Текст письма, условия квеста, награда…" minHeight="8rem" />
        <div className="flex flex-wrap items-center gap-3">
          {h.imageId ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl(campaignId, h.imageId)} alt="" className="h-24 rounded-lg border border-line object-cover" />
              <Button
                size="icon-sm"
                variant="secondary"
                className="absolute -top-2 -right-2"
                aria-label="Убрать картинку"
                onClick={() => setH({ ...h, imageId: null })}
              >
                <X />
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <ImagePlus /> Картинка
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_TYPES.join(",")}
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const imageId = await uploadImage(campaignId, f);
              if (imageId) setH((x) => ({ ...x, imageId }));
            }}
          />
        </div>
        <div className="flex flex-col gap-2 rounded-lg border border-line p-3">
          <Switch checked={h.revealed} onCheckedChange={(revealed) => setH({ ...h, revealed })} label="Показано игрокам" />
          <Switch
            checked={everyone}
            onCheckedChange={(v) => setH({ ...h, visibleTo: v ? [] : party.slice(0, 1).map((c) => c.characterId) })}
            label="Всей партии"
          />
          {!everyone && <CharacterPicker value={h.visibleTo} onChange={(visibleTo) => setH({ ...h, visibleTo })} />}
        </div>
      </div>
    </Modal>
  );
}

function HandoutCard({ h, gm, onEdit }: { h: HandoutRow; gm: boolean; onEdit: () => void }) {
  const { id: campaignId } = useCampaign();
  const party = useParty();
  const ask = useAsk();
  const names = new Map(party.map((c) => [c.characterId, c.name]));
  const toggle = () => run(() => api(`/api/campaigns/${campaignId}/handouts/${h.id}`, { method: "PUT", body: { ...h, revealed: !h.revealed } }));
  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2">
          {h.kind === "quest" ? <Target className="size-4 text-accent" /> : <ScrollText className="size-4 text-accent" />}
          {h.title}
          {h.kind === "quest" && <Badge tone={h.status === "done" ? "good" : h.status === "failed" ? "danger" : "info"}>{QUEST_STATUS_LABELS[h.status]}</Badge>}
          {gm && !h.revealed && <Badge tone="magic">скрыто</Badge>}
          {gm && h.visibleTo.length > 0 && <Badge>{h.visibleTo.map((id) => names.get(id) ?? "?").join(", ")}</Badge>}
        </span>
      }
      actions={
        gm && (
          <>
            <Button size="sm" variant={h.revealed ? "ghost" : "subtle"} onClick={toggle}>
              {h.revealed ? <EyeOff /> : <Eye />} {h.revealed ? "Спрятать" : "Показать"}
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Изменить" onClick={onEdit}>
              <Pencil />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Удалить"
              onClick={async () => {
                if (await ask.confirm({ title: `Удалить «${h.title}»?`, confirmLabel: "Удалить", danger: true }))
                  await run(() => api(`/api/campaigns/${campaignId}/handouts/${h.id}`, { method: "DELETE" }));
              }}
            >
              <Trash2 />
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {h.imageId && (
          <a href={fileUrl(campaignId, h.imageId)} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl(campaignId, h.imageId)} alt={h.title} className="max-h-96 rounded-lg border border-line object-contain" />
          </a>
        )}
        <RichView doc={h.body} label={h.title} />
      </div>
    </Panel>
  );
}

export function HandoutsTab() {
  const { id: campaignId, gm } = useCampaign();
  const [data] = useScopeData<{ handouts: HandoutRow[] }>("handouts", `/api/campaigns/${campaignId}/handouts`);
  const [kind, setKind] = useState<"quest" | "handout">("quest");
  const [editing, setEditing] = useState<{ id: string | null; h: HandoutInput } | null>(null);
  if (!data) return <Spinner />;
  const list = data.handouts.filter((h) => h.kind === kind);
  const order = { open: 0, done: 1, failed: 2 } as const;
  const sorted = kind === "quest" ? [...list].sort((a, b) => order[a.status] - order[b.status]) : list;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "quest", label: "Квесты" },
            { value: "handout", label: "Раздатки" },
          ]}
        />
        {gm && (
          <Button
            variant="primary"
            onClick={() =>
              setEditing({ id: null, h: { kind, title: "", body: emptyDoc(), imageId: null, visibleTo: [], revealed: false, status: "open", order: 0 } })
            }
          >
            <Plus /> {kind === "quest" ? "Квест" : "Раздатка"}
          </Button>
        )}
      </div>
      {sorted.length === 0 ? (
        <Empty icon={kind === "quest" ? <Target /> : <ScrollText />} title={kind === "quest" ? "Квестов нет" : "Раздаток нет"}>
          {gm
            ? "Подготовьте заранее и покажите в нужный момент: всей партии или только одному персонажу."
            : "Когда ГМ покажет письмо, карту или новый квест, он появится здесь."}
        </Empty>
      ) : (
        sorted.map((h) => <HandoutCard key={h.id} h={h} gm={gm} onEdit={() => setEditing({ id: h.id, h })} />)
      )}
      {editing && <HandoutEditor initial={editing.h} id={editing.id} onClose={() => setEditing(null)} />}
    </div>
  );
}
