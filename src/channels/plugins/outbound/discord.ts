import { sendMessageDiscord, sendPollDiscord } from "../../../discord/send.js";
import {
  sendDiscordWebhookText,
  sendDiscordWebhookMedia,
  type WebhookIdentity,
} from "../../../discord/send.webhook.js";
import { resolveWebhookIdentity } from "../../../discord/agent-identity.js";
import type { OpenClawConfig } from "../../../config/config.js";
import type { ChannelOutboundAdapter, ChannelOutboundContext } from "../types.js";

/**
 * Resolve webhook URL for a Discord channel from config.
 * Looks up guilds.<guildId>.channels.<channelId>.webhook
 */
function resolveWebhookUrl(cfg: OpenClawConfig, channelId: string): string | undefined {
  const guilds = cfg.channels?.discord?.guilds;
  if (!guilds) return undefined;

  // Search through all guilds for a channel config with this ID
  for (const guildConfig of Object.values(guilds)) {
    const channels = guildConfig.channels;
    if (!channels) continue;

    // Check if this channel ID has a webhook configured
    const channelConfig = channels[channelId];
    if (channelConfig?.webhook) {
      return channelConfig.webhook;
    }
  }

  return undefined;
}

/**
 * Extract channel ID from Discord target string.
 * Target format: "channel:<id>" or just "<id>" for channels.
 */
function extractChannelId(to: string): string | undefined {
  const trimmed = to.trim();

  // Handle "channel:<id>" format
  if (trimmed.startsWith("channel:")) {
    return trimmed.slice(8).trim();
  }

  // If it looks like a snowflake ID (numeric), assume it's a channel ID
  if (/^\d{17,20}$/.test(trimmed)) {
    return trimmed;
  }

  return undefined;
}

/**
 * Send text via webhook if configured, otherwise fall back to bot API.
 */
async function sendTextWithWebhookFallback(ctx: ChannelOutboundContext): Promise<{
  channel: "discord";
  messageId: string;
  channelId: string;
}> {
  const { to, text, cfg, accountId, deps, replyToId, agentId } = ctx;
  const channelId = extractChannelId(to);

  // Check for webhook config
  const webhookUrl = channelId ? resolveWebhookUrl(cfg, channelId) : undefined;

  console.log("[Discord Webhook Debug]", { channelId, webhookUrl: !!webhookUrl, agentId });

  if (webhookUrl && agentId) {
    // Resolve agent identity for webhook
    const identity = await resolveWebhookIdentity(agentId);

    console.log("[Discord Webhook Debug] Identity resolved:", identity);

    if (identity) {
      console.log("[Discord Webhook Debug] Sending via webhook as", identity.username);
      const result = await sendDiscordWebhookText(text, {
        webhookUrl,
        identity,
      });
      return { channel: "discord", ...result };
    }
  }

  console.log("[Discord Webhook Debug] Falling back to bot API");

  // Fall back to bot API
  const send = deps?.sendDiscord ?? sendMessageDiscord;
  const result = await send(to, text, {
    verbose: false,
    replyTo: replyToId ?? undefined,
    accountId: accountId ?? undefined,
  });
  return { channel: "discord", ...result };
}

/**
 * Send media via webhook if configured, otherwise fall back to bot API.
 */
async function sendMediaWithWebhookFallback(ctx: ChannelOutboundContext): Promise<{
  channel: "discord";
  messageId: string;
  channelId: string;
}> {
  const { to, text, mediaUrl, cfg, accountId, deps, replyToId, agentId } = ctx;
  const channelId = extractChannelId(to);

  // Check for webhook config
  const webhookUrl = channelId ? resolveWebhookUrl(cfg, channelId) : undefined;

  if (webhookUrl && agentId && mediaUrl) {
    // Resolve agent identity for webhook
    const identity = await resolveWebhookIdentity(agentId);

    if (identity) {
      const result = await sendDiscordWebhookMedia(text, mediaUrl, {
        webhookUrl,
        identity,
      });
      return { channel: "discord", ...result };
    }
  }

  // Fall back to bot API
  const send = deps?.sendDiscord ?? sendMessageDiscord;
  const result = await send(to, text, {
    verbose: false,
    mediaUrl,
    replyTo: replyToId ?? undefined,
    accountId: accountId ?? undefined,
  });
  return { channel: "discord", ...result };
}

export const discordOutbound: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: null,
  textChunkLimit: 2000,
  pollMaxOptions: 10,
  sendText: async (ctx) => sendTextWithWebhookFallback(ctx),
  sendMedia: async (ctx) => sendMediaWithWebhookFallback(ctx),
  sendPoll: async ({ to, poll, accountId }) =>
    await sendPollDiscord(to, poll, {
      accountId: accountId ?? undefined,
    }),
};
