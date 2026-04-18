"use client";

import { ChangeEvent, FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { API_BASE, ApiClientError, apiFetch } from "@/lib/api-client";
import { clearAccessToken, getAccessToken } from "@/lib/auth-token";
import { getConversationChannelName, getEcho } from "@/lib/echo-client";

type MeResponse = {
  data: {
    id: number;
    name: string;
    email: string;
    can_manage_announcements?: boolean;
    roles?: Array<{
      id: number;
      name: string;
    }>;
  };
};

type Conversation = {
  id: number;
  name: string | null;
  type: string;
  users: Array<{
    id: number;
    name: string;
  }>;
  created_at: string;
  updated_at: string;
};

type AppUser = {
  id: number;
  name: string;
  email: string;
};

type DocumentAttachment = {
  id: number;
  title: string;
  file_path: string;
  file_url?: string;
  original_name?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
};

type ChatMessage = {
  id: string;
  conversation_id: number;
  sender_id: number;
  sender_name: string;
  content: string;
  type?: string;
  document?: DocumentAttachment | null;
  created_at: string;
};

type BackendMessage = {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  type?: string;
  document?: DocumentAttachment | null;
  created_at: string;
  updated_at: string;
};

type ChatSyncEvent = {
  type: "message-sent" | "conversation-created" | "message-deleted" | "conversation-deleted";
  conversationId: number;
  message?: ChatMessage;
  conversation?: Conversation;
  messageId?: string;
};

type IncomingMessageNotice = {
  text: string;
  conversationId: number;
  messageId: string;
};

const CHAT_SYNC_CHANNEL = "pr-intra-front-chat-sync";
const UNREAD_STORAGE_KEY_PREFIX = "pr-intra-front-unread";
const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024;

export default function ConversationsPage() {
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPermissionError, setIsPermissionError] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [user, setUser] = useState<MeResponse["data"] | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [draftMessage, setDraftMessage] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<number, ChatMessage[]>>({});
  const [incomingMessageNotice, setIncomingMessageNotice] = useState<IncomingMessageNotice | null>(null);
  const [unreadByConversation, setUnreadByConversation] = useState<Record<number, number>>({});
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [recentlyBumpedConversationId, setRecentlyBumpedConversationId] = useState<number | null>(null);
  const chatBroadcastRef = useRef<BroadcastChannel | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const lastSeenMessageIdRef = useRef<string | null>(null);
  const incomingNoticeTimeoutRef = useRef<number | null>(null);
  const selectedConversationIdRef = useRef<number | null>(null);
  const currentUserIdRef = useRef<number | null>(null);
  const bumpConversationTimeoutRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function setHandledError(error: unknown, fallbackMessage: string) {
    if (error instanceof ApiClientError) {
      if (error.status === 403) {
        setIsPermissionError(true);
        setErrorMessage("No tienes permisos para realizar esta accion.");
        return;
      }

      setIsPermissionError(false);
      setErrorMessage(error.message);
      return;
    }

    setIsPermissionError(false);
    setErrorMessage(fallbackMessage);
  }

  useEffect(() => {
    let ignore = false;

    const loadPageData = async () => {
      setIsLoadingUser(true);
      setIsLoadingConversations(true);
      setIsLoadingUsers(true);
      setErrorMessage(null);
      setIsPermissionError(false);
      setSuccessMessage(null);

      try {
        const [meResponse, conversationsResponse, usersResponse] = await Promise.all([
          apiFetch<MeResponse>("/me", { method: "GET" }),
          apiFetch<Conversation[]>("/conversations", { method: "GET" }),
          apiFetch<{ data: AppUser[] }>("/users", { method: "GET" }),
        ]);

        if (!ignore) {
          setUser(meResponse.data);
          setConversations(conversationsResponse);
          setUsers(usersResponse.data);
          setSelectedConversationId((current) => current ?? conversationsResponse[0]?.id ?? null);
        }
      } catch (error) {
        if (!ignore) {
          if (error instanceof ApiClientError && error.status === 401) {
            setErrorMessage("No autenticado. Inicia sesion nuevamente.");
            setIsPermissionError(false);
            clearAccessToken();
          } else {
            setHandledError(error, "No se pudo cargar la vista de conversaciones.");
          }
        }
      } finally {
        if (!ignore) {
          setIsLoadingUser(false);
          setIsLoadingConversations(false);
          setIsLoadingUsers(false);
        }
      }
    };

    void loadPageData();

    return () => {
      ignore = true;
    };
  }, []);

  const roles = user?.roles?.map((role) => role.name.toLowerCase()) ?? [];
  const isAdmin = roles.includes("admin");
  const canManageAnnouncements = Boolean(user?.can_manage_announcements);
  const availableUsers = useMemo(
    () => users.filter((candidate) => candidate.id !== user?.id),
    [user?.id, users],
  );

  const uniqueConversations = useMemo(() => {
    const grouped = new Map<string, Conversation>();

    for (const conversation of conversations) {
      const participantKey = conversation.users
        .map((participant) => participant.id)
        .sort((left, right) => left - right)
        .join("-");
      const conversationKey = `${conversation.type}:${participantKey}`;

      if (!grouped.has(conversationKey)) {
        grouped.set(conversationKey, conversation);
        continue;
      }

      const existingConversation = grouped.get(conversationKey);
      if (
        existingConversation &&
        new Date(conversation.updated_at).getTime() > new Date(existingConversation.updated_at).getTime()
      ) {
        grouped.set(conversationKey, conversation);
      }
    }

    return Array.from(grouped.values()).sort(
      (leftConversation, rightConversation) =>
        new Date(rightConversation.updated_at).getTime() - new Date(leftConversation.updated_at).getTime(),
    );
  }, [conversations]);

  const selectedConversation = useMemo(
    () =>
      uniqueConversations.find((conversation) => conversation.id === selectedConversationId) ??
      uniqueConversations[0] ??
      null,
    [selectedConversationId, uniqueConversations],
  );

  const selectedConversationMessages = useMemo(
    () => (selectedConversation ? messagesByConversation[selectedConversation.id] ?? [] : []),
    [messagesByConversation, selectedConversation],
  );
  const unreadStorageKey = user?.id ? `${UNREAD_STORAGE_KEY_PREFIX}:${user.id}` : null;

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = messagesContainerRef.current;

    if (!container) {
      messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });

    window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }, []);

  const isNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return true;
    }

    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceToBottom <= 72;
  }, []);

  const handleMessagesScroll = useCallback(() => {
    if (isNearBottom()) {
      setShowJumpToLatest(false);
      return;
    }

    if (selectedConversationMessages.length > 0) {
      setShowJumpToLatest(true);
    }
  }, [isNearBottom, selectedConversationMessages.length]);

  const showIncomingMessageNotice = useCallback((notice: IncomingMessageNotice) => {
    setIncomingMessageNotice(notice);

    if (incomingNoticeTimeoutRef.current !== null) {
      window.clearTimeout(incomingNoticeTimeoutRef.current);
    }

    incomingNoticeTimeoutRef.current = window.setTimeout(() => {
      setIncomingMessageNotice(null);
      incomingNoticeTimeoutRef.current = null;
    }, 2800);
  }, []);

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    currentUserIdRef.current = user?.id ?? null;
  }, [user?.id]);

  useEffect(
    () => () => {
      if (incomingNoticeTimeoutRef.current !== null) {
        window.clearTimeout(incomingNoticeTimeoutRef.current);
      }

      if (bumpConversationTimeoutRef.current !== null) {
        window.clearTimeout(bumpConversationTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!unreadStorageKey || typeof window === "undefined") {
      return;
    }

    try {
      const storedUnread = window.sessionStorage.getItem(unreadStorageKey);
      if (!storedUnread) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUnreadByConversation({});
        return;
      }

      const parsedUnread = JSON.parse(storedUnread) as Record<string, number>;
      const normalizedUnread: Record<number, number> = {};

      for (const [conversationId, count] of Object.entries(parsedUnread)) {
        const numericConversationId = Number(conversationId);
        if (!Number.isNaN(numericConversationId) && count > 0) {
          normalizedUnread[numericConversationId] = count;
        }
      }

      setUnreadByConversation(normalizedUnread);
    } catch {
      setUnreadByConversation({});
    }
  }, [unreadStorageKey]);

  useEffect(() => {
    if (!unreadStorageKey || typeof window === "undefined") {
      return;
    }

    window.sessionStorage.setItem(unreadStorageKey, JSON.stringify(unreadByConversation));
  }, [unreadByConversation, unreadStorageKey]);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSuccessMessage(null);
    }, 2200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [successMessage]);

  useEffect(() => {
    if (!highlightedMessageId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setHighlightedMessageId(null);
    }, 2200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [highlightedMessageId]);

  const normalizeBackendMessages = useCallback(
    (conversation: Conversation, backendMessages: BackendMessage[]) =>
      backendMessages.map((message) => ({
        id: String(message.id),
        conversation_id: message.conversation_id,
        sender_id: message.sender_id,
        sender_name:
          message.sender_id === user?.id
            ? (user?.name ?? "Tu")
            : (conversation.users.find((candidate) => candidate.id === message.sender_id)?.name ?? `Usuario ${message.sender_id}`),
        content: message.content ?? "",
        type: message.type,
        document: message.document ?? null,
        created_at: message.created_at,
      })),
    [user?.id, user?.name],
  );

  const formatFileSize = useCallback((sizeInBytes?: number | null) => {
    if (!sizeInBytes || sizeInBytes <= 0) {
      return "";
    }

    if (sizeInBytes < 1024) {
      return `${sizeInBytes} B`;
    }

    const sizeInKb = sizeInBytes / 1024;
    if (sizeInKb < 1024) {
      return `${sizeInKb.toFixed(1)} KB`;
    }

    return `${(sizeInKb / 1024).toFixed(1)} MB`;
  }, []);

  const getAttachmentName = useCallback((document: DocumentAttachment) => {
    return document.original_name ?? document.title ?? `Documento ${document.id}`;
  }, []);

  const backendOrigin = useMemo(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
    let normalized = apiUrl.replace(/\/+$/, "");

    if (normalized.endsWith("/api")) {
      normalized = normalized.slice(0, -4);
    }

    if (!/^https?:\/\//i.test(normalized)) {
      return "http://localhost:8000";
    }

    // Local dev fallback when NEXT_PUBLIC_API_URL is "http://localhost/api".
    if (/^https?:\/\/localhost(?:\/|$)/i.test(normalized)) {
      const parsed = new URL(normalized);
      if (!parsed.port) {
        parsed.port = "8000";
        return parsed.origin;
      }
    }

    return normalized;
  }, []);

  const getAttachmentUrl = useCallback((document: DocumentAttachment) => {
    if (document.file_url) {
      if (/^https?:\/\//i.test(document.file_url)) {
        return document.file_url;
      }

      return `${backendOrigin}${document.file_url.startsWith("/") ? "" : "/"}${document.file_url}`;
    }

    return `${backendOrigin}/storage/${document.file_path}`;
  }, [backendOrigin]);

  const handleDownloadAttachment = useCallback(async (document: DocumentAttachment) => {
    const token = getAccessToken();
    const endpoint = `${API_BASE}/documents/${document.id}/download`;

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          Accept: "application/octet-stream",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        throw new Error(`No se pudo descargar el archivo (HTTP ${response.status}).`);
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const downloadLink = window.document.createElement("a");

      downloadLink.href = blobUrl;
      downloadLink.download = getAttachmentName(document);
      window.document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      setErrorMessage("No se pudo descargar el archivo adjunto.");
      setIsPermissionError(false);
    }
  }, [getAttachmentName]);

  const formatUnreadCount = useCallback((count: number) => {
    if (count > 9) {
      return "9+";
    }

    return String(count);
  }, []);
  const markConversationAsRead = useCallback((conversationId: number) => {
    setUnreadByConversation((current) => {
      if (!current[conversationId]) {
        return current;
      }

      const next = { ...current };
      delete next[conversationId];
      return next;
    });
  }, []);

  const appendIncomingMessage = useCallback(
    (incomingMessage: ChatMessage) => {
      let didInsert = false;

      setMessagesByConversation((current) => {
        const previousMessages = current[incomingMessage.conversation_id] ?? [];

        if (previousMessages.some((message) => message.id === incomingMessage.id)) {
          return current;
        }

        didInsert = true;

        return {
          ...current,
          [incomingMessage.conversation_id]: [...previousMessages, incomingMessage],
        };
      });

      if (!didInsert) {
        return;
      }

      setConversations((current) =>
        current
          .map((conversation) =>
            conversation.id === incomingMessage.conversation_id
              ? { ...conversation, updated_at: incomingMessage.created_at }
              : conversation,
          )
          .sort(
            (leftConversation, rightConversation) =>
              new Date(rightConversation.updated_at).getTime() -
              new Date(leftConversation.updated_at).getTime(),
          ),
      );

      const isOwnMessage = incomingMessage.sender_id === currentUserIdRef.current;
      const isCurrentConversation = selectedConversationIdRef.current === incomingMessage.conversation_id;

      if (isOwnMessage) {
        return;
      }

      if (isCurrentConversation) {
        showIncomingMessageNotice({
          text: `Nuevo mensaje de ${incomingMessage.sender_name}`,
          conversationId: incomingMessage.conversation_id,
          messageId: incomingMessage.id,
        });

        if (isNearBottom()) {
          scrollMessagesToBottom("smooth");
          setShowJumpToLatest(false);
        } else {
          setShowJumpToLatest(true);
        }

        if (bumpConversationTimeoutRef.current !== null) {
          window.clearTimeout(bumpConversationTimeoutRef.current);
        }

        setRecentlyBumpedConversationId(incomingMessage.conversation_id);
        bumpConversationTimeoutRef.current = window.setTimeout(() => {
          setRecentlyBumpedConversationId((current) =>
            current === incomingMessage.conversation_id ? null : current,
          );
          bumpConversationTimeoutRef.current = null;
        }, 1400);
        return;
      }

      setUnreadByConversation((current) => ({
        ...current,
        [incomingMessage.conversation_id]: (current[incomingMessage.conversation_id] ?? 0) + 1,
      }));

      showIncomingMessageNotice({
        text: `Nuevo mensaje de ${incomingMessage.sender_name} en otra conversacion`,
        conversationId: incomingMessage.conversation_id,
        messageId: incomingMessage.id,
      });

      if (bumpConversationTimeoutRef.current !== null) {
        window.clearTimeout(bumpConversationTimeoutRef.current);
      }

      setRecentlyBumpedConversationId(incomingMessage.conversation_id);
      bumpConversationTimeoutRef.current = window.setTimeout(() => {
        setRecentlyBumpedConversationId((current) =>
          current === incomingMessage.conversation_id ? null : current,
        );
        bumpConversationTimeoutRef.current = null;
      }, 1400);
    },
    [isNearBottom, scrollMessagesToBottom, showIncomingMessageNotice],
  );

  const handleSelectConversation = useCallback(
    (conversationId: number) => {
      setSelectedConversationId(conversationId);
      markConversationAsRead(conversationId);
      setIncomingMessageNotice((current) =>
        current && current.conversationId === conversationId ? null : current,
      );
    },
    [markConversationAsRead],
  );

  const openNoticeConversation = useCallback(() => {
    if (!incomingMessageNotice) {
      return;
    }

    setSelectedConversationId(incomingMessageNotice.conversationId);
    markConversationAsRead(incomingMessageNotice.conversationId);
    setHighlightedMessageId(incomingMessageNotice.messageId);
    setIncomingMessageNotice(null);
    setShowJumpToLatest(false);

    window.requestAnimationFrame(() => {
      scrollMessagesToBottom("smooth");
    });
  }, [incomingMessageNotice, markConversationAsRead, scrollMessagesToBottom]);

  const removeConversationFromState = useCallback((conversationId: number) => {
    setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
    setMessagesByConversation((current) => {
      const nextMessages = { ...current };
      delete nextMessages[conversationId];
      return nextMessages;
    });

    setSelectedConversationId((current) => {
      if (current !== conversationId) {
        return current;
      }

      const remainingConversation = uniqueConversations.find((conversation) => conversation.id !== conversationId);
      return remainingConversation?.id ?? null;
    });
    setUnreadByConversation((current) => {
      if (!current[conversationId]) {
        return current;
      }

      const next = { ...current };
      delete next[conversationId];
      return next;
    });
  }, [uniqueConversations]);

  const loadConversationMessages = async (conversation: Conversation) => {
    const endpoints = [
      `/conversations/${conversation.id}/messages`,
      `/messages?conversation_id=${conversation.id}`,
      `/messages/conversation/${conversation.id}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await apiFetch<BackendMessage[] | { data: BackendMessage[] }>(endpoint, {
          method: "GET",
        });

        const messages = Array.isArray(response) ? response : response.data;

        setMessagesByConversation((current) => ({
          ...current,
          [conversation.id]: normalizeBackendMessages(conversation, messages),
        }));
        return;
      } catch (error) {
        if (error instanceof ApiClientError && (error.status === 404 || error.status === 405)) {
          continue;
        }

        setHandledError(error, "No se pudo cargar el hilo de la conversacion.");
        return;
      }
    }

    setMessagesByConversation((current) => ({
      ...current,
      [conversation.id]: [],
    }));
  };

  useEffect(() => {
    if (!selectedConversation) {
      return;
    }

    if (messagesByConversation[selectedConversation.id]) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadConversationMessages(selectedConversation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation?.id]);

  useEffect(() => {
    if (!selectedConversation) {
      return;
    }

    let active = true;

    const syncSelectedConversation = async () => {
      try {
        const response = await apiFetch<BackendMessage[] | { data: BackendMessage[] }>(
          `/conversations/${selectedConversation.id}/messages`,
          {
            method: "GET",
          },
        );

        if (!active) {
          return;
        }

        const normalizedMessages = normalizeBackendMessages(
          selectedConversation,
          Array.isArray(response) ? response : response.data,
        );

        setMessagesByConversation((current) => {
          const previousMessages = current[selectedConversation.id] ?? [];

          if (previousMessages.length === normalizedMessages.length) {
            const hasDiff = normalizedMessages.some((message, index) => {
              const previous = previousMessages[index];
              return !previous || previous.id !== message.id || previous.content !== message.content;
            });

            if (!hasDiff) {
              return current;
            }
          }

          return {
            ...current,
            [selectedConversation.id]: normalizedMessages,
          };
        });

        const latestMessage = normalizedMessages[normalizedMessages.length - 1];
        if (latestMessage) {
          setConversations((current) =>
            current
              .map((conversation) =>
                conversation.id === selectedConversation.id
                  ? { ...conversation, updated_at: latestMessage.created_at }
                  : conversation,
              )
              .sort(
                (leftConversation, rightConversation) =>
                  new Date(rightConversation.updated_at).getTime() -
                  new Date(leftConversation.updated_at).getTime(),
              ),
          );
        }
      } catch {
        // Silent fallback: websocket remains the primary real-time mechanism.
      }
    };

    void syncSelectedConversation();
    const intervalId = window.setInterval(() => {
      void syncSelectedConversation();
    }, 3500);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [normalizeBackendMessages, selectedConversation]);

  useEffect(() => {
    if (!selectedConversation) {
      return;
    }

    scrollMessagesToBottom("auto");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowJumpToLatest(false);
    const lastMessage = selectedConversationMessages[selectedConversationMessages.length - 1];
    lastSeenMessageIdRef.current = lastMessage?.id ?? null;
    markConversationAsRead(selectedConversation.id);
  }, [scrollMessagesToBottom, selectedConversation?.id]);

  useEffect(() => {
    if (!selectedConversation || selectedConversationMessages.length === 0) {
      return;
    }

    const latestMessage = selectedConversationMessages[selectedConversationMessages.length - 1];
    const previousLastSeenId = lastSeenMessageIdRef.current;

    if (previousLastSeenId === latestMessage.id) {
      return;
    }

    lastSeenMessageIdRef.current = latestMessage.id;

    if (!previousLastSeenId) {
      return;
    }

    if (latestMessage.sender_id !== user?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      showIncomingMessageNotice({
        text: `Nuevo mensaje de ${latestMessage.sender_name}`,
        conversationId: selectedConversation.id,
        messageId: latestMessage.id,
      });

      if (isNearBottom()) {
        scrollMessagesToBottom("smooth");
        setShowJumpToLatest(false);
      } else {
        setShowJumpToLatest(true);
      }
    }
  }, [isNearBottom, markConversationAsRead, selectedConversation, selectedConversationMessages, showIncomingMessageNotice, scrollMessagesToBottom, user?.id]);

  useEffect(() => {
    if (typeof window === "undefined" || uniqueConversations.length === 0) {
      return;
    }

    const echo = getEcho();
    if (!echo) {
      return;
    }

    const channelNames = uniqueConversations.map((conversation) => ({
      conversationId: conversation.id,
      channelName: getConversationChannelName(conversation.id),
    }));

    for (const { conversationId, channelName } of channelNames) {
      const channel = echo.private(channelName);

      const onMessageSent = (eventPayload: { message?: Partial<ChatMessage> & { id?: number | string; document?: DocumentAttachment | null }; sender_id?: number; conversation_id?: number; content?: string; created_at?: string; sender_name?: string }) => {
        const eventConversationId =
          eventPayload.message?.conversation_id ?? eventPayload.conversation_id ?? conversationId;

        const incomingMessage: ChatMessage | null = eventPayload.message
          ? {
              id: String(eventPayload.message.id ?? `${eventConversationId}-${Date.now()}`),
              conversation_id: eventConversationId,
              sender_id: eventPayload.message.sender_id ?? 0,
              sender_name: eventPayload.message.sender_name ?? "Sistema",
              content: eventPayload.message.content ?? "",
              type: eventPayload.message.type,
              document: eventPayload.message.document ?? null,
              created_at: eventPayload.message.created_at ?? new Date().toISOString(),
            }
          : eventPayload.content
            ? {
                id: String(Date.now()),
                conversation_id: eventConversationId,
                sender_id: eventPayload.sender_id ?? 0,
                sender_name: eventPayload.sender_name ?? "Sistema",
                content: eventPayload.content,
                type: undefined,
                document: null,
                created_at: eventPayload.created_at ?? new Date().toISOString(),
              }
            : null;

        if (!incomingMessage) {
          return;
        }

        appendIncomingMessage(incomingMessage);
      };

      channel.listen("MessageSent", onMessageSent);
      channel.listen(".MessageSent", onMessageSent);
      channel.listen("message.sent", onMessageSent);
      channel.listen(".message.sent", onMessageSent);
      channel.error((error: unknown) => {
        console.error("Reverb subscription error", error);
      });
    }

    return () => {
      for (const { channelName } of channelNames) {
        echo.leave(channelName);
      }
    };
  }, [appendIncomingMessage, uniqueConversations]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const channel = new BroadcastChannel(CHAT_SYNC_CHANNEL);
    chatBroadcastRef.current = channel;

    channel.onmessage = (event: MessageEvent<ChatSyncEvent>) => {
      const payload = event.data;

      if (!payload || typeof payload !== "object") {
        return;
      }

      if (payload.type === "message-sent" && payload.message) {
        appendIncomingMessage(payload.message);
      }

      if (payload.type === "conversation-created" && payload.conversation) {
        setConversations((current) => {
          const alreadyExists = current.some((conversation) => conversation.id === payload.conversation?.id);
          return alreadyExists ? current : [payload.conversation as Conversation, ...current];
        });

        setMessagesByConversation((current) => {
          if (current[payload.conversationId]) {
            return current;
          }

          return {
            ...current,
            [payload.conversationId]: [],
          };
        });
      }

      if (payload.type === "message-deleted" && payload.messageId) {
        setMessagesByConversation((current) => {
          const previousMessages = current[payload.conversationId] ?? [];
          return {
            ...current,
            [payload.conversationId]: previousMessages.filter((message) => message.id !== payload.messageId),
          };
        });
      }

      if (payload.type === "conversation-deleted") {
        removeConversationFromState(payload.conversationId);
      }
    };

    return () => {
      channel.close();
      chatBroadcastRef.current = null;
    };
  }, [appendIncomingMessage, removeConversationFromState]);

  const handleToggleUser = (candidateId: number) => {
    setSelectedUserIds((current) =>
      current.includes(candidateId)
        ? current.filter((id) => id !== candidateId)
        : [...current, candidateId],
    );
  };

  const handleCreateConversation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isAdmin) {
      return;
    }

    if (selectedUserIds.length === 0) {
      setErrorMessage("Selecciona al menos un usuario para iniciar el chat.");
      setIsPermissionError(false);
      return;
    }

    setIsCreatingConversation(true);
    setErrorMessage(null);
    setIsPermissionError(false);
    setSuccessMessage(null);

    try {
      const currentParticipantIds = [user?.id, ...selectedUserIds]
        .filter((participantId): participantId is number => typeof participantId === "number")
        .sort((left, right) => left - right);
      const currentParticipantKey = currentParticipantIds.join("-");

      const existingConversation = uniqueConversations.find((conversation) => {
        const participantIds = conversation.users
          .map((participant) => participant.id)
          .sort((left, right) => left - right)
          .join("-");

        return participantIds === currentParticipantKey;
      });

      if (existingConversation) {
        setSelectedConversationId(existingConversation.id);
        setSuccessMessage("Ya existe una conversacion con esos usuarios. La hemos reutilizado en la lista.");
        setSelectedUserIds([]);
        return;
      }

      const createdConversation = await apiFetch<Conversation>("/conversations", {
        method: "POST",
        body: {
          user_ids: selectedUserIds,
        },
      });

      setConversations((current) => [createdConversation, ...current]);
      setSelectedConversationId(createdConversation.id);
      setMessagesByConversation((current) => ({
        ...current,
        [createdConversation.id]: [],
      }));
      setSelectedUserIds([]);
      setSuccessMessage("Chat creado correctamente.");

      chatBroadcastRef.current?.postMessage({
        type: "conversation-created",
        conversationId: createdConversation.id,
        conversation: createdConversation,
      } satisfies ChatSyncEvent);
    } catch (error) {
      setHandledError(error, "No se pudo crear la conversacion.");
    } finally {
      setIsCreatingConversation(false);
    }
  };

  const submitDraftMessage = async () => {
    if (!selectedConversation) {
      setErrorMessage("Selecciona una conversacion antes de enviar un mensaje.");
      setIsPermissionError(false);
      return;
    }

    const trimmedMessage = draftMessage.trim();
    if (!trimmedMessage && !attachedFile) {
      setErrorMessage("Escribe un mensaje o adjunta un archivo para enviarlo.");
      setIsPermissionError(false);
      return;
    }

    if (attachedFile && attachedFile.size > MAX_ATTACHMENT_SIZE_BYTES) {
      setErrorMessage("El archivo supera el limite de 20 MB.");
      setIsPermissionError(false);
      return;
    }

    setErrorMessage(null);
    setIsPermissionError(false);
    setSuccessMessage(null);
    setIsSendingMessage(true);

    try {
      const formData = new FormData();
      formData.append("conversation_id", String(selectedConversation.id));

      if (trimmedMessage) {
        formData.append("content", trimmedMessage);
      }

      if (attachedFile) {
        formData.append("attachment", attachedFile);
      }

      const response = await apiFetch<{
        id: number;
        conversation_id: number;
        sender_id: number;
        content: string;
        type: string;
        document?: DocumentAttachment | null;
        created_at: string;
        updated_at: string;
      }>("/messages", {
        method: "POST",
        body: formData,
      });

      setMessagesByConversation((current) => {
        const previousMessages = current[selectedConversation.id] ?? [];
        const newMessage: ChatMessage = {
          id: String(response.id),
          conversation_id: response.conversation_id,
          sender_id: response.sender_id,
          sender_name: user?.name ?? "Tu",
          content: response.content,
          type: response.type,
          document: response.document ?? null,
          created_at: response.created_at,
        };

        return {
          ...current,
          [selectedConversation.id]: [
            ...previousMessages,
            newMessage,
          ],
        };
      });

      setDraftMessage("");
      setAttachedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setSuccessMessage("Mensaje enviado correctamente.");
      scrollMessagesToBottom("smooth");
      setShowJumpToLatest(false);

      chatBroadcastRef.current?.postMessage({
        type: "message-sent",
        conversationId: selectedConversation.id,
        message: {
          id: String(response.id),
          conversation_id: response.conversation_id,
          sender_id: response.sender_id,
          sender_name: user?.name ?? "Tu",
          content: response.content,
          type: response.type,
          document: response.document ?? null,
          created_at: response.created_at,
        },
      } satisfies ChatSyncEvent);
    } catch (error) {
      setHandledError(error, "No se pudo enviar el mensaje.");
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleSendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitDraftMessage();
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void submitDraftMessage();
  };

  const handleAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;

    if (nextFile && nextFile.size > MAX_ATTACHMENT_SIZE_BYTES) {
      setAttachedFile(null);
      setErrorMessage("El archivo supera el limite de 20 MB.");
      setIsPermissionError(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      return;
    }

    setErrorMessage(null);
    setIsPermissionError(false);
    setAttachedFile(nextFile);
  };

  const handleDeleteConversation = async (conversation: Conversation) => {
    if (!isAdmin) {
      return;
    }

    const confirmed = window.confirm(`Eliminar la conversacion "${conversation.name ?? `Conversacion ${conversation.id}`}"?`);
    if (!confirmed) {
      return;
    }

    setErrorMessage(null);
    setIsPermissionError(false);
    setSuccessMessage(null);

    try {
      await apiFetch(`/conversations/${conversation.id}`, {
        method: "DELETE",
      });

      removeConversationFromState(conversation.id);
      setSuccessMessage("Conversacion eliminada correctamente.");

      chatBroadcastRef.current?.postMessage({
        type: "conversation-deleted",
        conversationId: conversation.id,
      } satisfies ChatSyncEvent);
    } catch (error) {
      setHandledError(error, "No se pudo eliminar la conversacion.");
    }
  };

  const handleDeleteMessage = async (message: ChatMessage) => {
    if (!isAdmin) {
      return;
    }

    const confirmed = window.confirm("Eliminar este mensaje?");
    if (!confirmed) {
      return;
    }

    setErrorMessage(null);
    setIsPermissionError(false);
    setSuccessMessage(null);

    try {
      await apiFetch(`/messages/${message.id}`, {
        method: "DELETE",
      });

      setMessagesByConversation((current) => {
        const previousMessages = current[message.conversation_id] ?? [];
        return {
          ...current,
          [message.conversation_id]: previousMessages.filter((candidate) => candidate.id !== message.id),
        };
      });

      setSuccessMessage("Mensaje eliminado correctamente.");

      chatBroadcastRef.current?.postMessage({
        type: "message-deleted",
        conversationId: message.conversation_id,
        messageId: message.id,
      } satisfies ChatSyncEvent);
    } catch (error) {
      setHandledError(error, "No se pudo eliminar el mensaje.");
    }
  };

  return (
    <div className="min-h-screen bg-intra-ligth">
      <main className="flex min-h-screen w-full">
        <DashboardSidebar
          user={user ? { name: user.name, email: user.email } : null}
          isAdmin={isAdmin}
          canManageAnnouncements={canManageAnnouncements}
          activeRoute="conversations"
          statusMessage={isLoadingUser || isLoadingConversations ? "Cargando conversaciones..." : errorMessage ? errorMessage : "Conversaciones sincronizadas"}
        />

        <section className="min-w-0 flex-1 px-4 py-6 lg:px-6 xl:px-8 2xl:px-10">
          <div className="mx-auto w-full max-w-360 space-y-6">
            <header className="rounded-3xl border border-intra-border bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold tracking-[0.18em] text-intra-accent uppercase">
                Conversaciones
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-intra-secondary">
                Ruta inicial de chats
              </h2>
              <p className="mt-2 max-w-2xl text-base text-intra-secondary/70">
                Esta pantalla prueba la ruta /dashboard/conversations y el consumo de /conversations con Bearer token.
              </p>
            </header>

            {errorMessage ? (
              <div className={`rounded-3xl px-4 py-3 text-base shadow-sm ${isPermissionError ? "border border-amber-200 bg-amber-50 text-amber-800" : "border border-red-200 bg-red-50 text-red-700"}`}>
                {isPermissionError ? (
                  <p className="mb-1 inline-flex rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase">
                    Permisos
                  </p>
                ) : null}
                <p>{errorMessage}</p>
              </div>
            ) : null}

            {successMessage ? (
              <div className="pointer-events-none fixed top-4 right-4 z-50 rounded-2xl border border-emerald-200 bg-emerald-50/95 px-4 py-3 text-base font-medium text-emerald-700 shadow-lg backdrop-blur-sm">
                {successMessage}
              </div>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
              <section className="flex h-144 flex-col rounded-3xl border border-intra-border bg-white p-5 shadow-sm lg:h-[calc(100vh-12rem)]">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-intra-secondary">Conversaciones</h3>
                  <span className="rounded-full bg-intra-ligth px-3 py-1 text-sm font-medium text-intra-secondary">
                    {conversations.length}
                  </span>
                </div>

                <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-auto pr-1">
                  {isLoadingConversations ? (
                    <p className="text-base text-intra-secondary/70">Cargando lista...</p>
                  ) : null}

                  {!isLoadingConversations && conversations.length === 0 ? (
                    <p className="text-base text-intra-secondary/70">No hay conversaciones para mostrar.</p>
                  ) : null}

                  {uniqueConversations.map((conversation) => {
                    const isSelected = conversation.id === selectedConversationId;
                    const isRecentlyBumped = conversation.id === recentlyBumpedConversationId;

                    return (
                      <article
                        key={conversation.id}
                        className={`w-full rounded-2xl border p-4 text-left transition-all duration-500 ${isSelected ? "border-intra-primary bg-intra-ligth/45" : "border-intra-border hover:bg-intra-ligth/40"} ${isRecentlyBumped ? "border-red-500 bg-red-100 shadow-lg ring-1 ring-red-300" : ""}`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectConversation(conversation.id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-intra-secondary">
                                {conversation.name ?? `Conversacion ${conversation.id}`}
                              </p>
                              <p className="text-sm text-intra-secondary/55 capitalize">
                                {conversation.type}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {unreadByConversation[conversation.id] ? (
                                <span className="rounded-full bg-red-600 px-2 py-1 text-[11px] font-semibold text-white">
                                  {formatUnreadCount(unreadByConversation[conversation.id])}
                                </span>
                              ) : null}
                              <span className="rounded-full bg-intra-ligth px-2.5 py-1 text-sm font-semibold text-intra-secondary">
                                {conversation.users.length} usuarios
                              </span>
                            </div>
                          </div>
                          <p className="mt-3 text-base text-intra-secondary/75">
                            {conversation.users.map((conversationUser) => conversationUser.name).join(", ")}
                          </p>
                        </button>

                        {isAdmin ? (
                          <div className="mt-4 flex justify-end">
                            <button
                              type="button"
                              onClick={() => void handleDeleteConversation(conversation)}
                              className="rounded-xl border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                            >
                              Eliminar
                            </button>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>

                {isAdmin ? (
                  <form onSubmit={handleCreateConversation} className="mt-4 rounded-3xl border border-intra-border bg-intra-ligth/35 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold tracking-[0.18em] text-intra-accent uppercase">
                          Admin
                        </p>
                        <h4 className="mt-1 text-lg font-semibold tracking-tight text-intra-secondary">
                          Iniciar chat nuevo
                        </h4>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-intra-secondary">
                        {availableUsers.length}
                      </span>
                    </div>

                    <div className="mt-3 max-h-36 space-y-2 overflow-auto pr-1">
                      {isLoadingUsers ? (
                        <p className="text-base text-intra-secondary/70">Cargando usuarios activos...</p>
                      ) : null}

                      {!isLoadingUsers && availableUsers.length === 0 ? (
                        <p className="text-base text-intra-secondary/70">No hay usuarios disponibles para iniciar chat.</p>
                      ) : null}

                      {availableUsers.map((candidate) => {
                        const selected = selectedUserIds.includes(candidate.id);

                        return (
                          <label
                            key={candidate.id}
                            className={`flex cursor-pointer items-center justify-between gap-2 rounded-2xl border px-3 py-2 transition ${selected ? "border-intra-primary bg-white" : "border-intra-border bg-white/70 hover:bg-white"}`}
                          >
                            <div>
                              <p className="text-base font-semibold text-intra-secondary">{candidate.name}</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => handleToggleUser(candidate.id)}
                              className="h-4 w-4 rounded border-intra-border text-intra-primary focus:ring-intra-primary"
                            />
                          </label>
                        );
                      })}
                    </div>

                    <button
                      type="submit"
                      disabled={isCreatingConversation || selectedUserIds.length === 0}
                      className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-xl bg-intra-primary px-4 text-base font-semibold text-white transition hover:bg-[#173d7d] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCreatingConversation ? "Creando..." : "Iniciar chat"}
                    </button>
                  </form>
                ) : null}
              </section>

              <section className="flex h-144 flex-col rounded-3xl border border-intra-border bg-white p-6 shadow-sm lg:h-[calc(100vh-12rem)]">
                <p className="text-sm font-semibold tracking-[0.18em] text-intra-accent uppercase">
                  Vista previa
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-intra-secondary">
                  {selectedConversation ? selectedConversation.name ?? `Conversacion ${selectedConversation.id}` : "Panel de conversacion"}
                </h3>
                <p className="mt-2 max-w-2xl text-base text-intra-secondary/70">
                  {selectedConversation
                    ? `Conversacion ${selectedConversation.type} con ${selectedConversation.users.length} participante(s).`
                    : "Selecciona una conversacion para ver el hilo y enviar mensajes."}
                </p>
                {incomingMessageNotice ? (
                  <button
                    type="button"
                    onClick={openNoticeConversation}
                    className="mt-3 inline-flex items-center gap-2 rounded-full border border-red-400 bg-red-100 px-3 py-1 text-sm font-semibold text-red-800 transition hover:bg-red-200"
                  >
                    <span className="inline-block h-2 w-2 rounded-full bg-red-600" />
                    {incomingMessageNotice.text}
                  </button>
                ) : null}

                {selectedConversation ? (
                  <div className="relative mt-6 flex min-h-0 flex-1 flex-col space-y-4">
                    <div className="relative min-h-0 flex-1">
                      <div
                        ref={messagesContainerRef}
                        onScroll={handleMessagesScroll}
                        className="min-h-0 h-full space-y-3 overflow-auto rounded-3xl border border-intra-border bg-intra-ligth/20 p-4"
                      >
                        {selectedConversationMessages.map((message) => {
                          const isOwnMessage = message.sender_id === user?.id;

                          return (
                            <article
                              key={message.id}
                              className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
                            >
                              <div
                                className={`max-w-[80%] rounded-2xl px-4 py-3 text-base shadow-sm transition ${isOwnMessage ? "bg-intra-primary text-white" : "bg-white text-intra-secondary"} ${highlightedMessageId === message.id ? "ring-2 ring-sky-400 ring-offset-2 ring-offset-intra-ligth" : ""}`}
                              >
                                <div className="flex items-center justify-between gap-3 text-sm opacity-80">
                                  <span className="font-semibold">{message.sender_name}</span>
                                  <div className="flex items-center gap-2">
                                    <span>{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                                    {isAdmin ? (
                                      <button
                                        type="button"
                                        onClick={() => void handleDeleteMessage(message)}
                                        className={`rounded-full border px-2 py-0.5 text-xs font-semibold transition ${isOwnMessage ? "border-white/30 text-white hover:bg-white/10" : "border-red-200 text-red-700 hover:bg-red-50"}`}
                                      >
                                        Borrar
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                                {message.content ? (
                                  <p className="mt-2 leading-relaxed">{message.content}</p>
                                ) : null}

                                {message.document ? (
                                  <a
                                    href={getAttachmentUrl(message.document)}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      void handleDownloadAttachment(message.document as DocumentAttachment);
                                    }}
                                    className={`mt-2 inline-flex max-w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${isOwnMessage ? "border-white/35 bg-white/10 text-white hover:bg-white/20" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"}`}
                                  >
                                    <svg
                                      viewBox="0 0 20 20"
                                      fill="currentColor"
                                      className="h-4 w-4 shrink-0"
                                      aria-hidden="true"
                                    >
                                      <path
                                        fillRule="evenodd"
                                        d="M3.75 3a.75.75 0 0 0-.75.75v12.5c0 .414.336.75.75.75h12.5a.75.75 0 0 0 .75-.75V6.06a.75.75 0 0 0-.22-.53l-2.31-2.31a.75.75 0 0 0-.53-.22H3.75Zm8.5.75V6.5h2.75L12.25 3.75ZM10 8a.75.75 0 0 1 .75.75v2.19l.72-.72a.75.75 0 1 1 1.06 1.06l-2 2a.75.75 0 0 1-1.06 0l-2-2a.75.75 0 0 1 1.06-1.06l.72.72V8.75A.75.75 0 0 1 10 8Zm-2.5 6a.75.75 0 0 1 0-1.5h5a.75.75 0 0 1 0 1.5h-5Z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                    <span className="truncate">{getAttachmentName(message.document)}</span>
                                    <span className="shrink-0 opacity-80">{formatFileSize(message.document.size_bytes)}</span>
                                  </a>
                                ) : null}
                              </div>
                            </article>
                          );
                        })}
                        <div ref={messagesEndRef} aria-hidden="true" />
                      </div>

                      {showJumpToLatest ? (
                        <div className="pointer-events-none absolute left-3 bottom-3 z-20">
                          <button
                            type="button"
                            onClick={() => {
                              scrollMessagesToBottom("smooth");
                              setShowJumpToLatest(false);
                            }}
                            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-200"
                          >
                            <svg
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 3a.75.75 0 0 1 .75.75v10.69l3.22-3.22a.75.75 0 0 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.22 3.22V3.75A.75.75 0 0 1 10 3Z"
                                clipRule="evenodd"
                              />
                            </svg>
                            Ir al ultimo mensaje
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <form onSubmit={handleSendMessage} className="rounded-3xl border border-intra-border bg-intra-ligth/35 p-4">
                      <label htmlFor="message" className="text-base font-medium text-intra-secondary">
                        Nuevo mensaje
                      </label>
                      <textarea
                        id="message"
                        value={draftMessage}
                        onChange={(event) => setDraftMessage(event.target.value)}
                        placeholder="Escribe un mensaje..."
                        rows={3}
                        onKeyDown={handleComposerKeyDown}
                        className="mt-2 w-full rounded-2xl border border-intra-border bg-white px-4 py-3 text-base text-intra-secondary outline-none transition focus:border-intra-primary focus:ring-4 focus:ring-intra-primary/15"
                      />
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">
                          <input
                            ref={fileInputRef}
                            type="file"
                            onChange={handleAttachmentChange}
                            className="hidden"
                          />
                          Adjuntar archivo
                        </label>

                        {attachedFile ? (
                          <span className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">
                            <span className="max-w-[18rem] truncate">{attachedFile.name}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setAttachedFile(null);
                                setErrorMessage(null);
                                setIsPermissionError(false);
                                if (fileInputRef.current) {
                                  fileInputRef.current.value = "";
                                }
                              }}
                              className="rounded-md px-1 py-0.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                            >
                              Quitar
                            </button>
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 flex justify-end">
                        <button
                          type="submit"
                          disabled={isSendingMessage}
                          className="inline-flex h-11 items-center justify-center rounded-xl bg-intra-primary px-5 text-base font-semibold text-white transition hover:bg-[#173d7d] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSendingMessage ? "Enviando..." : "Enviar mensaje"}
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <div className="mt-6 rounded-3xl border border-dashed border-intra-border bg-intra-ligth/35 p-6">
                    <p className="text-base font-medium text-intra-secondary">Selecciona una conversacion</p>
                    <p className="mt-2 text-base text-intra-secondary/70">
                      Por ahora esta es una vista base para validar la ruta y la carga de datos desde el backend.
                    </p>
                  </div>
                )}

              </section>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
