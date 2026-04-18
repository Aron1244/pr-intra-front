"use client";

import Echo, { type EchoOptions } from "laravel-echo";
import Pusher from "pusher-js";
import type { Options as PusherClientOptions } from "pusher-js";

import { getAccessToken } from "@/lib/auth-token";

declare global {
  interface Window {
    Pusher: typeof Pusher;
  }
}

let echoInstance: Echo<"reverb"> | null = null;

function getEchoConfig(): EchoOptions<"reverb"> & { broadcaster: "reverb" } {
  const enabledTransports = ["ws", "wss"] as NonNullable<PusherClientOptions["enabledTransports"]>;

  return {
    broadcaster: "reverb" as const,
    key: process.env.NEXT_PUBLIC_REVERB_APP_KEY ?? process.env.NEXT_PUBLIC_PUSHER_APP_KEY ?? "",
    wsHost: process.env.NEXT_PUBLIC_REVERB_HOST ?? process.env.NEXT_PUBLIC_PUSHER_HOST ?? "127.0.0.1",
    wsPort: Number(process.env.NEXT_PUBLIC_REVERB_PORT ?? process.env.NEXT_PUBLIC_PUSHER_PORT ?? 80),
    wssPort: Number(process.env.NEXT_PUBLIC_REVERB_PORT ?? process.env.NEXT_PUBLIC_PUSHER_PORT ?? 443),
    forceTLS:
      (process.env.NEXT_PUBLIC_REVERB_SCHEME ?? process.env.NEXT_PUBLIC_PUSHER_SCHEME ?? "http") === "https",
    enabledTransports,
    namespace: process.env.NEXT_PUBLIC_ECHO_NAMESPACE ?? "App.Events",
    authEndpoint:
      process.env.NEXT_PUBLIC_BROADCAST_AUTH_ENDPOINT ?? `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/broadcasting/auth`,
    auth: {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${getAccessToken() ?? ""}`,
      },
    },
  };
}

export function getEcho() {
  if (typeof window === "undefined") {
    return null;
  }

  const appKey = process.env.NEXT_PUBLIC_REVERB_APP_KEY ?? process.env.NEXT_PUBLIC_PUSHER_APP_KEY ?? "";
  if (!appKey) {
    return null;
  }

  if (!window.Pusher) {
    window.Pusher = Pusher;
  }

  if (!echoInstance) {
    echoInstance = new Echo(getEchoConfig());
  }

  return echoInstance;
}

export function getConversationChannelName(conversationId: number) {
  return process.env.NEXT_PUBLIC_CHAT_CHANNEL_TEMPLATE?.replace("{conversationId}", String(conversationId)) ?? `conversations.${conversationId}`;
}
