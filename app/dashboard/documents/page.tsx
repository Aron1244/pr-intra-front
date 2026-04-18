"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { API_BASE, ApiClientError, apiFetch } from "@/lib/api-client";
import { clearAccessToken, getAccessToken } from "@/lib/auth-token";

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

        <section className="min-w-0 flex-1 px-4 py-6 lg:px-6 xl:px-8 2xl:px-10">
          <div className="mx-auto w-full max-w-360 space-y-6">
            <header className="rounded-3xl border border-intra-border bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold tracking-[0.18em] text-intra-accent uppercase">
                Documentos
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-intra-secondary">
                Biblioteca de archivos
              </h2>
              <p className="mt-2 max-w-2xl text-base text-intra-secondary/70">
                Consulta y descarga documentos disponibles para tu usuario y departamento.
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

            <section className="rounded-3xl border border-intra-border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-semibold text-intra-secondary">Archivos</h3>
                <span className="rounded-full bg-intra-ligth px-3 py-1 text-sm font-medium text-intra-secondary">
                  {filteredDocuments.length}
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

              <div className="mt-4 min-h-0 space-y-3 overflow-auto pr-1">
                {isLoadingDocuments ? (
                  <p className="text-base text-intra-secondary/70">Cargando documentos...</p>
                ) : null}

                {!isLoadingDocuments && sortedDocuments.length === 0 ? (
                  <p className="text-base text-intra-secondary/70">No hay documentos disponibles.</p>
                ) : null}

                {!isLoadingDocuments && sortedDocuments.length > 0 && filteredDocuments.length === 0 ? (
                  <p className="text-base text-intra-secondary/70">No se encontraron archivos con esa busqueda.</p>
                ) : null}

                {filteredDocuments.map((document) => (
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
                ))}
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
