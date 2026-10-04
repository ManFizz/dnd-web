"use client";

import {
  Award,
  Backpack,
  Dna,
  GraduationCap,
  Hash,
  NotebookPen,
  PersonStanding,
  ScrollText,
  SlidersHorizontal,
  Sparkles,
  Swords,
  UserRound,
  Wrench,
} from "lucide-react";
import { Component, useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { TAB_INFO } from "@/lib/rules/glossary";
import type { CharacterDoc } from "@/lib/rules/schema";
import { RichEnvContext, type RichEnv } from "@/components/rich/context";
import { Button } from "@/components/ui/button";
import { Drawer, Tip } from "@/components/ui/overlay";
import { useRoll } from "./dice";
import { SheetDialogs } from "./dialogs";
import { SheetHeader } from "./header";
import { SheetProvider } from "./provider";
import { Sidebar } from "./sidebar";
import { useComputed, useDoc } from "./store";
import { BonusesTab } from "./tabs/bonuses";
import { ClassTab } from "./tabs/class";
import { CombatTab } from "./tabs/combat";
import { CountersTab } from "./tabs/counters";
import { FeatsTab } from "./tabs/feats";
import { InventoryTab } from "./tabs/inventory";
import { JournalTab } from "./tabs/journal";
import { LoreTab } from "./tabs/lore";
import { MutationsTab } from "./tabs/mutations";
import { NotesTab } from "./tabs/notes";
import { ProficienciesTab } from "./tabs/proficiencies";
import { RaceTab } from "./tabs/race";
import { SettingsTab } from "./tabs/settings";
import { SpellsTab } from "./tabs/spells";
import { Vitals } from "./vitals";

type TabDef = { id: string; label: string; icon: React.ComponentType<{ className?: string }>; group: number; hide?: string; mobileOnly?: boolean };

export const TABS: TabDef[] = [
  { id: "stats", label: "Навыки", icon: UserRound, group: 0, mobileOnly: true },
  { id: "combat", label: "Бой", icon: Swords, group: 0 },
  { id: "spells", label: "Заклинания", icon: Sparkles, group: 0, hide: "tab.spells" },
  { id: "inventory", label: "Снаряжение", icon: Backpack, group: 0 },
  { id: "counters", label: "Счётчики", icon: Hash, group: 0, hide: "tab.counters" },
  { id: "race", label: "Раса", icon: PersonStanding, group: 1 },
  { id: "class", label: "Класс", icon: GraduationCap, group: 1 },
  { id: "feats", label: "Черты", icon: Award, group: 1 },
  { id: "mutations", label: "Тело", icon: Dna, group: 1, hide: "tab.mutations" },
  { id: "proficiencies", label: "Владения", icon: Wrench, group: 1 },
  { id: "bonuses", label: "Бонусы", icon: SlidersHorizontal, group: 1 },
  { id: "lore", label: "Лор", icon: ScrollText, group: 2 },
  { id: "notes", label: "Заметки", icon: NotebookPen, group: 2, hide: "tab.notes" },
];

/** Technical screens opened from the header instead of the tab bar. */
export const PANELS = {
  journal: { title: "Журнал изменений", description: "Все изменения персонажа с подписями «за что получено». Записи появляются сами." },
  settings: { title: "Настройки листа", description: "Редакция правил, обязательные подписи, лишние механики и файл персонажа." },
} as const;
export type PanelId = keyof typeof PANELS;

export const isPanel = (v: string | undefined | null): v is PanelId => v === "journal" || v === "settings";

class TabBoundary extends Component<{ children: React.ReactNode; resetKey: string }, { error: Error | null; key: string }> {
  state = { error: null as Error | null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  static getDerivedStateFromProps(props: { resetKey: string }, state: { error: Error | null; key: string }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }
  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-danger/40 bg-danger-soft p-4 text-sm">
          <div className="font-semibold text-danger">В этой вкладке что-то сломалось</div>
          <div className="mt-1 text-muted">{this.state.error.message}</div>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => this.setState({ error: null })}>
            Попробовать снова
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

function TabContent({ tab, onTab, onPanel }: { tab: string; onTab: (t: string) => void; onPanel: (p: PanelId | null) => void }) {
  switch (tab) {
    case "stats":
      return <Sidebar onOpenSettings={() => onPanel("settings")} />;
    case "spells":
      return <SpellsTab />;
    case "inventory":
      return <InventoryTab />;
    case "counters":
      return <CountersTab />;
    case "race":
      return <RaceTab />;
    case "class":
      return <ClassTab />;
    case "feats":
      return <FeatsTab />;
    case "mutations":
      return <MutationsTab />;
    case "proficiencies":
      return <ProficienciesTab />;
    case "bonuses":
      return <BonusesTab />;
    case "lore":
      return <LoreTab />;
    case "notes":
      return <NotesTab />;
    default:
      return <CombatTab onTab={onTab} />;
  }
}

function RichEnvProvider({ children }: { children: React.ReactNode }) {
  const sheet = useComputed();
  const roll = useRoll();
  const env = useMemo<RichEnv>(
    () => ({
      evaluate: (expr) => sheet.calc.evaluate(expr),
      roll: (label, value) => roll({ label, value }),
    }),
    [sheet, roll],
  );
  return <RichEnvContext value={env}>{children}</RichEnvContext>;
}

function TabBar({ tab, onTab }: { tab: string; onTab: (t: string) => void }) {
  const doc = useDoc();
  const tabs = TABS.filter((t) => !t.hide || !doc.settings.hidden.includes(t.hide));
  return (
    <nav className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0 lg:overflow-visible lg:@container" aria-label="Разделы листа">
      <div className="flex w-max min-w-full items-center gap-0.5 rounded-xl border border-line bg-panel p-1 lg:w-auto lg:flex-wrap">
        {tabs.map((t, i) => {
          const Icon = t.icon;
          const gap = i > 0 && tabs[i - 1].group !== t.group;
          return (
            <div key={t.id} className={cn("flex items-center", t.mobileOnly && "lg:hidden")}>
              {gap && <span className="mx-0.5 h-5 w-px bg-line" />}
              <Tip content={TAB_INFO[t.id]} side="bottom">
                <button
                  type="button"
                  onClick={() => onTab(t.id)}
                  aria-current={tab === t.id ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium whitespace-nowrap transition-colors @max-[62rem]:px-1.5",
                    tab === t.id ? "bg-accent-soft text-accent" : "text-muted hover:bg-panel-2 hover:text-text",
                  )}
                >
                  {/* Icons give way to labels when the desktop tab bar is narrow. */}
                  <Icon className="size-4 @max-[62rem]:hidden" />
                  {t.label}
                </button>
              </Tip>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function SheetLayout({ initialTab, initialPanel }: { initialTab: string; initialPanel: PanelId | null }) {
  const doc = useDoc();
  const [tab, setTab] = useState(initialTab);
  const [panel, setPanel] = useState<PanelId | null>(initialPanel);
  const onTab = useCallback((t: string) => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === "combat") url.searchParams.delete("tab");
    else url.searchParams.set("tab", t);
    window.history.replaceState(window.history.state, "", url);
  }, []);
  const onPanel = useCallback((p: PanelId | null) => {
    setPanel(p);
    const url = new URL(window.location.href);
    if (p) url.searchParams.set("panel", p);
    else url.searchParams.delete("panel");
    if (isPanel(url.searchParams.get("tab"))) url.searchParams.delete("tab");
    window.history.replaceState(window.history.state, "", url);
  }, []);
  const def = TABS.find((t) => t.id === tab);
  const active = !def || (def.hide && doc.settings.hidden.includes(def.hide)) ? "combat" : tab;
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-3 py-4 sm:px-5">
      <SheetHeader onTab={onTab} onPanel={onPanel} />
      <Vitals />
      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)] wide:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        <aside className="hidden lg:sticky lg:top-4 lg:block lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:pr-1">
          <Sidebar onOpenSettings={() => onPanel("settings")} />
        </aside>
        <main className="flex min-w-0 flex-col gap-4">
          <TabBar tab={active} onTab={onTab} />
          <TabBoundary resetKey={active}>
            <div className={cn(active === "stats" && "lg:hidden")}>
              <TabContent tab={active === "stats" ? "stats" : active} onTab={onTab} onPanel={onPanel} />
            </div>
            {active === "stats" && (
              <div className="hidden lg:block">
                <CombatTab onTab={onTab} />
              </div>
            )}
          </TabBoundary>
        </main>
      </div>
      {(Object.keys(PANELS) as PanelId[]).map((p) => (
        <Drawer key={p} open={panel === p} onOpenChange={(o) => onPanel(o ? p : null)} title={PANELS[p].title} description={PANELS[p].description}>
          <TabBoundary resetKey={p}>{p === "journal" ? <JournalTab /> : <SettingsTab />}</TabBoundary>
        </Drawer>
      ))}
    </div>
  );
}

export function SheetApp({
  id,
  doc,
  version,
  initialTab,
  initialPanel,
  viewOnly,
  campaignId,
}: {
  id: string;
  doc: CharacterDoc;
  version: number;
  initialTab?: string;
  initialPanel?: string;
  /** The GM viewing a player's sheet from this campaign. */
  viewOnly?: { campaignId: string };
  /** Campaign the character plays in: GM changes arrive live. */
  campaignId?: string | null;
}) {
  // Old links used ?tab=journal and ?tab=settings; they open the panels now.
  const panel = isPanel(initialPanel) ? initialPanel : isPanel(initialTab) ? initialTab : null;
  return (
    <SheetProvider initial={{ id, doc, version, readOnly: !!viewOnly, campaignId: viewOnly?.campaignId ?? campaignId ?? null }}>
      <RichEnvProvider>
        <SheetDialogs>
          <SheetLayout initialTab={initialTab && TABS.some((t) => t.id === initialTab) ? initialTab : "combat"} initialPanel={panel} />
        </SheetDialogs>
      </RichEnvProvider>
    </SheetProvider>
  );
}
