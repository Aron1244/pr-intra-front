"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { API_BASE, ApiClientError, apiFetch } from "@/lib/api-client";
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
  attachments?: Array<{
    id: number;
    file_path: string;
    file_url?: string;
    original_name: string;
    mime_type?: string | null;
    is_image?: boolean;
  }>;
 };

 type Comment = {
   id: number;
   user_id: number;
   announcement_id: number;
   content: string;
   user?: {
     id: number;
     name: string;
   };
   created_at: string;
   updated_at: string;
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

function resolveAttachmentUrl(fileUrl: string | undefined, filePath: string): string {
  const backendOrigin = API_BASE.replace(/\/+api$/, "");

  if (fileUrl && /^https?:\/\//i.test(fileUrl)) {
    try {
      const remoteUrl = new URL(fileUrl);
      const backendUrl = new URL(backendOrigin);
      const isLocalHost = remoteUrl.hostname === "localhost" || remoteUrl.hostname === "127.0.0.1";

      if (isLocalHost && !remoteUrl.port && backendUrl.port) {
        remoteUrl.port = backendUrl.port;
      }

      return remoteUrl.toString();
    } catch {
      return fileUrl;
    }
  }

  if (fileUrl) {
    return `${backendOrigin}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
  }

  return `${backendOrigin}/storage/${filePath}`;
}

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [user, setUser] = useState<MeResponse["data"] | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationPreviews, setConversationPreviews] = useState<Record<number, string>>({});
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [commentsByAnnouncement, setCommentsByAnnouncement] = useState<Record<number, Comment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [expandedCommentPostId, setExpandedCommentPostId] = useState<number | null>(null);
  const [viewerImages, setViewerImages] = useState<Array<{ url: string; name: string }>>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  
  // Load comments for an announcement from API
  const loadComments = async (announcementId: number) => {
    try {
      const response = await apiFetch<{ data: Comment[] }>(`/announcements/${announcementId}/comments`, {
        method: "GET",
      });
      setCommentsByAnnouncement((current) => ({
        ...current,
        [announcementId]: Array.isArray(response.data) ? response.data : [],
      }));
    } catch {
      // Silently fail comment loading
    }
  };

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
          
            // Load comments for each announcement
            for (const announcement of announcementsResponse) {
              void loadComments(announcement.id);
            }
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
  const isViewerOpen = viewerImages.length > 0;

  const openImageViewer = (images: Array<{ url: string; name: string }>, index = 0) => {
    setViewerImages(images);
    setViewerIndex(index);
  };

  const closeImageViewer = () => {
    setViewerImages([]);
    setViewerIndex(0);
  };

  const goToPreviousImage = () => {
    setViewerIndex((current) => {
      if (viewerImages.length === 0) {
        return current;
      }

      return (current - 1 + viewerImages.length) % viewerImages.length;
    });
  };

  const goToNextImage = () => {
    setViewerIndex((current) => {
      if (viewerImages.length === 0) {
        return current;
      }

      return (current + 1) % viewerImages.length;
    });
  };

  const handleAddComment = (postId: number) => {
    if (isSubmittingComment) {
      return;
    }

    const rawComment = commentDrafts[postId] ?? "";
    const commentText = rawComment.trim();

    if (!commentText) {
      return;
    }

      setIsSubmittingComment(true);

      void apiFetch(`/announcements/${postId}/comments`, {
        method: "POST",
        body: {
          announcement_id: postId,
          content: commentText,
        },
      }).then(() => {
        setCommentDrafts((current) => ({
          ...current,
          [postId]: "",
        }));
        void loadComments(postId);
      }).catch(() => {
        setErrorMessage("No se pudo agregar el comentario.");
      }).finally(() => {
        setIsSubmittingComment(false);
      });
  };

  useEffect(() => {
    if (!isViewerOpen) {
      return;
    }

    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setViewerImages([]);
        setViewerIndex(0);
      }

      if (event.key === "ArrowLeft") {
        setViewerIndex((current) => {
          if (viewerImages.length === 0) {
            return current;
          }

          return (current - 1 + viewerImages.length) % viewerImages.length;
        });
      }

      if (event.key === "ArrowRight") {
        setViewerIndex((current) => {
          if (viewerImages.length === 0) {
            return current;
          }

          return (current + 1) % viewerImages.length;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.document.body.style.overflow = previousOverflow;
    };
  }, [isViewerOpen, viewerImages.length]);

  const departmentFeed = announcements
    .slice()
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, 8)
    .map((announcement) => {
      const imageAttachments = (announcement.attachments ?? []).filter((attachment) => {
        if (attachment.is_image || attachment.mime_type?.startsWith("image/")) {
          return true;
        }

        const imageExtensionPattern = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;
        return imageExtensionPattern.test(attachment.original_name) || imageExtensionPattern.test(attachment.file_path);
      });

      return {
        id: announcement.id,
        department: announcement.department?.name ?? "General",
        title: announcement.title,
        body: announcement.content,
        time: formatRelativeTime(announcement.created_at),
        author: announcement.creator?.name ?? "Usuario",
        images: imageAttachments.map((attachment) => ({
          url: resolveAttachmentUrl(attachment.file_url, attachment.file_path),
          name: attachment.original_name,
        })),
      };
    });

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
                    <p className="text-xs font-semibold tracking-[0.18em] text-intra-accent uppercase">
                      Dashboard
                    </p>
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

                  {departmentFeed.map((post) => {
                    const compactBody = post.body.replace(/\s+/g, " ").trim();
                    const previewBody = compactBody.length > 220 ? `${compactBody.slice(0, 220)}...` : compactBody;
                    const hasMore = compactBody.length > previewBody.length;
                    const comments = commentsByAnnouncement[post.id] ?? [];
                    const isCommentPanelOpen = expandedCommentPostId === post.id;

                    return (
                      <article key={post.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="px-5 pt-5 pb-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                                {post.author.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{post.author}</p>
                                <p className="text-xs text-slate-600">{post.department} - Publicacion interna</p>
                                <p className="text-xs text-slate-500">{post.time}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100"
                              aria-label="Mas opciones"
                            >
                              ...
                            </button>
                          </div>

                          <h3 className="mt-4 text-lg font-semibold text-slate-900">{post.title}</h3>
                          <p className="mt-2 text-sm leading-relaxed text-slate-700">{previewBody}</p>
                          {hasMore ? (
                            <button type="button" className="mt-1 text-sm font-medium text-slate-500 hover:text-slate-700">
                              ... mas
                            </button>
                          ) : null}
                        </div>

                        {post.images.length > 0 ? (
                          <div className="border-y border-slate-200 bg-slate-100 px-3 py-3">
                            <button
                              type="button"
                              onClick={() => openImageViewer(post.images, 0)}
                              className="block w-full"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={post.images[0].url}
                                alt={post.images[0].name ?? post.title}
                                className="h-[340px] w-full object-contain md:h-[560px]"
                              />
                            </button>

                            {post.images.length > 1 ? (
                              <div className="mt-3 grid grid-cols-4 gap-2">
                                {post.images.slice(1, 5).map((image, imageIndex) => (
                                  <button
                                    key={`${post.id}-${image.url}-${imageIndex}`}
                                    type="button"
                                    onClick={() => openImageViewer(post.images, imageIndex + 1)}
                                    className="overflow-hidden rounded-lg border border-slate-200 bg-white"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={image.url}
                                      alt={image.name}
                                      className="h-20 w-full object-contain"
                                    />
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="border-t border-slate-200 px-5 py-2 text-xs text-slate-500">
                          Publicacion destacada del departamento
                        </div>

                        <div className="grid grid-cols-2 border-t border-slate-200 text-sm text-slate-600 sm:grid-cols-4">
                          <button type="button" className="px-3 py-2.5 font-medium transition hover:bg-slate-50">
                            Recomendar
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedCommentPostId((current) => (current === post.id ? null : post.id))}
                            className="px-3 py-2.5 font-medium transition hover:bg-slate-50"
                          >
                            Comentar ({comments.length})
                          </button>
                          <button type="button" className="px-3 py-2.5 font-medium transition hover:bg-slate-50">
                            Compartir
                          </button>
                          <button type="button" className="px-3 py-2.5 font-medium transition hover:bg-slate-50">
                            Enviar
                          </button>
                        </div>

                        {isCommentPanelOpen ? (
                          <div className="border-t border-slate-200 bg-slate-50/60 px-4 py-3">
                            <div className="mb-3 max-h-52 space-y-2 overflow-auto pr-1">
                              {comments.length === 0 ? (
                                <p className="text-sm text-slate-500">Todavia no hay comentarios en esta publicacion.</p>
                              ) : null}

                              {comments.map((comment) => (
                                  <article key={`${comment.id}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                  <div className="flex items-center justify-between gap-2">
                                      <p className="text-xs font-semibold text-slate-700">{comment.user?.name ?? "Usuario"}</p>
                                      <p className="text-xs text-slate-500">{formatRelativeTime(comment.created_at)}</p>
                                  </div>
                                    <p className="mt-1 text-sm text-slate-700">{comment.content}</p>
                                </article>
                              ))}
                            </div>

                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={commentDrafts[post.id] ?? ""}
                                onChange={(event) =>
                                  setCommentDrafts((current) => ({
                                    ...current,
                                    [post.id]: event.target.value,
                                  }))
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    handleAddComment(post.id);
                                  }
                                }}
                                placeholder="Escribe un comentario..."
                                className="h-10 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-intra-primary focus:ring-2 focus:ring-intra-primary/20"
                              />
                              <button
                                type="button"
                                onClick={() => handleAddComment(post.id)}
                                disabled={isSubmittingComment}
                                className="h-10 rounded-xl bg-intra-primary px-3 text-sm font-semibold text-white transition hover:bg-[#173d7d] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isSubmittingComment ? "Publicando..." : "Publicar"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
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

      {isViewerOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4">
          <button
            type="button"
            className="absolute top-4 right-4 rounded-full border border-white/40 px-3 py-1 text-sm font-semibold text-white hover:bg-white/10"
            onClick={closeImageViewer}
          >
            Cerrar
          </button>

          {viewerImages.length > 1 ? (
            <button
              type="button"
              className="absolute left-4 rounded-full border border-white/40 px-3 py-2 text-xl text-white hover:bg-white/10"
              onClick={goToPreviousImage}
              aria-label="Imagen anterior"
            >
              {'<'}
            </button>
          ) : null}

          <div className="mx-auto w-full max-w-6xl">
            <figure className="overflow-hidden rounded-2xl bg-black/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={viewerImages[viewerIndex]?.url}
                alt={viewerImages[viewerIndex]?.name ?? "Imagen de publicacion"}
                className="max-h-[78vh] w-full object-contain"
              />
            </figure>
            <div className="mt-3 flex items-center justify-between text-sm text-white/90">
              <p className="truncate pr-4">{viewerImages[viewerIndex]?.name}</p>
              <p>{viewerIndex + 1} / {viewerImages.length}</p>
            </div>

            {viewerImages.length > 1 ? (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {viewerImages.map((image, imageIndex) => (
                  <button
                    key={`${image.url}-${imageIndex}`}
                    type="button"
                    onClick={() => setViewerIndex(imageIndex)}
                    className={`overflow-hidden rounded-lg border ${imageIndex === viewerIndex ? "border-white" : "border-white/30"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.url} alt={image.name} className="h-14 w-20 object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {viewerImages.length > 1 ? (
            <button
              type="button"
              className="absolute right-4 rounded-full border border-white/40 px-3 py-2 text-xl text-white hover:bg-white/10"
              onClick={goToNextImage}
              aria-label="Siguiente imagen"
            >
              {'>'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
