"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { API_BASE, ApiClientError, apiFetch } from "@/lib/api-client";
import { clearAccessToken, getAccessToken } from "@/lib/auth-token";

type MeResponse = {
  data: {
    id: number;
    name: string;
    email: string;
    department_id?: number | null;
    can_manage_announcements?: boolean;
    roles?: Array<{
      id: number;
      name: string;
    }>;
  };
};

type Announcement = {
  id: number;
  title: string;
  content: string;
  is_visible: boolean;
  department_id?: number | null;
  created_by?: number | null;
  created_at: string;
  updated_at: string;
  creator?: {
    id: number;
    name: string;
    email?: string;
  } | null;
  department?: {
    id: number;
    name: string;
  } | null;
  attachments?: AnnouncementAttachment[];
};

type AnnouncementAttachment = {
  id: number;
  announcement_id: number;
  file_path: string;
  file_url?: string;
  original_name: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  is_image?: boolean;
};

type AnnouncementFormState = {
  title: string;
  content: string;
  is_visible: boolean;
  publish_all: boolean;
  department_id: string;
};

const INITIAL_FORM_STATE: AnnouncementFormState = {
  title: "",
  content: "",
  is_visible: false,
  publish_all: false,
  department_id: "",
};

type DepartmentOption = {
  id: number;
  name: string;
};

type DepartmentsResponse = {
  data: DepartmentOption[];
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

function makePreviewText(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= 220) {
    return normalized;
  }

  return `${normalized.slice(0, 220)}...`;
}

export default function PublicationsPage() {
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(true);
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);
  const [isUpdatingVisibilityId, setIsUpdatingVisibilityId] = useState<number | null>(null);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [canAccessPublications, setCanAccessPublications] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPermissionError, setIsPermissionError] = useState(false);
  const [user, setUser] = useState<MeResponse["data"] | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [formState, setFormState] = useState<AnnouncementFormState>(INITIAL_FORM_STATE);
  const [newAttachments, setNewAttachments] = useState<File[]>([]);
  const [removeAttachmentIds, setRemoveAttachmentIds] = useState<number[]>([]);
  const formSectionRef = useRef<HTMLElement | null>(null);

  const backendOrigin = useMemo(() => API_BASE.replace(/\/+api$/, ""), []);

  const newAttachmentPreviews = useMemo(
    () =>
      newAttachments.map((file) => ({
        file,
        objectUrl: URL.createObjectURL(file),
        isImage: file.type.startsWith("image/"),
      })),
    [newAttachments],
  );

  useEffect(
    () => () => {
      for (const preview of newAttachmentPreviews) {
        URL.revokeObjectURL(preview.objectUrl);
      }
    },
    [newAttachmentPreviews],
  );

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

  const loadAnnouncements = useCallback(async () => {
    const announcementsResponse = await apiFetch<Announcement[]>("/announcements", { method: "GET" });
    setAnnouncements(announcementsResponse);
  }, []);

  useEffect(() => {
    let ignore = false;

    const loadPageData = async () => {
      setIsLoadingUser(true);
      setIsLoadingAnnouncements(true);
      setErrorMessage(null);
      setIsPermissionError(false);

      try {
        const meResponse = await apiFetch<MeResponse>("/me", { method: "GET" });

        if (ignore) {
          return;
        }

        const allowed = Boolean(meResponse.data.can_manage_announcements);
        setUser(meResponse.data);
        setCanAccessPublications(allowed);

        if (meResponse.data.department_id) {
          setFormState((current) => ({
            ...current,
            department_id: String(meResponse.data.department_id),
          }));
        }

        const departmentsResponse = await apiFetch<DepartmentsResponse>("/departments", { method: "GET" });
        if (!ignore) {
          setDepartments(departmentsResponse.data);
        }

        if (!allowed) {
          setAnnouncements([]);
          setErrorMessage("No tienes permisos para acceder a Publicaciones.");
          setIsPermissionError(true);
          return;
        }

        await loadAnnouncements();
      } catch (error) {
        if (!ignore) {
          if (error instanceof ApiClientError && error.status === 401) {
            setErrorMessage("No autenticado. Inicia sesion nuevamente.");
            setIsPermissionError(false);
            clearAccessToken();
          } else if (error instanceof ApiClientError && error.status === 403) {
            setErrorMessage("No tienes permisos para ver publicaciones.");
            setIsPermissionError(true);
          } else if (error instanceof ApiClientError) {
            setErrorMessage(error.message);
            setIsPermissionError(false);
          } else {
            setErrorMessage("No se pudo cargar la seccion de publicaciones.");
            setIsPermissionError(false);
          }
        }
      } finally {
        if (!ignore) {
          setIsLoadingUser(false);
          setIsLoadingAnnouncements(false);
        }
      }
    };

    void loadPageData();

    return () => {
      ignore = true;
    };
  }, [loadAnnouncements]);

  const roles = user?.roles?.map((role) => role.name.toLowerCase()) ?? [];
  const isAdmin = roles.includes("admin");
  const canManageAnnouncements = Boolean(user?.can_manage_announcements);

  const sortedAnnouncements = useMemo(
    () =>
      announcements.slice().sort((left, right) => {
        const rightTime = new Date(right.created_at).getTime();
        const leftTime = new Date(left.created_at).getTime();
        return rightTime - leftTime;
      }),
    [announcements],
  );

  const editingAnnouncement = useMemo(
    () => announcements.find((item) => item.id === editingAnnouncementId) ?? null,
    [announcements, editingAnnouncementId],
  );

  const previewExistingAttachments = useMemo(
    () =>
      editingAnnouncement?.attachments?.filter(
        (attachment) => !removeAttachmentIds.includes(attachment.id),
      ) ?? [],
    [editingAnnouncement, removeAttachmentIds],
  );

  const canManageAnnouncement = useCallback(
    (announcement: Announcement) => {
      if (isAdmin) {
        return true;
      }

      return user?.department_id !== null && user?.department_id === announcement.department_id;
    },
    [isAdmin, user?.department_id],
  );

  const resetForm = () => {
    setFormState((current) => ({
      ...INITIAL_FORM_STATE,
      department_id: user?.department_id ? String(user.department_id) : current.department_id,
    }));
    setEditingAnnouncementId(null);
    setShowPreview(false);
    setNewAttachments([]);
    setRemoveAttachmentIds([]);
  };

  const handleSubmitAnnouncement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canAccessPublications || !user) {
      return;
    }

    const normalizedTitle = formState.title.trim();
    const normalizedContent = formState.content.trim();
    const selectedDepartmentId = formState.department_id || (user.department_id ? String(user.department_id) : "");

    if (!normalizedTitle || !normalizedContent) {
      setErrorMessage("Completa titulo y contenido antes de guardar.");
      setIsPermissionError(false);
      return;
    }

    if (!isAdmin && !selectedDepartmentId) {
      setErrorMessage("Tu usuario no tiene departamento asignado para publicar.");
      setIsPermissionError(false);
      return;
    }

    if (isAdmin && !formState.publish_all && !selectedDepartmentId) {
      setErrorMessage("Selecciona un departamento o activa \"Publicar para todos los departamentos\".");
      setIsPermissionError(false);
      return;
    }

    setIsSavingAnnouncement(true);
    setErrorMessage(null);
    setIsPermissionError(false);

    try {
      const payload = new FormData();
      payload.append("title", normalizedTitle);
      payload.append("content", normalizedContent);
      payload.append("is_visible", formState.is_visible ? "1" : "0");

      for (const file of newAttachments) {
        payload.append("attachments[]", file);
      }

      for (const attachmentId of removeAttachmentIds) {
        payload.append("remove_attachment_ids[]", String(attachmentId));
      }

      if (editingAnnouncementId) {
        if (isAdmin && !formState.publish_all && selectedDepartmentId) {
          payload.append("department_id", selectedDepartmentId);
        }

        payload.append("_method", "PATCH");

        await apiFetch<Announcement>(`/announcements/${editingAnnouncementId}`, {
          method: "POST",
          body: payload,
        });

        setSuccessMessage(formState.is_visible ? "Publicacion actualizada y visible." : "Publicacion actualizada (oculta).");
      } else {
        if (!isAdmin || !formState.publish_all) {
          payload.append("department_id", selectedDepartmentId);
        }

        if (isAdmin) {
          payload.append("publish_all", formState.publish_all ? "1" : "0");
        }

        await apiFetch<Announcement>("/announcements", {
          method: "POST",
          body: payload,
        });

        if (isAdmin && formState.publish_all) {
          setSuccessMessage(formState.is_visible ? "Publicacion visible creada para todos los departamentos." : "Borrador creado para todos los departamentos.");
        } else {
          setSuccessMessage(formState.is_visible ? "Publicacion creada y visible." : "Publicacion creada como borrador (oculta).");
        }
      }

      resetForm();
      await loadAnnouncements();
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 403) {
        setErrorMessage("No tienes permisos para guardar publicaciones.");
        setIsPermissionError(true);
      } else if (error instanceof ApiClientError) {
        setErrorMessage(error.message);
        setIsPermissionError(false);
      } else {
        setErrorMessage("No se pudo guardar la publicacion.");
        setIsPermissionError(false);
      }
    } finally {
      setIsSavingAnnouncement(false);
    }
  };

  const getAttachmentUrl = useCallback((attachment: AnnouncementAttachment) => {
    if (attachment.file_url && /^https?:\/\//i.test(attachment.file_url)) {
      try {
        const remoteUrl = new URL(attachment.file_url);
        const backendUrl = new URL(backendOrigin);
        const isLocalHost = remoteUrl.hostname === "localhost" || remoteUrl.hostname === "127.0.0.1";

        if (isLocalHost && !remoteUrl.port && backendUrl.port) {
          remoteUrl.port = backendUrl.port;
        }

        return remoteUrl.toString();
      } catch {
        return attachment.file_url;
      }
    }

    if (attachment.file_url) {
      return `${backendOrigin}${attachment.file_url.startsWith("/") ? "" : "/"}${attachment.file_url}`;
    }

    return `${backendOrigin}/storage/${attachment.file_path}`;
  }, [backendOrigin]);

  const handleDownloadAttachment = useCallback(async (announcementId: number, attachment: AnnouncementAttachment) => {
    const token = getAccessToken();

    if (!token) {
      setErrorMessage("Sesion expirada. Inicia sesion nuevamente.");
      setIsPermissionError(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/announcements/${announcementId}/attachments/${attachment.id}/download`, {
        method: "GET",
        headers: {
          Accept: "application/octet-stream",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = blobUrl;
      link.download = attachment.original_name;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      setErrorMessage("No se pudo descargar el adjunto.");
      setIsPermissionError(false);
    }
  }, []);

  const handleEditAnnouncement = (announcement: Announcement) => {
    setFormState({
      title: announcement.title,
      content: announcement.content,
      is_visible: announcement.is_visible,
      publish_all: false,
      department_id: announcement.department_id
        ? String(announcement.department_id)
        : (user?.department_id ? String(user.department_id) : ""),
    });
    setEditingAnnouncementId(announcement.id);
    setShowPreview(false);
    setNewAttachments([]);
    setRemoveAttachmentIds([]);

    window.requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleDeleteAnnouncement = async (announcement: Announcement) => {
    const confirmed = window.confirm(`Eliminar la publicacion \"${announcement.title}\"?`);
    if (!confirmed) {
      return;
    }

    setErrorMessage(null);
    setIsPermissionError(false);

    try {
      await apiFetch(`/announcements/${announcement.id}`, {
        method: "DELETE",
      });

      setSuccessMessage("Publicacion eliminada correctamente.");
      if (editingAnnouncementId === announcement.id) {
        resetForm();
      }
      await loadAnnouncements();
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 403) {
        setErrorMessage("No tienes permisos para eliminar esta publicacion.");
        setIsPermissionError(true);
      } else if (error instanceof ApiClientError) {
        setErrorMessage(error.message);
        setIsPermissionError(false);
      } else {
        setErrorMessage("No se pudo eliminar la publicacion.");
        setIsPermissionError(false);
      }
    }
  };

  const handleToggleVisibility = async (announcement: Announcement) => {
    setErrorMessage(null);
    setIsPermissionError(false);
    setIsUpdatingVisibilityId(announcement.id);

    try {
      const nextVisibility = !announcement.is_visible;

      await apiFetch<Announcement>(`/announcements/${announcement.id}`, {
        method: "PATCH",
        body: {
          is_visible: nextVisibility,
        },
      });

      setSuccessMessage(nextVisibility ? "Publicacion marcada como visible." : "Publicacion cambiada a borrador.");
      await loadAnnouncements();
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 403) {
        setErrorMessage("No tienes permisos para cambiar la visibilidad.");
        setIsPermissionError(true);
      } else if (error instanceof ApiClientError) {
        setErrorMessage(error.message);
        setIsPermissionError(false);
      } else {
        setErrorMessage("No se pudo actualizar la visibilidad.");
        setIsPermissionError(false);
      }
    } finally {
      setIsUpdatingVisibilityId(null);
    }
  };

  return (
    <div className="min-h-screen bg-intra-ligth">
      <main className="flex min-h-screen w-full">
        <DashboardSidebar
          user={user ? { name: user.name, email: user.email } : null}
          isAdmin={isAdmin}
          canManageAnnouncements={canManageAnnouncements}
          activeRoute="publications"
          statusMessage={isLoadingUser || isLoadingAnnouncements ? "Cargando publicaciones..." : errorMessage ? errorMessage : "Publicaciones sincronizadas"}
        />

        <section className="min-w-0 flex-1 px-4 py-6 lg:px-6 xl:px-8 2xl:px-10">
          <div className="mx-auto w-full max-w-360 space-y-6">
            <header className="rounded-3xl border border-intra-border bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold tracking-[0.18em] text-intra-accent uppercase">
                Publicaciones
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-intra-secondary">
                Feed estilo LinkedIn interno
              </h2>
              <p className="mt-2 max-w-3xl text-base text-intra-secondary/70">
                Crea publicaciones, revisa preview antes de guardarlas y decide si quedan visibles o como borrador.
              </p>
            </header>

            {errorMessage ? (
              <div className={`rounded-3xl px-4 py-3 text-base shadow-sm ${isPermissionError ? "border border-amber-200 bg-amber-50 text-amber-800" : "border border-red-200 bg-red-50 text-red-700"}`}>
                <p>{errorMessage}</p>
              </div>
            ) : null}

            {successMessage ? (
              <div className="pointer-events-none fixed top-4 right-4 z-50 rounded-2xl border border-emerald-200 bg-emerald-50/95 px-4 py-3 text-base font-medium text-emerald-700 shadow-lg backdrop-blur-sm">
                {successMessage}
              </div>
            ) : null}

            {!isLoadingAnnouncements && !canAccessPublications ? (
              <section className="rounded-3xl border border-intra-border bg-white p-5 shadow-sm">
                <p className="text-base text-intra-secondary/70">Solo usuarios autorizados pueden administrar publicaciones.</p>
              </section>
            ) : null}

            {canAccessPublications ? (
              <>
                <section ref={formSectionRef} className="rounded-3xl border border-intra-border bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-semibold text-intra-secondary">
                      {editingAnnouncementId ? "Editar publicacion" : "Nueva publicacion"}
                    </h3>
                    <span className={`rounded-full px-3 py-1 text-sm font-semibold ${formState.is_visible ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {formState.is_visible ? "Visible" : "Borrador"}
                    </span>
                  </div>

                  <form onSubmit={handleSubmitAnnouncement} className="mt-4 space-y-3">
                    <div>
                      <label htmlFor="announcement-title" className="text-sm font-medium text-intra-secondary">
                        Titulo
                      </label>
                      <input
                        id="announcement-title"
                        type="text"
                        value={formState.title}
                        onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
                        placeholder="Ej. Nueva politica de vacaciones"
                        className="mt-1 w-full rounded-2xl border border-intra-border bg-white px-4 py-2.5 text-base text-intra-secondary outline-none transition focus:border-intra-primary focus:ring-4 focus:ring-intra-primary/15"
                      />
                    </div>

                    <div>
                      <label htmlFor="announcement-attachments" className="text-sm font-medium text-intra-secondary">
                        Adjuntos (imagenes o archivos)
                      </label>
                      <input
                        id="announcement-attachments"
                        type="file"
                        multiple
                        onChange={(event) => {
                          const files = Array.from(event.target.files ?? []);
                          setNewAttachments((current) => [...current, ...files]);
                          event.currentTarget.value = "";
                        }}
                        className="mt-1 block w-full text-sm text-intra-secondary file:mr-3 file:rounded-xl file:border-0 file:bg-intra-primary file:px-3 file:py-2 file:font-semibold file:text-white hover:file:bg-[#173d7d]"
                      />
                      {newAttachments.length > 0 ? (
                        <div className="mt-1 space-y-1">
                          <p className="text-xs text-intra-secondary/60">
                            {newAttachments.length} archivo(s) nuevo(s) seleccionado(s).
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {newAttachments.map((file, index) => (
                              <button
                                key={`${file.name}-${file.lastModified}-${index}`}
                                type="button"
                                onClick={() => setNewAttachments((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                                className="rounded-full border border-intra-border bg-white px-2.5 py-1 text-xs text-intra-secondary hover:bg-intra-ligth"
                              >
                                Quitar {file.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div>
                      <label htmlFor="announcement-department" className="text-sm font-medium text-intra-secondary">
                        Departamento
                      </label>
                      <select
                        id="announcement-department"
                        value={formState.department_id}
                        onChange={(event) => setFormState((current) => ({ ...current, department_id: event.target.value }))}
                        disabled={!isAdmin || formState.publish_all}
                        className="mt-1 w-full rounded-2xl border border-intra-border bg-white px-4 py-2.5 text-base text-intra-secondary outline-none transition focus:border-intra-primary focus:ring-4 focus:ring-intra-primary/15 disabled:cursor-not-allowed disabled:bg-slate-100"
                      >
                        <option value="">Selecciona un departamento</option>
                        {departments.map((department) => (
                          <option key={department.id} value={String(department.id)}>
                            {department.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {editingAnnouncementId ? (
                      <div className="rounded-2xl border border-intra-border bg-intra-ligth/30 p-3">
                        <p className="text-xs font-semibold tracking-wide text-intra-secondary/70 uppercase">Adjuntos actuales</p>
                        <div className="mt-2 space-y-2">
                          {editingAnnouncement
                            ?.attachments?.map((attachment) => (
                              <label key={attachment.id} className="flex items-center gap-2 text-sm text-intra-secondary">
                                <input
                                  type="checkbox"
                                  checked={removeAttachmentIds.includes(attachment.id)}
                                  onChange={(event) => {
                                    setRemoveAttachmentIds((current) =>
                                      event.target.checked
                                        ? [...current, attachment.id]
                                        : current.filter((id) => id !== attachment.id),
                                    );
                                  }}
                                  className="h-4 w-4 rounded border-intra-border text-intra-primary focus:ring-intra-primary"
                                />
                                <span>Eliminar: {attachment.original_name}</span>
                              </label>
                            ))}
                        </div>
                      </div>
                    ) : null}

                    <div>
                      <label htmlFor="announcement-content" className="text-sm font-medium text-intra-secondary">
                        Contenido
                      </label>
                      <textarea
                        id="announcement-content"
                        value={formState.content}
                        onChange={(event) => setFormState((current) => ({ ...current, content: event.target.value }))}
                        rows={5}
                        placeholder="Comparte una actualizacion para el equipo..."
                        className="mt-1 w-full rounded-2xl border border-intra-border bg-white px-4 py-3 text-base text-intra-secondary outline-none transition focus:border-intra-primary focus:ring-4 focus:ring-intra-primary/15"
                      />
                    </div>

                    <label className="inline-flex items-center gap-2 rounded-xl border border-intra-border bg-intra-ligth/40 px-3 py-2 text-sm text-intra-secondary">
                      <input
                        type="checkbox"
                        checked={formState.is_visible}
                        onChange={(event) => setFormState((current) => ({ ...current, is_visible: event.target.checked }))}
                        className="h-4 w-4 rounded border-intra-border text-intra-primary focus:ring-intra-primary"
                      />
                      Marcar como visible
                    </label>

                    {isAdmin ? (
                      <label className="inline-flex items-center gap-2 rounded-xl border border-intra-border bg-intra-ligth/40 px-3 py-2 text-sm text-intra-secondary">
                        <input
                          type="checkbox"
                          checked={formState.publish_all}
                          onChange={(event) => setFormState((current) => ({ ...current, publish_all: event.target.checked }))}
                          className="h-4 w-4 rounded border-intra-border text-intra-primary focus:ring-intra-primary"
                        />
                        Publicar para todos los departamentos
                      </label>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowPreview((current) => !current)}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-intra-border px-4 text-sm font-semibold text-intra-secondary transition hover:bg-intra-ligth"
                      >
                        {showPreview ? "Ocultar preview" : "Ver preview"}
                      </button>
                      {editingAnnouncementId ? (
                        <button
                          type="button"
                          onClick={resetForm}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-intra-border px-4 text-sm font-semibold text-intra-secondary transition hover:bg-intra-ligth"
                        >
                          Cancelar edicion
                        </button>
                      ) : null}
                      <button
                        type="submit"
                        disabled={isSavingAnnouncement}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-intra-primary px-4 text-sm font-semibold text-white transition hover:bg-[#173d7d] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSavingAnnouncement ? "Guardando..." : editingAnnouncementId ? "Actualizar" : "Crear publicacion"}
                      </button>
                    </div>
                  </form>

                  {showPreview ? (
                    <article className="mt-4 rounded-2xl border border-intra-border bg-white p-5 shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-intra-primary/15 text-lg font-semibold text-intra-primary">
                          {(user?.name ?? "U").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-intra-secondary">{user?.name ?? "Usuario"}</p>
                          <p className="text-xs text-intra-secondary/55">Preview • ahora</p>
                        </div>
                      </div>
                      <h4 className="mt-3 text-xl font-semibold text-intra-secondary">
                        {formState.title.trim() || "Titulo de la publicacion"}
                      </h4>
                      <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-intra-secondary/85">
                        {formState.content.trim() || "Aqui veras la vista previa del contenido."}
                      </p>

                      {previewExistingAttachments.length > 0 || newAttachmentPreviews.length > 0 ? (
                        <div className="mt-4 space-y-3">
                          {previewExistingAttachments.map((attachment) => {
                            const isImage = Boolean(attachment.is_image) || (attachment.mime_type?.startsWith("image/") ?? false);

                            if (isImage) {
                              return (
                                <figure key={`existing-${attachment.id}`} className="overflow-hidden rounded-2xl border border-intra-border bg-white">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={getAttachmentUrl(attachment)}
                                    alt={attachment.original_name}
                                    className="h-auto max-h-96 w-full object-cover"
                                  />
                                  <figcaption className="px-3 py-2 text-xs text-intra-secondary/60">
                                    {attachment.original_name}
                                  </figcaption>
                                </figure>
                              );
                            }

                            return (
                              <div
                                key={`existing-${attachment.id}`}
                                className="rounded-xl border border-intra-border bg-intra-ligth/25 px-3 py-2 text-sm text-intra-secondary"
                              >
                                Archivo adjunto: {attachment.original_name}
                              </div>
                            );
                          })}

                          {newAttachmentPreviews.map((preview) => {
                            if (preview.isImage) {
                              return (
                                <figure key={`new-${preview.file.name}-${preview.file.lastModified}`} className="overflow-hidden rounded-2xl border border-intra-border bg-white">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={preview.objectUrl}
                                    alt={preview.file.name}
                                    className="h-auto max-h-96 w-full object-cover"
                                  />
                                  <figcaption className="px-3 py-2 text-xs text-intra-secondary/60">
                                    Nuevo: {preview.file.name}
                                  </figcaption>
                                </figure>
                              );
                            }

                            return (
                              <div
                                key={`new-${preview.file.name}-${preview.file.lastModified}`}
                                className="rounded-xl border border-intra-border bg-intra-ligth/25 px-3 py-2 text-sm text-intra-secondary"
                              >
                                Nuevo archivo: {preview.file.name}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      <div className="mt-4 inline-flex rounded-full border border-intra-border bg-intra-ligth/50 px-3 py-1 text-xs font-semibold text-intra-secondary/70">
                        {formState.is_visible ? "Estado: Visible" : "Estado: Borrador (oculto)"}
                      </div>
                      {isAdmin && formState.publish_all ? (
                        <div className="mt-2 inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                          Alcance: Todos los departamentos
                        </div>
                      ) : null}
                    </article>
                  ) : null}
                </section>

                <section className="rounded-3xl border border-intra-border bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-semibold text-intra-secondary">Feed</h3>
                    <span className="rounded-full bg-intra-ligth px-3 py-1 text-sm font-medium text-intra-secondary">
                      {sortedAnnouncements.length}
                    </span>
                  </div>

                  <div className="mt-4 min-h-0 space-y-4 overflow-auto pr-1">
                    {isLoadingAnnouncements ? (
                      <p className="text-base text-intra-secondary/70">Cargando publicaciones...</p>
                    ) : null}

                    {!isLoadingAnnouncements && sortedAnnouncements.length === 0 ? (
                      <p className="text-base text-intra-secondary/70">Aun no hay publicaciones disponibles.</p>
                    ) : null}

                    {sortedAnnouncements.map((announcement) => {
                      const canManageCurrent = canManageAnnouncement(announcement);
                      const imageAttachments = (announcement.attachments ?? []).filter(
                        (attachment) =>
                          Boolean(attachment.is_image) || (attachment.mime_type?.startsWith("image/") ?? false),
                      );
                      const fileAttachments = (announcement.attachments ?? []).filter(
                        (attachment) =>
                          !(Boolean(attachment.is_image) || (attachment.mime_type?.startsWith("image/") ?? false)),
                      );
                      const contentPreview = makePreviewText(announcement.content);
                      const hasLongContent = contentPreview.length < announcement.content.replace(/\s+/g, " ").trim().length;

                      return (
                        <article
                          key={announcement.id}
                          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                        >
                          <div className="px-5 pt-5 pb-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-base font-semibold text-slate-700">
                                  {(announcement.creator?.name ?? "U").charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">
                                    {announcement.creator?.name ?? "Usuario"}
                                  </p>
                                  <p className="truncate text-xs text-slate-600">
                                    {announcement.department?.name ? `${announcement.department.name} • Publicacion interna` : "General • Publicacion interna"}
                                  </p>
                                  <p className="text-xs text-slate-500">{formatRelativeTime(announcement.created_at)}</p>
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

                            <h4 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">{announcement.title}</h4>
                            <p className="mt-2 text-sm leading-relaxed text-slate-700">{contentPreview}</p>
                            {hasLongContent ? (
                              <button type="button" className="mt-1 text-sm font-medium text-slate-500 hover:text-slate-700">
                                ... mas
                              </button>
                            ) : null}

                            <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${announcement.is_visible ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                              {announcement.is_visible ? "Visible" : "Borrador"}
                            </span>
                          </div>

                          {imageAttachments.length > 0 ? (
                            <div className="border-y border-slate-200 bg-slate-100">
                              <figure className="overflow-hidden">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={getAttachmentUrl(imageAttachments[0])}
                                  alt={imageAttachments[0].original_name}
                                  className="h-auto max-h-[560px] w-full object-cover"
                                />
                              </figure>
                            </div>
                          ) : null}

                          <div className="px-5 py-3 text-xs text-slate-500">
                            {imageAttachments.length + fileAttachments.length > 0
                              ? `${imageAttachments.length + fileAttachments.length} adjunto(s) en esta publicacion`
                              : "Publicacion sin adjuntos"}
                          </div>

                          {fileAttachments.length > 0 ? (
                            <div className="px-5 pb-3">
                              <div className="flex flex-wrap gap-2">
                                {fileAttachments.map((attachment) => (
                                  <button
                                    key={attachment.id}
                                    type="button"
                                    onClick={() => void handleDownloadAttachment(announcement.id, attachment)}
                                    className="inline-flex items-center gap-2 rounded-xl border border-intra-border bg-white px-3 py-2 text-sm font-medium text-intra-secondary transition hover:bg-intra-ligth"
                                  >
                                    Descargar: {attachment.original_name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="grid grid-cols-2 border-t border-slate-200 text-sm text-slate-600 sm:grid-cols-4">
                            <button type="button" className="px-3 py-2.5 font-medium transition hover:bg-slate-50">Recomendar</button>
                            <button type="button" className="px-3 py-2.5 font-medium transition hover:bg-slate-50">Comentar</button>
                            <button type="button" className="px-3 py-2.5 font-medium transition hover:bg-slate-50">Compartir</button>
                            <button type="button" className="px-3 py-2.5 font-medium transition hover:bg-slate-50">Enviar</button>
                          </div>

                          {canManageCurrent ? (
                            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3">
                              <button
                                type="button"
                                onClick={() => void handleToggleVisibility(announcement)}
                                disabled={isUpdatingVisibilityId === announcement.id}
                                className={`inline-flex h-9 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${announcement.is_visible ? "border-amber-200 text-amber-700 hover:bg-amber-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}
                              >
                                {isUpdatingVisibilityId === announcement.id
                                  ? "Actualizando..."
                                  : (announcement.is_visible ? "Pasar a borrador" : "Hacer visible")}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEditAnnouncement(announcement)}
                                className="inline-flex h-9 items-center justify-center rounded-xl border border-intra-border px-3 text-sm font-semibold text-intra-secondary transition hover:bg-intra-ligth"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteAnnouncement(announcement)}
                                className="inline-flex h-9 items-center justify-center rounded-xl border border-red-200 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                              >
                                Eliminar
                              </button>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              </>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
