import { normalizeKickUsername } from "./kick-avatars";

/** Kick's moderator/owner badges are available on incoming chat events. */
const PRIVILEGED_KICK_BADGES = new Set(["moderator", "mod", "broadcaster", "streamer", "channel_owner", "owner"]);

const ALIASES: Record<string, KickPlayerCommand> = {
  "!skip": "!skip",
  "!next": "!skip",
  "!pular": "!skip",
  "!proxima": "!skip",
  "!próxima": "!skip",
  "!back": "!back",
  "!prev": "!back",
  "!previous": "!back",
  "!voltar": "!back",
  "!anterior": "!back",
  "!pause": "!pausar",
  "!parar": "!pausar",
  "!pausar": "!pausar",
  "!resume": "!continuar",
  "!play": "!continuar",
  "!retomar": "!continuar",
  "!continuar": "!continuar",
  "!clear": "!limpar",
  "!limparfila": "!limpar",
  "!limpar": "!limpar",
};

export type KickPlayerCommand = "!skip" | "!back" | "!pausar" | "!continuar" | "!limpar";

export function parseKickPlayerCommand(content: string): KickPlayerCommand | null {
  const normalized = content.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
  return ALIASES[normalized] ?? null;
}

export function mayUseKickPlayerCommands(
  username: string,
  channelSlug: string,
  moderatorNicks: readonly string[],
  badges: readonly string[] = [],
): boolean {
  const user = normalizeKickUsername(username);
  if (!user) return false;
  if (user === normalizeKickUsername(channelSlug)) return true;
  if (moderatorNicks.some((nick) => normalizeKickUsername(nick.replace(/^@/, "")) === user)) return true;
  return badges.some((badge) => PRIVILEGED_KICK_BADGES.has(badge.trim().toLowerCase()));
}
