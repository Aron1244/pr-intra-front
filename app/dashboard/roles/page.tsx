"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

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

type Role = {
  id: number;
  name: string;
  can_post_announcements: boolean;
  created_at: string;
  updated_at: string;
};

type RoleFormState = {
  name: string;
  can_post_announcements: boolean;
};

const INITIAL_FORM_STATE: RoleFormState = {
  name: "",
  can_post_announcements: false,
};

export default function RolesPage() {
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [isDeletingRoleId, setIsDeletingRoleId] = useState<number | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
  const [canAccessRoles, setCanAccessRoles] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPermissionError, setIsPermissionError] = useState(false);
  const [user, setUser] = useState<MeResponse["data"] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [formState, setFormState] = useState<RoleFormState>(INITIAL_FORM_STATE);
  const formSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingRoleId && formSectionRef.current) {
      formSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editingRoleId]);

  const loadRoles = useCallback(async () => {
    const rolesResponse = await apiFetch<{ data: Role[] }>("/roles", { method: "GET" });
    setRoles(Array.isArray(rolesResponse.data) ? rolesResponse.data : []);
  }, []);

  useEffect(() => {
    let ignore = false;

    const loadPageData = async () => {
      setIsLoadingUser(true);
      setIsLoadingRoles(true);
      setErrorMessage(null);
      setIsPermissionError(false);

      try {
        const meResponse = await apiFetch<MeResponse>("/me", { method: "GET" });

        if (ignore) {
          return;
        }

        const allowed = Boolean(meResponse.data.roles?.some((role) => role.name.toLowerCase() === "admin"));
        setUser(meResponse.data);
        setCanAccessRoles(allowed);

        if (!allowed) {
          setRoles([]);
          setErrorMessage("Solo administradores pueden gestionar roles.");
          setIsPermissionError(true);
          return;
        }

        await loadRoles();
      } catch (error) {
        if (!ignore) {
          if (error instanceof ApiClientError && error.status === 401) {
            setErrorMessage("No autenticado. Inicia sesion nuevamente.");
            setIsPermissionError(false);
            clearAccessToken();
          } else if (error instanceof ApiClientError && error.status === 403) {
            setErrorMessage("No tienes permisos para gestionar roles.");
            setIsPermissionError(true);
          } else if (error instanceof ApiClientError) {
            setErrorMessage(error.message);
            setIsPermissionError(false);
          } else {
            setErrorMessage("No se pudo cargar los roles.");
            setIsPermissionError(false);
          }
        }
      } finally {
        if (!ignore) {
          setIsLoadingUser(false);
          setIsLoadingRoles(false);
        }
      }
    };

    void loadPageData();

    return () => {
      ignore = true;
    };
  }, [loadRoles]);

  const roles_sorted = roles.slice().sort((a, b) => a.name.localeCompare(b.name));

  const resetForm = () => {
    setFormState(INITIAL_FORM_STATE);
    setEditingRoleId(null);
  };

  const handleSubmitRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canAccessRoles) {
      return;
    }

    const normalizedName = formState.name.trim();

    if (!normalizedName) {
      setErrorMessage("El nombre del rol es obligatorio.");
      setIsPermissionError(false);
      return;
    }

    setIsSavingRole(true);
    setErrorMessage(null);
    setIsPermissionError(false);

    try {
      if (editingRoleId) {
        await apiFetch<Role>(`/roles/${editingRoleId}`, {
          method: "PATCH",
          body: {
            name: normalizedName,
            can_post_announcements: formState.can_post_announcements,
          },
        });

        setSuccessMessage("Rol actualizado correctamente.");
      } else {
        await apiFetch<Role>("/roles", {
          method: "POST",
          body: {
            name: normalizedName,
            can_post_announcements: formState.can_post_announcements,
          },
        });

        setSuccessMessage("Rol creado correctamente.");
      }

      resetForm();
      await loadRoles();
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 403) {
        setErrorMessage("No tienes permisos para guardar roles.");
        setIsPermissionError(true);
      } else if (error instanceof ApiClientError) {
        setErrorMessage(error.message);
        setIsPermissionError(false);
      } else {
        setErrorMessage("No se pudo guardar el rol.");
        setIsPermissionError(false);
      }
    } finally {
      setIsSavingRole(false);
    }
  };

  const handleEditRole = (role: Role) => {
    setFormState({
      name: role.name,
      can_post_announcements: role.can_post_announcements,
    });
    setEditingRoleId(role.id);
  };

  const handleDeleteRole = async (role: Role) => {
    const confirmed = window.confirm(`Eliminar el rol \"${role.name}\"?`);
    if (!confirmed) {
      return;
    }

    setErrorMessage(null);
    setIsPermissionError(false);
    setIsDeletingRoleId(role.id);

    try {
      await apiFetch(`/roles/${role.id}`, {
        method: "DELETE",
      });

      setSuccessMessage("Rol eliminado correctamente.");
      if (editingRoleId === role.id) {
        resetForm();
      }
      await loadRoles();
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 403) {
        setErrorMessage("No tienes permisos para eliminar este rol.");
        setIsPermissionError(true);
      } else if (error instanceof ApiClientError) {
        setErrorMessage(error.message);
        setIsPermissionError(false);
      } else {
        setErrorMessage("No se pudo eliminar el rol.");
        setIsPermissionError(false);
      }
    } finally {
      setIsDeletingRoleId(null);
    }
  };

  return (
    <div className="min-h-screen bg-intra-ligth">
      <main className="flex min-h-screen w-full">
        <DashboardSidebar
          user={user ? { name: user.name, email: user.email } : null}
          isAdmin={Boolean(user?.roles?.some((role) => role.name.toLowerCase() === "admin"))}
          canManageAnnouncements={Boolean(user?.can_manage_announcements)}
          activeRoute="roles"
          statusMessage={isLoadingUser || isLoadingRoles ? "Cargando roles..." : errorMessage ? errorMessage : "Roles sincronizados"}
        />

        <section className="min-w-0 flex-1 px-4 py-6 lg:px-6 xl:px-8 2xl:px-10">
          <div className="mx-auto w-full max-w-4xl space-y-6">
            <header className="rounded-3xl border border-intra-border bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold tracking-[0.18em] text-intra-accent uppercase">
                Administración
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-intra-secondary">
                Gestión de roles
              </h2>
              <p className="mt-2 max-w-3xl text-base text-intra-secondary/70">
                Crea, edita y elimina roles para definir permisos en el sistema.
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

            {!isLoadingRoles && !canAccessRoles ? (
              <section className="rounded-3xl border border-intra-border bg-white p-5 shadow-sm">
                <p className="text-base text-intra-secondary/70">Solo usuarios autorizados pueden gestionar roles.</p>
              </section>
            ) : null}

            {canAccessRoles ? (
              <>
                <section className="rounded-3xl border border-intra-border bg-white p-5 shadow-sm" ref={formSectionRef}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-semibold text-intra-secondary">
                      {editingRoleId ? "Editar rol" : "Nuevo rol"}
                    </h3>
                  </div>

                  <form onSubmit={handleSubmitRole} className="mt-4 space-y-3">
                    <div>
                      <label htmlFor="role-name" className="text-sm font-medium text-intra-secondary">
                        Nombre del rol
                      </label>
                      <input
                        id="role-name"
                        type="text"
                        value={formState.name}
                        onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Ej. editor, moderador, departamento_head"
                        className="mt-1 w-full rounded-2xl border border-intra-border bg-white px-4 py-2.5 text-base text-intra-secondary outline-none transition focus:border-intra-primary focus:ring-4 focus:ring-intra-primary/15"
                      />
                    </div>

                    <label className="inline-flex items-center gap-2 rounded-xl border border-intra-border bg-intra-ligth/40 px-3 py-2 text-sm text-intra-secondary">
                      <input
                        type="checkbox"
                        checked={formState.can_post_announcements}
                        onChange={(event) => setFormState((current) => ({ ...current, can_post_announcements: event.target.checked }))}
                        className="h-4 w-4 rounded border-intra-border text-intra-primary focus:ring-intra-primary"
                      />
                      Puede publicar anuncios
                    </label>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {editingRoleId ? (
                        <button
                          type="button"
                          onClick={resetForm}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-intra-border px-4 text-sm font-semibold text-intra-secondary transition hover:bg-intra-ligth"
                        >
                          Cancelar
                        </button>
                      ) : null}
                      <button
                        type="submit"
                        disabled={isSavingRole}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-intra-primary px-4 text-sm font-semibold text-white transition hover:bg-[#173d7d] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSavingRole ? "Guardando..." : editingRoleId ? "Actualizar" : "Crear rol"}
                      </button>
                    </div>
                  </form>
                </section>

                <section className="rounded-3xl border border-intra-border bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-semibold text-intra-secondary">Roles existentes</h3>
                    <span className="rounded-full bg-intra-ligth px-3 py-1 text-sm font-medium text-intra-secondary">
                      {roles_sorted.length}
                    </span>
                  </div>

                  <div className="mt-4 min-h-0 space-y-2 overflow-auto">
                    {isLoadingRoles ? (
                      <p className="text-base text-intra-secondary/70">Cargando roles...</p>
                    ) : null}

                    {!isLoadingRoles && roles_sorted.length === 0 ? (
                      <p className="text-base text-intra-secondary/70">Aun no hay roles creados.</p>
                    ) : null}

                    {roles_sorted.map((role) => (
                      <article key={role.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-900">{role.name}</p>
                            <p className="mt-1 text-xs text-slate-600">
                              {role.can_post_announcements ? "✓ Puede publicar anuncios" : "✗ No puede publicar anuncios"}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditRole(role)}
                              className="inline-flex h-9 items-center justify-center rounded-xl border border-intra-border px-3 text-sm font-semibold text-intra-secondary transition hover:bg-intra-ligth"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteRole(role)}
                              disabled={isDeletingRoleId === role.id}
                              className="inline-flex h-9 items-center justify-center rounded-xl border border-red-200 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isDeletingRoleId === role.id ? "Eliminando..." : "Eliminar"}
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
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
