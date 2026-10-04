import { describe, expect, it } from "vitest";
import { CampaignPatchSchema, InviteInputSchema, inviteProblem, isGmRole, parseSettings } from "@/lib/campaigns";

describe("inviteProblem", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  const ok = { revokedAt: null, expiresAt: null, maxUses: null, uses: 0 };

  it("accepts a fresh invite", () => {
    expect(inviteProblem(ok, now)).toBeNull();
  });

  it("rejects revoked, expired and used up invites", () => {
    expect(inviteProblem({ ...ok, revokedAt: now }, now)).toMatch(/отозвано/);
    expect(inviteProblem({ ...ok, expiresAt: new Date("2026-10-04T11:59:59Z") }, now)).toMatch(/истёк/);
    expect(inviteProblem({ ...ok, maxUses: 2, uses: 2 }, now)).toMatch(/использовано/);
  });

  it("keeps working until the limits are reached", () => {
    expect(inviteProblem({ ...ok, expiresAt: new Date("2026-10-05T00:00:00Z"), maxUses: 2, uses: 1 }, now)).toBeNull();
  });
});

describe("campaign settings", () => {
  it("fills defaults and survives broken data", () => {
    expect(parseSettings(undefined)).toEqual({ startLevel: 1, advancement: "xp", characterApproval: true, rules: "", nextSession: "" });
    expect(parseSettings({ startLevel: 99 }).startLevel).toBe(1);
    expect(parseSettings({ startLevel: 5, advancement: "milestone" })).toMatchObject({ startLevel: 5, advancement: "milestone" });
  });

  it("patches only the given settings", () => {
    expect(CampaignPatchSchema.parse({ settings: { rules: "Без кубов" } }).settings).toEqual({ rules: "Без кубов" });
  });
});

describe("invites and roles", () => {
  it("never hands out the GM role through an invite", () => {
    expect(InviteInputSchema.safeParse({ role: "gm" }).success).toBe(false);
    expect(InviteInputSchema.parse({})).toEqual({ role: "player", requireApproval: false, maxUses: null, expiresInHours: 168 });
  });

  it("treats GM and co-GM as game masters", () => {
    expect(["gm", "cogm", "player", "spectator", null].map(isGmRole)).toEqual([true, true, false, false, false]);
  });
});
