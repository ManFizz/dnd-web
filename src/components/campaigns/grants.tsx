"use client";

import { Check, Eye, Gift, Lock, MoreHorizontal, Trash2, Undo2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { EXPIRY_LABELS, GRANT_STATUS_LABELS, LOCK_LABELS, VISIBILITY_LABELS, type GrantInput, type GrantRow, type TemplateRow } from "@/lib/grants";
import { MUTATION_PARTS, mutationPartLabel } from "@/lib/mutations";
import { GRANT_EXPIRY, GRANT_LOCKS, GRANT_VISIBILITY, type Feature, type GrantExpiry, type GrantLock, type GrantVisibility } from "@/lib/rules/schema";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, NumberInput, Select, Textarea } from "@/components/ui/input";
import { Badge, Empty, Panel, Segmented, Spinner } from "@/components/ui/misc";
import { Menu, Modal } from "@/components/ui/overlay";
import { useAsk } from "@/components/ui/prompt";
import { api } from "./api";
import { run, useCampaign, useScopeData } from "./context";
import { subkindLabel } from "./library";

// Grants: the GM hands out library objects with locks, secrets and timers;
// players accept or decline offers.

const opts = <T extends string>(values: readonly T[], labels: Record<T, string>) => values.map((v) => ({ value: v, label: labels[v] }));

export const MUTATION_PART_OPTIONS = [
  ...MUTATION_PARTS.map((p) => ({ value: p.id as string, label: p.label as string })),
  { value: "choice", label: "На выбор игрока" },
];

export function useParty() {
  const { detail } = useCampaign();
  return detail.characters.filter((c) => c.status === "accepted");
}

/** Checkbox list of party characters. */
export function CharacterPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const party = useParty();
  if (!party.length) return <p className="text-sm text-muted">В партии пока нет принятых персонажей.</p>;
  const all = value.length === party.length;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      <Checkbox label={<b>Все</b>} checked={all} onChange={() => onChange(all ? [] : party.map((c) => c.characterId))} />
      {party.map((c) => (
        <Checkbox
          key={c.characterId}
          label={c.name}
          checked={value.includes(c.characterId)}
          onChange={(e) => onChange(e.target.checked ? [...value, c.characterId] : value.filter((x) => x !== c.characterId))}
        />
      ))}
    </div>
  );
}

export function GrantDialog({ templateId, onClose }: { templateId: string | null; onClose: () => void }) {
  const { id: campaignId } = useCampaign();
  const [lib] = useScopeData<{ templates: TemplateRow[] }>("library", `/api/campaigns/${campaignId}/library`);
  const [tplId, setTplId] = useState(templateId ?? "");
  const [g, setG] = useState({
    characterIds: [] as string[],
    delivery: "now" as "now" | "offer",
    lock: "none" as GrantLock,
    visibility: "visible" as GrantVisibility,
    expires: "never" as GrantExpiry,
    left: 1,
    removal: "",
    reason: "",
    cursed: false,
    triggers: "",
    bodyPart: "",
    quantity: 1,
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof g>(k: K, v: (typeof g)[K]) => setG((x) => ({ ...x, [k]: v }));
  const tpl = lib?.templates.find((t) => t.id === tplId) ?? null;
  const isMutation = tpl?.kind === "feature" && (tpl.body as Feature).kind === "mutation";
  const isItem = tpl?.kind === "item";

  const submit = async () => {
    if (!tpl) return;
    const body: GrantInput = {
      characterIds: g.characterIds,
      templateId: tpl.id,
      delivery: g.delivery,
      lock: g.lock,
      visibility: g.visibility,
      expires: g.expires,
      left: g.expires === "rounds" || g.expires === "days" ? g.left : 0,
      removal: g.removal,
      reason: g.reason,
      cursed: isItem && g.cursed,
      triggers: g.triggers,
      ...(isMutation ? { bodyPart: g.bodyPart || (tpl.body as Feature).bodyPart || "choice" } : {}),
      ...(isItem ? { quantity: g.quantity } : {}),
    };
    setBusy(true);
    const ok = await run(
      () => api(`/api/campaigns/${campaignId}/grants`, { method: "POST", body }),
      g.delivery === "offer" || body.bodyPart === "choice" ? "Предложение отправлено" : "Выдано",
    );
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="Выдать"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy || !tpl || !g.characterIds.length || !g.reason.trim()}>
            <Gift /> {g.delivery === "offer" ? "Предложить" : "Выдать"}
          </Button>
        </>
      }
    >
      {!lib ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Что">
            <Select
              value={tplId}
              onChange={(e) => setTplId(e.target.value)}
              placeholder="Выберите из библиотеки"
              options={lib.templates.map((t) => ({ value: t.id, label: `${t.name} · ${subkindLabel(t)}`, group: t.folder || "Без папки" }))}
            />
          </Field>
          <Field label="Кому">
            <CharacterPicker value={g.characterIds} onChange={(v) => set("characterIds", v)} />
          </Field>
          <Field label="За что" required hint="Попадёт в журнал персонажа">
            <Input value={g.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Награда за спасение каравана" maxLength={300} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Как">
              <Segmented
                value={g.delivery}
                onChange={(v) => set("delivery", v)}
                options={[
                  { value: "now", label: "Сразу в лист" },
                  { value: "offer", label: "Предложить" },
                ]}
              />
            </Field>
            {isItem && (
              <Field label="Количество">
                <NumberInput value={g.quantity} min={0} onCommit={(v) => set("quantity", v)} />
              </Field>
            )}
            {isMutation && (
              <Field label="Часть тела" hint="Мутация заменит ту, что уже есть на этой части">
                <Select
                  value={g.bodyPart || (tpl.body as Feature).bodyPart || "choice"}
                  onChange={(e) => set("bodyPart", e.target.value)}
                  options={MUTATION_PART_OPTIONS}
                />
              </Field>
            )}
            <Field label="Игрок видит">
              <Select
                value={g.visibility}
                onChange={(e) => set("visibility", e.target.value as GrantVisibility)}
                options={opts(GRANT_VISIBILITY, VISIBILITY_LABELS)}
              />
            </Field>
            <Field label="Замок">
              <Select value={g.lock} onChange={(e) => set("lock", e.target.value as GrantLock)} options={opts(GRANT_LOCKS, LOCK_LABELS)} />
            </Field>
            <Field label="Срок">
              <Select value={g.expires} onChange={(e) => set("expires", e.target.value as GrantExpiry)} options={opts(GRANT_EXPIRY, EXPIRY_LABELS)} />
            </Field>
            {(g.expires === "rounds" || g.expires === "days") && (
              <Field label={g.expires === "rounds" ? "Раундов" : "Дней"}>
                <NumberInput value={g.left} min={1} onCommit={(v) => set("left", v)} />
              </Field>
            )}
          </div>
          {isItem && (
            <Checkbox
              label="Проклятый: надетый или настроенный предмет нельзя снять, а ГМ узнаёт, когда его надели"
              checked={g.cursed}
              onChange={(e) => set("cursed", e.target.checked)}
            />
          )}
          {(g.lock !== "none" || g.cursed || tpl?.stages.length) && (
            <Field label="Как избавиться" hint="Игрок увидит это в подсказке">
              <Textarea
                value={g.removal}
                onChange={(e) => set("removal", e.target.value)}
                placeholder="Заклинание «Снятие проклятия» или исповедь в храме Латандера"
              />
            </Field>
          )}
          {g.visibility !== "visible" && (
            <Field label="Когда раскрыть (заметка для себя)">
              <Input value={g.triggers} onChange={(e) => set("triggers", e.target.value)} placeholder="После первого боя в полнолуние" />
            </Field>
          )}
        </div>
      )}
    </Modal>
  );
}

function timer(g: GrantRow) {
  if (g.expires === "rounds") return `раундов: ${g.left}`;
  if (g.expires === "days") return `дней: ${g.left}`;
  return g.expires === "never" ? "" : EXPIRY_LABELS[g.expires].toLowerCase();
}

function GrantLine({ g, gm }: { g: GrantRow; gm: boolean }) {
  const { id: campaignId } = useCampaign();
  const ask = useAsk();
  const patch = (body: Record<string, unknown>, success?: string) =>
    run(() => api(`/api/campaigns/${campaignId}/grants/${g.id}`, { method: "PATCH", body: { reason: "", ...body } }), success);
  const remove = async () => {
    const reason = await ask.text({
      title: `Снять «${g.name}» с ${g.characterName}?`,
      label: "За что",
      required: true,
      reasonSuggestions: true,
      confirmLabel: "Снять",
    });
    if (reason) await patch({ remove: true, reason }, "Снято");
  };
  const stage = async (stage: number) => {
    const reason = await ask.text({ title: `«${g.name}»: стадия ${stage + 1}`, label: "Почему", required: true, reasonSuggestions: true });
    if (reason) await patch({ stage, reason });
  };
  const active = g.status === "active" || g.status === "offered";
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 last:border-b-0">
      <div className="min-w-40 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium">{g.name}</span>
          {gm && <span className="text-sm text-muted">→ {g.characterName}</span>}
          {g.status !== "active" && <Badge tone={g.status === "offered" ? "info" : "neutral"}>{GRANT_STATUS_LABELS[g.status]}</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted">
          {g.reason && <span>{g.reason}</span>}
          {g.visibility !== "visible" && (
            <Badge tone="magic">
              <Eye className="size-3" /> {g.visibility === "hidden" ? "скрыто" : "только имя"}
            </Badge>
          )}
          {g.lock !== "none" && (
            <Badge>
              <Lock className="size-3" /> {g.lock === "noremove" ? "не убрать" : "не менять"}
            </Badge>
          )}
          {timer(g) && <Badge>{timer(g)}</Badge>}
          {g.stages > 1 && (
            <Badge tone="danger">
              стадия {g.stage + 1}/{g.stages}
            </Badge>
          )}
          {g.bodyPart && <Badge>{g.bodyPart === "choice" ? "часть тела на выбор" : mutationPartLabel(g.bodyPart)}</Badge>}
        </div>
      </div>
      {gm && active && (
        <Menu
          trigger={
            <Button size="icon-sm" variant="ghost" aria-label="Действия">
              <MoreHorizontal />
            </Button>
          }
          items={[
            ...(g.status === "active" && g.visibility !== "visible"
              ? [{ label: "Раскрыть игроку", icon: <Eye />, onSelect: () => void patch({ visibility: "visible" }, "Раскрыто") }]
              : []),
            ...(g.status === "active" && g.lock !== "none" ? [{ label: "Снять замок", icon: <Lock />, onSelect: () => void patch({ lock: "none" }) }] : []),
            ...(g.status === "active" && g.lock === "none" ? [{ label: "Запереть", icon: <Lock />, onSelect: () => void patch({ lock: "noremove" }) }] : []),
            ...(g.status === "active" && g.stages > 1
              ? Array.from({ length: g.stages }, (_, i) => i)
                  .filter((i) => i !== g.stage)
                  .map((i) => ({ label: `Стадия ${i + 1}`, icon: <Undo2 />, onSelect: () => void stage(i) }))
              : []),
            "separator" as const,
            { label: g.status === "offered" ? "Отозвать предложение" : "Снять", icon: <Trash2 />, danger: true, onSelect: () => void remove() },
          ]}
        />
      )}
    </div>
  );
}

export function GrantsTab({ onGrant }: { onGrant: () => void }) {
  const { id: campaignId } = useCampaign();
  const [data] = useScopeData<{ grants: GrantRow[] }>("grants", `/api/campaigns/${campaignId}/grants`);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [who, setWho] = useState("");
  const party = useParty();
  const grants = useMemo(
    () => (data?.grants ?? []).filter((g) => (filter === "all" || g.status === "active" || g.status === "offered") && (!who || g.characterId === who)),
    [data, filter, who],
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "active", label: "Действуют" },
            { value: "all", label: "Вся история" },
          ]}
        />
        <Select
          value={who}
          onChange={(e) => setWho(e.target.value)}
          className="w-48"
          options={[{ value: "", label: "Все персонажи" }, ...party.map((c) => ({ value: c.characterId, label: c.name }))]}
        />
        <div className="flex-1" />
        <Button variant="primary" onClick={onGrant}>
          <Gift /> Выдать
        </Button>
      </div>
      {!data ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : grants.length === 0 ? (
        <Empty icon={<Gift />} title="Выдач нет">
          Выдайте предмет, дар или проклятие из библиотеки: копия попадёт в лист игрока с причиной в журнале.
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          {grants.map((g) => (
            <GrantLine key={g.id} g={g} gm />
          ))}
        </div>
      )}
    </div>
  );
}

/** Player side: offers from the GM waiting for an answer. */
export function OffersPanel() {
  const { id: campaignId, gm } = useCampaign();
  const [data, reload] = useScopeData<{ grants: GrantRow[] }>("grants", gm ? null : `/api/campaigns/${campaignId}/grants`);
  const [parts, setParts] = useState<Record<string, string>>({});
  const offers = (data?.grants ?? []).filter((g) => g.status === "offered");
  if (gm || !offers.length) return null;
  const respond = async (g: GrantRow, accept: boolean) => {
    const bodyPart = parts[g.id];
    if (accept && g.bodyPart === "choice" && !bodyPart) return;
    const ok = await run(
      () => api(`/api/campaigns/${campaignId}/grants/${g.id}/respond`, { method: "POST", body: { accept, bodyPart } }),
      accept ? "Добавлено в лист" : "Отказались",
    );
    if (ok) reload();
  };
  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <Gift className="size-4 text-accent" /> Предложения ГМа
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        {offers.map((g) => {
          return (
            <div key={g.id} className="flex flex-col gap-2 rounded-lg border border-line p-2.5">
              <div>
                <div className="font-medium">{g.name}</div>
                <div className="text-xs text-muted">
                  {g.characterName}
                  {g.reason ? ` · ${g.reason}` : ""}
                </div>
              </div>
              {g.bodyPart === "choice" && (
                <Select
                  value={parts[g.id] ?? ""}
                  onChange={(e) => setParts({ ...parts, [g.id]: e.target.value })}
                  placeholder="Какая часть тела?"
                  options={MUTATION_PART_OPTIONS.filter((o) => o.value !== "choice")}
                />
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={() => respond(g, true)} disabled={g.bodyPart === "choice" && !parts[g.id]}>
                  <Check /> Принять
                </Button>
                <Button size="sm" variant="ghost" onClick={() => respond(g, false)}>
                  <X /> Отказаться
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
