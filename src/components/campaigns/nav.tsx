"use client";

import { Segmented } from "@/components/ui/misc";

// Two-level navigation of the campaign page: groups, then the tabs of the
// chosen group. A group with one visible tab is a tab by itself.

export type TabDef<T extends string> = { value: T; label: string; group: string; show: boolean };

export function CampaignNav<T extends string>({ tabs, value, onChange }: { tabs: TabDef<T>[]; value: T; onChange: (v: T) => void }) {
  const visible = tabs.filter((t) => t.show);
  const groups = [...new Set(visible.map((t) => t.group))];
  const currentGroup = visible.find((t) => t.value === value)?.group ?? groups[0];
  const inGroup = visible.filter((t) => t.group === currentGroup);
  return (
    <div className="flex flex-col gap-2">
      <Segmented
        value={currentGroup}
        onChange={(g) => {
          const first = visible.find((t) => t.group === g);
          if (first) onChange(first.value);
        }}
        options={groups.map((g) => {
          const only = visible.filter((t) => t.group === g);
          return { value: g, label: only.length === 1 ? only[0].label : g };
        })}
        className="w-fit max-w-full overflow-x-auto"
      />
      {inGroup.length > 1 && <Segmented size="sm" value={value} onChange={onChange} options={inGroup} className="w-fit max-w-full overflow-x-auto" />}
    </div>
  );
}
