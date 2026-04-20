"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { API_BASE, ApiClientError, apiFetch } from "@/lib/api-client";
import { clearAccessToken, getAccessToken } from "@/lib/auth-token";

type DocumentsViewMode = "all" | "chat" | "department" | "other";

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

type DocumentItem = {
  id: number;
  title: string;
  file_path: string;
  original_name?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  visibility: "private" | "public" | "department";
  created_at?: string;
  user?: {
    id: number;
    name: string;
  };
  folder?: {
    id: number;
    name: string;
    department_id: number;
  };
  origin?: {
    type: "chat" | "folder" | "general";
    label: string;
    conversation_id?: number;
    folder_id?: number;
  };
};

type DocumentsResponse = {
  data: DocumentItem[];
};

function formatFileSize(sizeInBytes?: number | null): string {
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
}

function getVisibilityLabel(visibility: DocumentItem["visibility"]): string {
  if (visibility === "public") {
    return "Publico";
  }

  if (visibility === "department") {
    return "Departamento";
  }

  return "Privado";
}

function getOriginLabel(document: DocumentItem): string {
  if (document.origin?.label) {
    return document.origin.label;
  }

  if (document.folder?.name) {
    return `Carpeta: ${document.folder.name}`;
  }

  return "General";
}

export default function DocumentsPage() {
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [isDownloadingDocumentId, setIsDownloadingDocumentId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPermissionError, setIsPermissionError] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<DocumentsViewMode>("all");
  const [user, setUser] = useState<MeResponse["data"] | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

  const setHandledError = useCallback((error: unknown, fallbackMessage: string) => {
    if (error instanceof ApiClientError) {
      if (error.status === 401) {
        setErrorMessage("No autenticado. Inicia sesion nuevamente.");
        setIsPermissionError(false);
        clearAccessToken();
        return;
      }

      if (error.status === 403) {
        setErrorMessage("No tienes permisos para realizar esta accion.");
        setIsPermissionError(true);
        return;
      }

      setErrorMessage(error.message);
      setIsPermissionError(false);
      return;
    }

    setErrorMessage(fallbackMessage);
    setIsPermissionError(false);
  }, []);

  useEffect(() => {
    let ignore = false;

    const loadPageData = async () => {
      setIsLoadingUser(true);
      setIsLoadingDocuments(true);
      setErrorMessage(null);
      setIsPermissionError(false);

      try {
        const [meResponse, documentsResponse] = await Promise.all([
          apiFetch<MeResponse>("/me", { method: "GET" }),
          apiFetch<DocumentsResponse>("/documents", { method: "GET" }),
        ]);

        if (!ignore) {
          setUser(meResponse.data);
          setDocuments(documentsResponse.data);
        }
      } catch (error) {
        if (!ignore) {
          setHandledError(error, "No se pudo cargar la seccion de documentos.");
        }
      } finally {
        if (!ignore) {
          setIsLoadingUser(false);
          setIsLoadingDocuments(false);
        }
      }
    };

    void loadPageData();

    return () => {
      ignore = true;
    };
  }, [setHandledError]);

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

  const roles = user?.roles?.map((role) => role.name.toLowerCase()) ?? [];
  const isAdmin = roles.includes("admin");
  const canManageAnnouncements = Boolean(user?.can_manage_announcements);

  const sortedDocuments = useMemo(
    () =>
      documents.slice().sort((left, right) => {
        const rightTime = new Date(right.created_at ?? 0).getTime();
        const leftTime = new Date(left.created_at ?? 0).getTime();
        return rightTime - leftTime;
      }),
    [documents],
  );

  const filteredDocuments = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    if (!normalizedSearch) {
      return sortedDocuments;
    }

    return sortedDocuments.filter((document) => {
      const searchableFields = [
        document.original_name,
        document.title,
        document.mime_type,
        getOriginLabel(document),
        document.folder?.name,
      ]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLowerCase());

      return searchableFields.some((field) => field.includes(normalizedSearch));
    });
  }, [searchTerm, sortedDocuments]);

  const getDocumentCategory = useCallback((document: DocumentItem): Exclude<DocumentsViewMode, "all"> => {
    if (document.origin?.type === "chat") {
      return "chat";
    }

    if (document.visibility === "department" || document.origin?.type === "folder" || document.folder?.department_id) {
      return "department";
    }

    return "other";
  }, []);

  const visibleDocuments = useMemo(() => {
    if (viewMode === "all") {
      return filteredDocuments;
    }

    return filteredDocuments.filter((document) => getDocumentCategory(document) === viewMode);
  }, [filteredDocuments, getDocumentCategory, viewMode]);

  const documentsByChat = useMemo(() => {
    const grouped = new Map<string, DocumentItem[]>();

    for (const document of visibleDocuments) {
      if (getDocumentCategory(document) !== "chat") {
        continue;
      }

      const key = getOriginLabel(document);
      grouped.set(key, [...(grouped.get(key) ?? []), document]);
    }

    return Array.from(grouped.entries());
  }, [getDocumentCategory, visibleDocuments]);

  const documentsByDepartment = useMemo(() => {
    const grouped = new Map<string, DocumentItem[]>();

    for (const document of visibleDocuments) {
      if (getDocumentCategory(document) !== "department") {
        continue;
      }

      const key = document.folder?.name ? `Carpeta: ${document.folder.name}` : getOriginLabel(document);
      grouped.set(key, [...(grouped.get(key) ?? []), document]);
    }

    return Array.from(grouped.entries());
  }, [getDocumentCategory, visibleDocuments]);

  const otherDocuments = useMemo(
    () => visibleDocuments.filter((document) => getDocumentCategory(document) === "other"),
    [getDocumentCategory, visibleDocuments],
  );

  const countsByCategory = useMemo(() => {
    const counts: Record<Exclude<DocumentsViewMode, "all">, number> = {
      chat: 0,
      department: 0,
      other: 0,
    };

    for (const document of filteredDocuments) {
      counts[getDocumentCategory(document)] += 1;
    }

    return counts;
  }, [filteredDocuments, getDocumentCategory]);

  const handleDownloadDocument = useCallback(async (document: DocumentItem) => {
    const token = getAccessToken();

    if (!token) {
      setErrorMessage("Sesion expirada. Inicia sesion nuevamente.");
      setIsPermissionError(false);
      return;
    }

    setErrorMessage(null);
    setIsPermissionError(false);
    setIsDownloadingDocumentId(document.id);

    try {
      const response = await fetch(`${API_BASE}/documents/${document.id}/download`, {
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
      const downloadLink = window.document.createElement("a");

      downloadLink.href = blobUrl;
      downloadLink.download = document.original_name ?? document.title;
      window.document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      window.URL.revokeObjectURL(blobUrl);
      setSuccessMessage("Documento descargado correctamente.");
    } catch {
      setErrorMessage("No se pudo descargar el documento.");
      setIsPermissionError(false);
    } finally {
      setIsDownloadingDocumentId(null);
    }
  }, []);

  const renderDocumentCard = (document: DocumentItem) => (
    <article
      key={document.id}
      className="rounded-2xl border border-intra-border p-4 text-left transition hover:bg-intra-ligth/40"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-2 inline-flex rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
            Origen: {getOriginLabel(document)}
          </p>
          <p className="font-semibold text-intra-secondary">
            {document.original_name ?? document.title}
          </p>
          <p className="text-sm text-intra-secondary/60">
            {document.mime_type ?? "Archivo"}
            {formatFileSize(document.size_bytes) ? ` • ${formatFileSize(document.size_bytes)}` : ""}
          </p>
          <p className="mt-1 text-xs text-intra-secondary/55">
            Visibilidad: {getVisibilityLabel(document.visibility)}
            {document.folder?.name ? ` • Carpeta: ${document.folder.name}` : ""}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleDownloadDocument(document)}
          disabled={isDownloadingDocumentId === document.id}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-intra-primary px-4 text-sm font-semibold text-white transition hover:bg-[#173d7d] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isDownloadingDocumentId === document.id ? "Descargando..." : "Descargar"}
        </button>
      </div>
    </article>
  );

  return (
    <div className="min-h-screen bg-intra-ligth">
      <main className="flex min-h-screen w-full">
        <DashboardSidebar
          user={user ? { name: user.name, email: user.email } : null}
          isAdmin={isAdmin}
          canManageAnnouncements={canManageAnnouncements}
          activeRoute="documents"
          statusMessage={isLoadingUser || isLoadingDocuments ? "Cargando documentos..." : errorMessage ? errorMessage : "Documentos sincronizados"}
        />

        <section className="min-w-0 flex flex-1 flex-col px-4 py-6 lg:px-6 xl:px-8 2xl:px-10">
          <div className="mx-auto flex min-h-0 w-full max-w-360 flex-1 flex-col space-y-6">

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

            <section className="flex min-h-0 flex-1 flex-col rounded-3xl border border-intra-border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-semibold text-intra-secondary">Archivos</h3>
                <span className="rounded-full bg-intra-ligth px-3 py-1 text-sm font-medium text-intra-secondary">
                  {visibleDocuments.length}
                </span>
              </div>

              <div className="mt-4">
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar por nombre, tipo u origen..."
                  className="w-full rounded-2xl border border-intra-border bg-white px-4 py-2.5 text-base text-intra-secondary outline-none transition focus:border-intra-primary focus:ring-4 focus:ring-intra-primary/15"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode("all")}
                  className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
                    viewMode === "all"
                      ? "bg-intra-primary text-white"
                      : "border border-intra-border bg-white text-intra-secondary hover:bg-intra-ligth"
                  }`}
                >
                  Todos ({filteredDocuments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("chat")}
                  className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
                    viewMode === "chat"
                      ? "bg-intra-primary text-white"
                      : "border border-intra-border bg-white text-intra-secondary hover:bg-intra-ligth"
                  }`}
                >
                  Chat ({countsByCategory.chat})
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("department")}
                  className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
                    viewMode === "department"
                      ? "bg-intra-primary text-white"
                      : "border border-intra-border bg-white text-intra-secondary hover:bg-intra-ligth"
                  }`}
                >
                  Departamento ({countsByCategory.department})
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("other")}
                  className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
                    viewMode === "other"
                      ? "bg-intra-primary text-white"
                      : "border border-intra-border bg-white text-intra-secondary hover:bg-intra-ligth"
                  }`}
                >
                  Otros ({countsByCategory.other})
                </button>
              </div>

              <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-auto pr-1">
                {isLoadingDocuments ? (
                  <p className="text-base text-intra-secondary/70">Cargando documentos...</p>
                ) : null}

                {!isLoadingDocuments && sortedDocuments.length === 0 ? (
                  <p className="text-base text-intra-secondary/70">No hay documentos disponibles.</p>
                ) : null}

                {!isLoadingDocuments && sortedDocuments.length > 0 && visibleDocuments.length === 0 ? (
                  <p className="text-base text-intra-secondary/70">No se encontraron archivos con esa busqueda.</p>
                ) : null}

                {documentsByChat.length > 0 ? (
                  <div className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-blue-900">Archivos de chat</h4>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-blue-800">
                        {countsByCategory.chat}
                      </span>
                    </div>
                    {documentsByChat.map(([groupLabel, groupDocuments]) => (
                      <div key={groupLabel} className="space-y-2">
                        <p className="text-xs font-semibold text-blue-900/80">{groupLabel}</p>
                        <div className="space-y-2">{groupDocuments.map(renderDocumentCard)}</div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {documentsByDepartment.length > 0 ? (
                  <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-emerald-900">Archivos de departamento</h4>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800">
                        {countsByCategory.department}
                      </span>
                    </div>
                    {documentsByDepartment.map(([groupLabel, groupDocuments]) => (
                      <div key={groupLabel} className="space-y-2">
                        <p className="text-xs font-semibold text-emerald-900/80">{groupLabel}</p>
                        <div className="space-y-2">{groupDocuments.map(renderDocumentCard)}</div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {otherDocuments.length > 0 ? (
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-slate-800">Otros archivos</h4>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {countsByCategory.other}
                      </span>
                    </div>
                    <div className="space-y-2">{otherDocuments.map(renderDocumentCard)}</div>
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
