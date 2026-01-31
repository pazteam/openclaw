/**
 * Agent identity resolution for Discord webhooks.
 * Parses IDENTITY.md from agent workspaces to get name/avatar for webhook posts.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { WebhookIdentity } from "./send.webhook.js";

export type AgentIdentity = {
  name: string;
  emoji?: string;
  creature?: string;
  vibe?: string;
  avatar?: string;
};

/**
 * Parse IDENTITY.md content to extract agent identity fields.
 */
export function parseIdentityMd(content: string): AgentIdentity | null {
  const lines = content.split("\n");

  let name: string | undefined;
  let emoji: string | undefined;
  let creature: string | undefined;
  let vibe: string | undefined;
  let avatar: string | undefined;

  for (const line of lines) {
    // Match patterns like "- **Name:** Ember" or "- **Emoji:** 🔥"
    const match = line.match(/^\s*-\s*\*\*(\w+):\*\*\s*(.+)$/);
    if (!match) continue;

    const [, field, value] = match;
    const trimmedValue = value.trim();

    switch (field.toLowerCase()) {
      case "name":
        name = trimmedValue;
        break;
      case "emoji":
        emoji = trimmedValue;
        break;
      case "creature":
        creature = trimmedValue;
        break;
      case "vibe":
        vibe = trimmedValue;
        break;
      case "avatar":
        avatar = trimmedValue;
        break;
    }
  }

  if (!name) return null;

  return { name, emoji, creature, vibe, avatar };
}

/**
 * Load agent identity from workspace IDENTITY.md.
 */
export async function loadAgentIdentity(workspaceDir: string): Promise<AgentIdentity | null> {
  try {
    const identityPath = join(workspaceDir, "IDENTITY.md");
    const content = await readFile(identityPath, "utf-8");
    return parseIdentityMd(content);
  } catch {
    return null;
  }
}

/**
 * Resolve agent identity from agentId by looking up workspace.
 * Maps agentId to workspace directory convention: ~/workspace/<agentId>/
 */
export async function resolveAgentIdentityById(
  agentId: string,
  baseWorkspaceDir?: string,
): Promise<AgentIdentity | null> {
  // Default base workspace is /home/clawd/workspace (or ~/workspace)
  const base =
    (baseWorkspaceDir ?? process.env.HOME)
      ? join(process.env.HOME!, "workspace")
      : "/home/clawd/workspace";

  const workspaceDir = join(base, agentId);
  return loadAgentIdentity(workspaceDir);
}

/**
 * Convert AgentIdentity to WebhookIdentity for Discord.
 * Constructs display name with emoji prefix if available.
 * Uses avatar from identity if no override provided.
 */
export function toWebhookIdentity(
  identity: AgentIdentity,
  avatarUrlOverride?: string,
): WebhookIdentity {
  // Format: "🔥 Ember" or just "Ember"
  const displayName = identity.emoji ? `${identity.emoji} ${identity.name}` : identity.name;

  return {
    username: displayName,
    avatarUrl: avatarUrlOverride ?? identity.avatar,
  };
}

/**
 * Resolve webhook identity for an agent.
 * Returns null if agent identity cannot be resolved.
 */
export async function resolveWebhookIdentity(
  agentId: string,
  opts?: {
    baseWorkspaceDir?: string;
    avatarUrl?: string;
  },
): Promise<WebhookIdentity | null> {
  const identity = await resolveAgentIdentityById(agentId, opts?.baseWorkspaceDir);
  if (!identity) return null;

  return toWebhookIdentity(identity, opts?.avatarUrl);
}
