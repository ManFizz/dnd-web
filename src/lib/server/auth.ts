import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./db";

type Social = NonNullable<Parameters<typeof betterAuth>[0]["socialProviders"]>;

function socialProviders(): Social {
  const providers: Social = {};
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.google = { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET };
  }
  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
    providers.discord = { clientId: process.env.DISCORD_CLIENT_ID, clientSecret: process.env.DISCORD_CLIENT_SECRET };
  }
  return providers;
}

export function enabledSocialProviders(): ("google" | "discord")[] {
  return Object.keys(socialProviders()) as ("google" | "discord")[];
}

async function roleForNewUser(email: string): Promise<"admin" | "user"> {
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (admins.length) return admins.includes(email.toLowerCase()) ? "admin" : "user";
  // Without an explicit list the first account becomes the admin.
  const count = await prisma.user.count();
  return count === 0 ? "admin" : "user";
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  socialProviders: socialProviders(),
  account: {
    accountLinking: { enabled: true, trustedProviders: ["google", "discord"] },
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "user", input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({ data: { ...user, role: await roleForNewUser(user.email) } }),
      },
    },
  },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
