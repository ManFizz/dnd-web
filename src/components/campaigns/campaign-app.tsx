"use client";

import { ArrowLeft, CalendarDays, Crown, Hourglass, ScrollText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CAMPAIGN_SCOPES, isGmRole, ROLE_LABELS, type CampaignDetail, type CampaignEvent, type CampaignScope, type PartyCharacter } from "@/lib/campaigns";
import { cn } from "@/lib/cn";
import { Badge, Empty, Panel, Spinner } from "@/components/ui/misc";
import { Tip } from "@/components/ui/overlay";
import { api, ApiError } from "./api";
import { CampaignContext, type CampaignCtx } from "./context";
import { formatSession } from "./format";
import { GrantDialog, GrantsTab, OffersPanel } from "./grants";
import { LibraryTab } from "./library";
import { LootTab } from "./loot";
import { MutationsTab } from "./mutations";
import { CampaignNav, type TabDef } from "./nav";
import { BestiaryTab } from "./bestiary";
import { EncounterTab } from "./encounter";
import { HandoutsTab } from "./handouts";
import { SecretRoll, SessionsTab } from "./sessions";
import { ShopTab } from "./shop";
import { BringCharacterDialog, MyCharacters, PartyRoster, ReviewQueue } from "./lobby";
import { MembersTab } from "./members";
import { PartyGrid, usePartySheets } from "./party";
import { PartyBonuses } from "./party-bonuses";
import { SettingsTab } from "./settings";
import { QuickActions, StashTab } from "./stash";
import { useCampaignStream, type StreamState } from "./use-campaign-stream";

type Tab =
  | "party"
  | "encounter"
  | "sessions"
  | "handouts"
  | "shop"
  | "library"
  | "grants"
  | "loot"
  | "stash"
  | "bestiary"
  | "mutations"
  | "bonuses"
  | "members"
  | "settings";

const STREAM_LABELS: Record<StreamState, { text: string; dot: string }> = {
  live: { text: "Обновляется вживую", dot: "bg-good" },
  connecting: { text: "Подключаюсь…", dot: "bg-accent animate-pulse" },
  offline: { text: "Нет связи, обновите страницу", dot: "bg-danger" },
};

function LiveDot({ state }: { state: StreamState }) {
  const s = STREAM_LABELS[state];
  return (
    <Tip content={s.text}>
      <span className="inline-flex items-center gap-1.5 text-xs text-faint">
        <span className={cn("size-2 rounded-full", s.dot)} />
        <span className="hidden sm:inline">{state === "live" ? "онлайн" : s.text}</span>
      </span>
    </Tip>
  );
}

/** Small delay that merges bursts of events (autosave fires often) into one reload. */
function useDebounced(fn: () => void, ms: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(), ms);
  }, [ms]);
}

export function CampaignApp({ initial }: { initial: CampaignDetail }) {
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  const [party, setParty] = useState<PartyCharacter[] | null>(null);
  const [tab, setTab] = useState<Tab>("party");
  const [bringing, setBringing] = useState(false);
  const [scopes, setScopes] = useState<Partial<Record<CampaignScope, number>>>({});
  const [granting, setGranting] = useState<{ templateId: string | null } | null>(null);
  const id = initial.id;
  const pending = detail.me.status === "pending";
  const gm = isGmRole(detail.me.role) && !pending;
  const owner = detail.me.role === "gm";

  const gone = useCallback(
    (message: string) => {
      toast.info(message);
      router.push("/campaigns");
    },
    [router],
  );

  const refresh = useCallback(async () => {
    try {
      setDetail(await api<CampaignDetail>(`/api/campaigns/${id}`));
    } catch (e) {
      // 404 means the campaign is gone or we were removed from it.
      if (e instanceof ApiError && e.status === 404) gone("Вы больше не участник этой кампании");
    }
  }, [id, gone]);

  const loadParty = useCallback(() => {
    api<{ party: PartyCharacter[] }>(`/api/campaigns/${id}/party`)
      .then((r) => setParty(r.party))
      .catch(() => {
        // The role may have changed; the next detail refresh sorts it out.
      });
  }, [id]);

  useEffect(() => {
    if (gm) loadParty();
  }, [gm, loadParty]);

  const reloadParty = useDebounced(loadParty, 400);
  const reloadDetail = useDebounced(() => void refresh(), 200);

  const stream = useCampaignStream(id, (event: CampaignEvent | { type: "resync" }) => {
    switch (event.type) {
      case "deleted":
        gone("Кампания удалена");
        return;
      case "character":
        if (gm) reloadParty();
        return;
      case "characters":
        reloadDetail();
        if (gm) reloadParty();
        return;
      case "scope":
        setScopes((s) => ({ ...s, [event.scope]: (s[event.scope] ?? 0) + 1 }));
        return;
      case "notice":
        if (gm || !event.gmOnly) toast.info(event.text);
        return;
      default:
        reloadDetail();
        if (event.type === "resync") {
          if (gm) reloadParty();
          // Every scope may have missed events while offline.
          setScopes((s) => Object.fromEntries(CAMPAIGN_SCOPES.map((k) => [k, (s[k] ?? 0) + 1])));
        }
    }
  });

  const tabs: TabDef<Tab>[] = [
    { value: "party", label: "Партия", group: "Стол", show: true },
    { value: "encounter", label: "Бой", group: "Стол", show: true },
    { value: "handouts", label: "Квесты и раздатки", group: "Стол", show: true },
    { value: "sessions", label: "Сессии", group: "Стол", show: true },
    { value: "grants", label: "Выдачи", group: "Добыча", show: gm },
    { value: "loot", label: "Лут", group: "Добыча", show: gm },
    { value: "stash", label: "Сундук", group: "Добыча", show: true },
    { value: "shop", label: "Лавка", group: "Добыча", show: true },
    { value: "library", label: "Библиотека", group: "Справочники", show: gm },
    { value: "bestiary", label: "Бестиарий", group: "Справочники", show: gm },
    { value: "mutations", label: "Мутации", group: "Справочники", show: gm },
    { value: "members", label: "Участники", group: "Кампания", show: true },
    { value: "bonuses", label: "Бонусы", group: "Кампания", show: gm },
    { value: "settings", label: "Настройки", group: "Кампания", show: owner },
  ];
  const current = tabs.some((t) => t.show && t.value === tab) ? tab : "party";

  const accepted = (party ?? []).filter((p) => p.status === "accepted");
  const sheets = usePartySheets(accepted);
  const { nextSession, rules } = detail.settings;

  const ctx: CampaignCtx = { id, detail, gm, owner, scopes, refresh };

  return (
    <CampaignContext value={ctx}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Link href="/campaigns" className="inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-text">
            <ArrowLeft className="size-4" /> Кампании
          </Link>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-display text-3xl font-bold">{detail.name}</h1>
            <Badge tone={owner ? "accent" : "neutral"}>
              {owner && <Crown className="size-3" />}
              {ROLE_LABELS[detail.me.role]}
            </Badge>
            <LiveDot state={stream} />
          </div>
          {nextSession && formatSession(nextSession) && (
            <div className="flex items-center gap-1.5 text-sm text-muted" suppressHydrationWarning>
              <CalendarDays className="size-4 text-accent" /> Следующая игра: {formatSession(nextSession)}
            </div>
          )}
        </div>

        {pending ? (
          <Empty icon={<Hourglass />} title="Заявка ждёт одобрения ГМа">
            Как только ГМ примет её, страница обновится сама.
          </Empty>
        ) : (
          <>
            <CampaignNav tabs={tabs} value={current} onChange={setTab} />

            {current === "party" && (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="flex min-w-0 flex-col gap-4">
                  {gm && <ReviewQueue detail={detail} onChanged={refresh} />}
                  {gm && accepted.length > 0 && (
                    <div className="grid gap-4 xl:grid-cols-2">
                      <QuickActions />
                      <SecretRoll />
                    </div>
                  )}
                  {gm ? (
                    party === null ? (
                      <div className="flex justify-center py-10">
                        <Spinner />
                      </div>
                    ) : (
                      <PartyGrid sheets={sheets} />
                    )
                  ) : (
                    <PartyRoster detail={detail} />
                  )}
                </div>
                <div className="flex flex-col gap-4">
                  <OffersPanel />
                  <MyCharacters detail={detail} onChanged={refresh} onBring={() => setBringing(true)} />
                  {detail.description && (
                    <Panel title="О кампании">
                      <p className="text-sm whitespace-pre-line text-muted">{detail.description}</p>
                    </Panel>
                  )}
                  {rules && (
                    <Panel
                      title={
                        <span className="flex items-center gap-1.5">
                          <ScrollText className="size-4 text-accent" /> Правила стола
                        </span>
                      }
                    >
                      <p className="text-sm whitespace-pre-line">{rules}</p>
                    </Panel>
                  )}
                </div>
              </div>
            )}

            {current === "library" && <LibraryTab onGrant={(templateId) => setGranting({ templateId })} />}
            {current === "grants" && <GrantsTab onGrant={() => setGranting({ templateId: null })} />}
            {current === "stash" && <StashTab />}
            {current === "encounter" && <EncounterTab />}
            {current === "sessions" && <SessionsTab />}
            {current === "handouts" && <HandoutsTab />}
            {current === "shop" && <ShopTab />}
            {current === "loot" && <LootTab />}
            {current === "bestiary" && <BestiaryTab />}
            {current === "mutations" && <MutationsTab />}
            {current === "bonuses" && (party === null ? <Spinner /> : <PartyBonuses sheets={sheets} />)}
            {current === "members" && <MembersTab detail={detail} onChanged={refresh} />}
            {current === "settings" && (
              <SettingsTab key={JSON.stringify([detail.name, detail.description, detail.settings])} detail={detail} onSaved={setDetail} />
            )}
          </>
        )}

        <BringCharacterDialog
          campaignId={id}
          open={bringing}
          onOpenChange={setBringing}
          onChanged={refresh}
          needsApproval={detail.settings.characterApproval && !gm}
        />
        {granting && <GrantDialog templateId={granting.templateId} onClose={() => setGranting(null)} />}
      </div>
    </CampaignContext>
  );
}
