"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { ApiClientError, apiFetch } from "@/lib/api-client";
import { clearAccessToken } from "@/lib/auth-token";

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

type BackendMessage = {
  id: number;
  content: string;
  type?: string;
};

type Announcement = {
  id: number;
  title: string;
  content: string;
  created_at: string;
  creator?: {
    id: number;
    name: string;
  } | null;
  department?: {
    id: number;
    name: string;
  } | null;
};

function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const date = new Date(isoDate).getTime();
  const deltaSeconds = Math.max(1, Math.floor((now - date) / 1000));

  if (deltaSeconds < 60) {
    return "hace unos segundos";
  }

  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `hace ${deltaMinutes} min`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `hace ${deltaHours} h`;
  }

  const deltaDays = Math.floor(deltaHours / 24);
  return `hace ${deltaDays} d`;
}

function getConversationTitle(conversation: Conversation, currentUserId?: number): string {
  if (conversation.name) {
    return conversation.name;
  }

  const others = conversation.users.filter((participant) => participant.id !== currentUserId);
  if (others.length > 0) {
    return others.map((participant) => participant.name).join(", ");
  }

  return `Conversacion ${conversation.id}`;
}

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [user, setUser] = useState<MeResponse["data"] | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationPreviews, setConversationPreviews] = useState<Record<number, string>>({});
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    let ignore = false;

    const loadCurrentUser = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await apiFetch<MeResponse>("/me", { method: "GET" });

        if (!ignore) {
          setUser(response.data);
        }
      } catch (error) {
        if (!ignore) {
          if (error instanceof ApiClientError && error.status === 401) {
            setErrorMessage("No autenticado. Inicia sesion nuevamente.");
            clearAccessToken();
          } else if (error instanceof ApiClientError) {
            setErrorMessage(error.message);
          } else {
            setErrorMessage("No se pudo validar la sesion con el backend.");
          }
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    const loadConversations = async () => {
      setIsLoadingChats(true);

      try {
        const conversationsResponse = await apiFetch<Conversation[]>("/conversations", {
          method: "GET",
        });

        if (ignore) {
          return;
        }

        setConversations(conversationsResponse);

        const previewTargets = conversationsResponse.slice(0, 6);
        const previews = await Promise.all(
          previewTargets.map(async (conversation) => {
            try {
              const response = await apiFetch<BackendMessage[] | { data: BackendMessage[] }>(
                `/conversations/${conversation.id}/messages`,
                {
                  method: "GET",
                },
              );

              const messages = Array.isArray(response) ? response : response.data;
              const latest = messages[messages.length - 1];

              if (!latest) {
                return [conversation.id, "Sin mensajes todavia"] as const;
              }

              const normalizedContent = latest.content?.trim();
              if (normalizedContent) {
                return [conversation.id, normalizedContent] as const;
              }

              return [conversation.id, latest.type === "file" ? "Archivo adjunto" : "Mensaje sin texto"] as const;
            } catch {
              return [conversation.id, "Sin mensajes todavia"] as const;
            }
          }),
        );

        if (!ignore) {
          setConversationPreviews(Object.fromEntries(previews));
        }
      } catch {
        if (!ignore) {
          setConversations([]);
          setConversationPreviews({});
        }
      } finally {
        if (!ignore) {
          setIsLoadingChats(false);
        }
      }
    };

    const loadAnnouncements = async () => {
      setIsLoadingAnnouncements(true);

      try {
        const announcementsResponse = await apiFetch<Announcement[]>("/announcements", {
          method: "GET",
        });

        if (!ignore) {
          setAnnouncements(announcementsResponse);
        }
      } catch {
        if (!ignore) {
          setAnnouncements([]);
        }
      } finally {
        if (!ignore) {
          setIsLoadingAnnouncements(false);
        }
      }
    };

    void loadCurrentUser();
    void loadConversations();
    void loadAnnouncements();

    return () => {
      ignore = true;
    };
  }, []);

  const roles = user?.roles?.map((role) => role.name.toLowerCase()) ?? [];
  const isAdmin = roles.includes("admin");
  const canManageAnnouncements = Boolean(user?.can_manage_announcements);

  const departmentFeed = announcements
    .slice()
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, 8)
    .map((announcement) => ({
      id: announcement.id,
      department: announcement.department?.name ?? "General",
      title: announcement.title,
      body: announcement.content,
      time: formatRelativeTime(announcement.created_at),
      author: announcement.creator?.name ?? "Usuario",
    }));

  const chatContacts = conversations
    .slice()
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
    .slice(0, 6)
    .map((conversation) => ({
      id: conversation.id,
      name: getConversationTitle(conversation, user?.id),
      status: formatRelativeTime(conversation.updated_at),
      lastMessage: conversationPreviews[conversation.id] ?? "Sin mensajes todavia",
    }));

  return (
    <div className="min-h-screen bg-intra-ligth">
      <main className="flex min-h-screen w-full">
        <DashboardSidebar
          user={user ? { name: user.name, email: user.email } : null}
          isAdmin={isAdmin}
          canManageAnnouncements={canManageAnnouncements}
          activeRoute="dashboard"
          statusMessage={isLoading ? "Validando sesion..." : errorMessage ? errorMessage : "Sesion activa"}
        />

        <section className="min-w-0 flex-1 px-5 py-6 lg:px-6 xl:px-8">
          <div className="grid min-h-[calc(100vh-3rem)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-6">
              <header className="rounded-3xl border border-intra-border bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.18em] text-intra-accent uppercase">Dashboard</p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-tight text-intra-secondary">
                      Feed de departamentos
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm text-intra-secondary/70">
                      Aqui apareceran las publicaciones de los departamentos a los que pertenece el usuario.
                    </p>
                  </div>
                  <div className="rounded-xl border border-intra-border bg-intra-ligth px-4 py-2 text-sm text-intra-secondary">
                    Estado API: {isLoading ? "validando" : errorMessage ? "error" : "conectado"}
                  </div>
                </div>
              </header>

              <section className="space-y-4">
                {isLoading ? (
                  <div className="rounded-3xl border border-intra-border bg-white p-6 text-sm text-intra-secondary/70 shadow-sm">
                    Validando sesion con /me...
                  </div>
                ) : null}

                {errorMessage ? (
                  <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
                    {errorMessage}
                  </div>
                ) : null}

                {user ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <article className="rounded-3xl border border-intra-border bg-white p-5 shadow-sm">
                      <p className="text-xs tracking-[0.16em] text-intra-accent uppercase">Usuario</p>
                      <p className="mt-2 text-lg font-semibold text-intra-secondary">{user.name}</p>
                    </article>
                    <article className="rounded-3xl border border-intra-border bg-white p-5 shadow-sm">
                      <p className="text-xs tracking-[0.16em] text-intra-accent uppercase">Email</p>
                      <p className="mt-2 text-lg font-semibold text-intra-secondary">{user.email}</p>
                    </article>
                    <article className="rounded-3xl border border-intra-border bg-white p-5 shadow-sm">
                      <p className="text-xs tracking-[0.16em] text-intra-accent uppercase">Rol</p>
                      <p className="mt-2 text-lg font-semibold text-intra-secondary">
                        {user.roles?.length ? user.roles.map((role) => role.name).join(", ") : "Sin roles"}
                      </p>
                    </article>
                  </div>
                ) : null}

                <div className="grid gap-4">
                  {isLoadingAnnouncements ? (
                    <article className="rounded-3xl border border-intra-border bg-white p-6 text-sm text-intra-secondary/70 shadow-sm">
                      Cargando publicaciones...
                    </article>
                  ) : null}

                  {!isLoadingAnnouncements && departmentFeed.length === 0 ? (
                    <article className="rounded-3xl border border-intra-border bg-white p-6 text-sm text-intra-secondary/70 shadow-sm">
                      Aun no hay publicaciones para mostrar.
                    </article>
                  ) : null}

                  {departmentFeed.map((post) => (
                    <article key={post.id} className="rounded-3xl border border-intra-border bg-white p-6 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="rounded-full bg-intra-ligth px-3 py-1 text-xs font-semibold text-intra-secondary">
                          {post.department}
                        </p>
                        <p className="text-xs text-intra-secondary/55">{post.time}</p>
                      </div>
                      <h3 className="mt-4 text-xl font-semibold text-intra-secondary">{post.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-intra-secondary/75">{post.body}</p>
                      <p className="mt-3 text-xs text-intra-secondary/55">Publicado por {post.author}</p>
                      <div className="mt-5 flex gap-3 text-sm">
                        <button
                          type="button"
                          className="rounded-xl border border-intra-border px-4 py-2 text-intra-secondary transition hover:bg-intra-ligth"
                        >
                          Me gusta
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-intra-border px-4 py-2 text-intra-secondary transition hover:bg-intra-ligth"
                        >
                          Comentar
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-intra-border px-4 py-2 text-intra-secondary transition hover:bg-intra-ligth"
                        >
                          Compartir
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>

            <aside className="sticky top-6 h-fit rounded-3xl border border-intra-border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs tracking-[0.16em] text-intra-accent uppercase">Chats</p>
                  <h3 className="mt-1 text-lg font-semibold text-intra-secondary">Mensajes</h3>
                </div>
                <span className="rounded-full bg-intra-ligth px-3 py-1 text-xs font-medium text-intra-secondary">
                  Activos
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {isLoadingChats ? (
                  <article className="rounded-2xl border border-intra-border p-4 text-sm text-intra-secondary/70">
                    Cargando conversaciones...
                  </article>
                ) : null}

                {!isLoadingChats && chatContacts.length === 0 ? (
                  <article className="rounded-2xl border border-intra-border p-4 text-sm text-intra-secondary/70">
                    Aun no tienes conversaciones.
                  </article>
                ) : null}

                {chatContacts.map((contact) => (
                  <Link
                    key={contact.id}
                    href="/dashboard/conversations"
                    className="block rounded-2xl border border-intra-border p-4 transition hover:bg-intra-ligth/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-intra-secondary">{contact.name}</p>
                        <p className="text-xs text-intra-secondary/55">{contact.status}</p>
                      </div>
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm text-intra-secondary/75">{contact.lastMessage}</p>
                  </Link>
                ))}
              </div>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
}
