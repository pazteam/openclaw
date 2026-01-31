/**
 * Discord webhook sender for agent-specific identity.
 * Posts messages via webhook with custom username/avatar instead of bot API.
 */

import { loadWebMedia } from "../web/media.js";
import type { ChunkMode } from "../auto-reply/chunk.js";
import { chunkDiscordTextWithMode } from "./chunk.js";

const DISCORD_TEXT_LIMIT = 2000;

export type WebhookIdentity = {
  username?: string;
  avatarUrl?: string;
};

export type WebhookSendOptions = {
  webhookUrl: string;
  identity?: WebhookIdentity;
  replyTo?: string;
  threadId?: string;
  maxLinesPerMessage?: number;
  chunkMode?: ChunkMode;
  embeds?: unknown[];
};

export type WebhookSendResult = {
  messageId: string;
  channelId: string;
};

/**
 * Send a text message via Discord webhook.
 */
export async function sendDiscordWebhookText(
  text: string,
  opts: WebhookSendOptions,
): Promise<WebhookSendResult> {
  if (!text.trim()) {
    throw new Error("Message must be non-empty for Discord webhook sends");
  }

  const chunks = chunkDiscordTextWithMode(text, {
    maxChars: DISCORD_TEXT_LIMIT,
    maxLines: opts.maxLinesPerMessage,
    chunkMode: opts.chunkMode,
  });
  if (!chunks.length && text) chunks.push(text);

  let lastResult: WebhookSendResult | null = null;
  let isFirst = true;

  for (const chunk of chunks) {
    lastResult = await postWebhookMessage(chunk, {
      ...opts,
      embeds: isFirst ? opts.embeds : undefined,
    });
    isFirst = false;
  }

  if (!lastResult) {
    throw new Error("Discord webhook send failed (empty chunk result)");
  }

  return lastResult;
}

/**
 * Send a media message via Discord webhook.
 */
export async function sendDiscordWebhookMedia(
  text: string,
  mediaUrl: string,
  opts: WebhookSendOptions,
): Promise<WebhookSendResult> {
  const media = await loadWebMedia(mediaUrl);

  const chunks = text
    ? chunkDiscordTextWithMode(text, {
        maxChars: DISCORD_TEXT_LIMIT,
        maxLines: opts.maxLinesPerMessage,
        chunkMode: opts.chunkMode,
      })
    : [];
  if (!chunks.length && text) chunks.push(text);

  const caption = chunks[0] ?? "";

  // Send media with first chunk as caption
  const result = await postWebhookMessageWithFile(caption, media, {
    ...opts,
    embeds: opts.embeds,
  });

  // Send remaining chunks as follow-up messages
  for (const chunk of chunks.slice(1)) {
    if (!chunk.trim()) continue;
    await postWebhookMessage(chunk, opts);
  }

  return result;
}

/**
 * Post a message to Discord webhook.
 */
async function postWebhookMessage(
  content: string,
  opts: WebhookSendOptions,
): Promise<WebhookSendResult> {
  const url = new URL(opts.webhookUrl);
  url.searchParams.set("wait", "true"); // Get message ID in response

  if (opts.threadId) {
    url.searchParams.set("thread_id", opts.threadId);
  }

  const body: Record<string, unknown> = {
    content,
  };

  if (opts.identity?.username) {
    body.username = opts.identity.username;
  }

  if (opts.identity?.avatarUrl) {
    body.avatar_url = opts.identity.avatarUrl;
  }

  if (opts.embeds?.length) {
    body.embeds = opts.embeds;
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(`Discord webhook failed (${response.status}): ${errorText}`);
  }

  const result = (await response.json()) as { id: string; channel_id: string };

  return {
    messageId: result.id,
    channelId: result.channel_id,
  };
}

/**
 * Post a message with file attachment to Discord webhook.
 */
async function postWebhookMessageWithFile(
  content: string,
  media: { buffer: Buffer; fileName?: string; mimeType?: string },
  opts: WebhookSendOptions,
): Promise<WebhookSendResult> {
  const url = new URL(opts.webhookUrl);
  url.searchParams.set("wait", "true");

  if (opts.threadId) {
    url.searchParams.set("thread_id", opts.threadId);
  }

  const formData = new FormData();

  // Build payload_json for the message metadata
  const payload: Record<string, unknown> = {};

  if (content) {
    payload.content = content;
  }

  if (opts.identity?.username) {
    payload.username = opts.identity.username;
  }

  if (opts.identity?.avatarUrl) {
    payload.avatar_url = opts.identity.avatarUrl;
  }

  if (opts.embeds?.length) {
    payload.embeds = opts.embeds;
  }

  formData.append("payload_json", JSON.stringify(payload));

  // Add file - convert Buffer to ArrayBuffer for Blob compatibility
  const arrayBuffer = media.buffer.buffer.slice(
    media.buffer.byteOffset,
    media.buffer.byteOffset + media.buffer.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: media.mimeType ?? "application/octet-stream" });
  formData.append("files[0]", blob, media.fileName ?? "upload");

  const response = await fetch(url.toString(), {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(`Discord webhook file upload failed (${response.status}): ${errorText}`);
  }

  const result = (await response.json()) as { id: string; channel_id: string };

  return {
    messageId: result.id,
    channelId: result.channel_id,
  };
}
