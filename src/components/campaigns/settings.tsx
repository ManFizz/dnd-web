"use client";

import { Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { CampaignDetail, CampaignSettings } from "@/lib/campaigns";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/input";
import { Panel } from "@/components/ui/misc";
import { useAsk } from "@/components/ui/prompt";
import { api } from "./api";
import { fromLocalInput, toLocalInput } from "./format";

const LEVEL_OPTIONS = Array.from({ length: 20 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1} уровень`,
}));
const ADVANCEMENT_OPTIONS = [
  { value: "xp", label: "По опыту" },
  { value: "milestone", label: "По вехам (решает ГМ)" },
];

/** Campaign settings, editable by its creator only. */
export function SettingsTab({ detail, onSaved }: { detail: CampaignDetail; onSaved: (d: CampaignDetail) => void }) {
  const ask = useAsk();
  const router = useRouter();
  const [name, setName] = useState(detail.name);
  const [description, setDescription] = useState(detail.description);
  const [settings, setSettings] = useState<CampaignSettings>(detail.settings);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof CampaignSettings>(key: K, value: CampaignSettings[K]) => setSettings((s) => ({ ...s, [key]: value }));
  const dirty = name !== detail.name || description !== detail.description || JSON.stringify(settings) !== JSON.stringify(detail.settings);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      onSaved(
        await api<CampaignDetail>(`/api/campaigns/${detail.id}`, {
          method: "PATCH",
          body: { name, description, settings },
        }),
      );
      toast.success("Настройки сохранены");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const typed = await ask.text({
      title: "Удалить кампанию?",
      description: "Участники потеряют к ней доступ, приглашения перестанут работать. Листы персонажей останутся у игроков. Отменить нельзя.",
      label: `Введите название кампании: ${detail.name}`,
      required: true,
      confirmLabel: "Удалить навсегда",
    });
    if (typed === null) return;
    if (typed.trim() !== detail.name.trim()) {
      toast.error("Название не совпало, кампания не удалена");
      return;
    }
    try {
      await api(`/api/campaigns/${detail.id}`, { method: "DELETE" });
      toast.success("Кампания удалена");
      router.push("/campaigns");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось удалить");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={save}>
        <Panel
          title="Кампания"
          actions={
            <Button type="submit" size="sm" variant="primary" disabled={busy || !dirty || !name.trim()}>
              <Save /> Сохранить
            </Button>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Название" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </Field>
            <Field label="Следующая игра" hint="Видна всем участникам">
              <Input type="datetime-local" value={toLocalInput(settings.nextSession)} onChange={(e) => set("nextSession", fromLocalInput(e.target.value))} />
            </Field>
            <Field label="Коротко о кампании" hint="Видно в приглашении" className="md:col-span-2">
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
            </Field>
            <Field label="Правила стола" hint="Хоумрулы, договорённости, что разрешено при создании персонажа" className="md:col-span-2">
              <Textarea value={settings.rules} onChange={(e) => set("rules", e.target.value)} maxLength={5000} className="min-h-28" />
            </Field>
            <Field label="Стартовый уровень">
              <Select value={String(settings.startLevel)} onChange={(e) => set("startLevel", Number(e.target.value))} options={LEVEL_OPTIONS} />
            </Field>
            <Field label="Повышение уровня">
              <Select
                value={settings.advancement}
                onChange={(e) => set("advancement", e.target.value as CampaignSettings["advancement"])}
                options={ADVANCEMENT_OPTIONS}
              />
            </Field>
            <Switch
              className="md:col-span-2"
              checked={settings.characterApproval}
              onCheckedChange={(v) => set("characterApproval", v)}
              label="Новые персонажи входят в партию только после моей проверки"
            />
          </div>
        </Panel>
      </form>

      <Panel title="Опасная зона">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">Удаление кампании не трогает листы персонажей: они вернутся к игрокам свободными.</p>
          <Button variant="danger" onClick={remove}>
            <Trash2 /> Удалить кампанию
          </Button>
        </div>
      </Panel>
    </div>
  );
}
