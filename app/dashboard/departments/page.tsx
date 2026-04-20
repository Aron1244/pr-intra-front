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
    roles?: Array<{
      id: number;
      name: string;
    }>;
  };
};

type Department = {
  id: number;
  name: string;
  description?: string | null;
};

type Role = {
  id: number;
  name: string;
  department_id: number;
  can_post_announcements: boolean;
  created_at: string;
  updated_at: string;
};

type DepartmentFormState = {
  name: string;
  description: string;
};

type RoleFormState = {
  name: string;
  can_post_announcements: boolean;
};

const INITIAL_DEPT_FORM_STATE: DepartmentFormState = {
  name: "",
  description: "",
};

const INITIAL_ROLE_FORM_STATE: RoleFormState = {
  name: "",
  can_post_announcements: false,
};

export default function DepartmentsPage() {
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(true);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);
  const [isSavingDepartment, setIsSavingDepartment] = useState(false);
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [isDeletingDepartmentId, setIsDeletingDepartmentId] = useState<number | null>(null);
  const [isDeletingRoleId, setIsDeletingRoleId] = useState<number | null>(null);
  const [editingDepartmentId, setEditingDepartmentId] = useState<number | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [canAccessDepartments, setCanAccessDepartments] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPermissionError, setIsPermissionError] = useState(false);
  const [user, setUser] = useState<MeResponse["data"] | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [deptFormState, setDeptFormState] = useState<DepartmentFormState>(INITIAL_DEPT_FORM_STATE);
  const [roleFormState, setRoleFormState] = useState<RoleFormState>(INITIAL_ROLE_FORM_STATE);
  const deptFormSectionRef = useRef<HTMLDivElement>(null);
  const roleFormSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingDepartmentId && deptFormSectionRef.current) {
      deptFormSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editingDepartmentId]);

  useEffect(() => {
    if (editingRoleId && roleFormSectionRef.current) {
      roleFormSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editingRoleId]);

  const loadDepartments = useCallback(async () => {
    try {
      const depsResponse = await apiFetch<{ data: Department[] }>("/departments", { method: "GET" });
      setDepartments(Array.isArray(depsResponse.data) ? depsResponse.data : []);
      setErrorMessage(null);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("No se pudo cargar los departamentos.");
      }
    } finally {
      setIsLoadingDepartments(false);
    }
  }, []);

  const loadRolesByDepartment = useCallback(async (departmentId: number) => {
    if (!departmentId) return;
    
    setIsLoadingRoles(true);
    try {
      const rolesResponse = await apiFetch<{ data: Role[] }>(`/departments/${departmentId}/roles`, {
        method: "GET",
      });
      setRoles(Array.isArray(rolesResponse.data) ? rolesResponse.data : []);
      setErrorMessage(null);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("No se pudo cargar los roles del departamento.");
      }
    } finally {
      setIsLoadingRoles(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    const loadPageData = async () => {
      setIsLoadingUser(true);
      setIsLoadingDepartments(true);
      setErrorMessage(null);
      setIsPermissionError(false);

      try {
        const meResponse = await apiFetch<MeResponse>("/me", { method: "GET" });

        if (ignore) {
          return;
        }

        const allowed = Boolean(meResponse.data.roles?.some((role) => role.name.toLowerCase() === "admin"));
        setUser(meResponse.data);
        setCanAccessDepartments(allowed);

        if (!allowed) {
          setDepartments([]);
          setErrorMessage("Solo administradores pueden gestionar departamentos y roles.");
          setIsPermissionError(true);
          return;
        }

        await loadDepartments();
      } catch (error) {
        if (!ignore) {
          if (error instanceof ApiClientError && error.status === 401) {
            setErrorMessage("No autenticado. Inicia sesion nuevamente.");
            setIsPermissionError(false);
            clearAccessToken();
          } else if (error instanceof ApiClientError && error.status === 403) {
            setErrorMessage("No tienes permisos para gestionar departamentos.");
            setIsPermissionError(true);
          } else if (error instanceof ApiClientError) {
            setErrorMessage(error.message);
            setIsPermissionError(false);
          } else {
            setErrorMessage("No se pudo cargar los departamentos.");
            setIsPermissionError(false);
          }
        }
      } finally {
        if (!ignore) {
          setIsLoadingUser(false);
        }
      }
    };

    void loadPageData();

    return () => {
      ignore = true;
    };
  }, [loadDepartments]);

  const departments_sorted = departments.slice().sort((a, b) => a.name.localeCompare(b.name));
  const selectedDepartment = departments.find((d) => d.id === selectedDepartmentId);
  const roles_sorted = roles.slice().sort((a, b) => a.name.localeCompare(b.name));
  const selectedRole = roles_sorted.find((role) => role.id === selectedRoleId) ?? null;

  const resetDeptForm = () => {
    setDeptFormState(INITIAL_DEPT_FORM_STATE);
    setEditingDepartmentId(null);
  };

  const resetRoleForm = () => {
    setRoleFormState(INITIAL_ROLE_FORM_STATE);
    setEditingRoleId(null);
  };

  const populateRoleForm = (role: Role) => {
    setRoleFormState({
      name: role.name,
      can_post_announcements: role.can_post_announcements,
    });
    setEditingRoleId(role.id);
    setSelectedRoleId(role.id);
  };

  const handleSubmitDepartment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canAccessDepartments) {
      return;
    }

    const normalizedName = deptFormState.name.trim();
    const normalizedDescription = deptFormState.description.trim();

    if (!normalizedName) {
      setErrorMessage("El nombre del departamento es obligatorio.");
      setIsPermissionError(false);
      return;
    }

    setIsSavingDepartment(true);
    setErrorMessage(null);
    setIsPermissionError(false);

    try {
      const payload = {
        name: normalizedName,
        description: normalizedDescription || null,
      };

      if (editingDepartmentId) {
        await apiFetch<Department>(`/departments/${editingDepartmentId}`, {
          method: "PATCH",
          body: payload,
        });

        setSuccessMessage("Departamento actualizado correctamente.");
      } else {
        await apiFetch<Department>("/departments", {
          method: "POST",
          body: payload,
        });

        setSuccessMessage("Departamento creado correctamente.");
      }

      resetDeptForm();
      await loadDepartments();
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 403) {
        setErrorMessage("No tienes permisos para guardar departamentos.");
        setIsPermissionError(true);
      } else if (error instanceof ApiClientError) {
        setErrorMessage(error.message);
        setIsPermissionError(false);
      } else {
        setErrorMessage("No se pudo guardar el departamento.");
        setIsPermissionError(false);
      }
    } finally {
      setIsSavingDepartment(false);
    }
  };

  const handleSubmitRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canAccessDepartments || !selectedDepartmentId) {
      return;
    }

    const normalizedName = roleFormState.name.trim();

    if (!normalizedName) {
      setErrorMessage("El nombre del rol es obligatorio.");
      setIsPermissionError(false);
      return;
    }

    setIsSavingRole(true);
    setErrorMessage(null);
    setIsPermissionError(false);

    try {
      const payload = {
        name: normalizedName,
        department_id: selectedDepartmentId,
        can_post_announcements: roleFormState.can_post_announcements,
      };

      if (editingRoleId) {
        await apiFetch<Role>(`/roles/${editingRoleId}`, {
          method: "PATCH",
          body: payload,
        });

        setSuccessMessage("Rol actualizado correctamente.");
      } else {
        await apiFetch<Role>("/roles", {
          method: "POST",
          body: payload,
        });

        setSuccessMessage("Rol creado correctamente.");
      }

      resetRoleForm();
      setSelectedRoleId(null);
      await loadRolesByDepartment(selectedDepartmentId);
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

  const handleEditDepartment = (dept: Department) => {
    setDeptFormState({
      name: dept.name,
      description: dept.description ?? "",
    });
    setEditingDepartmentId(dept.id);
  };

  const handleEditRole = (role: Role) => {
    populateRoleForm(role);
  };

  const handleDeleteDepartment = async (dept: Department) => {
    const confirmed = window.confirm(`Eliminar departamento "${dept.name}" y todos sus roles?`);
    if (!confirmed) {
      return;
    }

    setErrorMessage(null);
    setIsPermissionError(false);
    setIsDeletingDepartmentId(dept.id);

    try {
      await apiFetch(`/departments/${dept.id}`, {
        method: "DELETE",
      });

      setSuccessMessage("Departamento eliminado correctamente.");
      if (selectedDepartmentId === dept.id) {
        setSelectedDepartmentId(null);
        setRoles([]);
      }
      await loadDepartments();
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 403) {
        setErrorMessage("No tienes permisos para eliminar departamentos.");
        setIsPermissionError(true);
      } else if (error instanceof ApiClientError) {
        setErrorMessage(error.message);
        setIsPermissionError(false);
      } else {
        setErrorMessage("No se pudo eliminar el departamento.");
        setIsPermissionError(false);
      }
    } finally {
      setIsDeletingDepartmentId(null);
    }
  };

  const handleDeleteRole = async (role: Role) => {
    const confirmed = window.confirm(`Eliminar rol "${role.name}"?`);
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
      if (selectedRoleId === role.id) {
        setSelectedRoleId(null);
        resetRoleForm();
      }
      await loadRolesByDepartment(selectedDepartmentId!);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 403) {
        setErrorMessage("No tienes permisos para eliminar roles.");
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

  const handleSelectDepartment = (deptId: number) => {
    setSelectedDepartmentId(deptId);
    setSelectedRoleId(null);
    void loadRolesByDepartment(deptId);
    resetRoleForm();
  };

  const handleSelectRole = (roleId: number) => {
    setSelectedRoleId(roleId);
  };

  const handleLoadSelectedRoleInForm = () => {
    if (!selectedRole) {
      return;
    }

    populateRoleForm(selectedRole);
  };

  const handleStartCreateRole = () => {
    setSelectedRoleId(null);
    resetRoleForm();
  };

  return (
    <div className="min-h-screen bg-intra-ligth">
      <main className="flex min-h-screen w-full">
        <DashboardSidebar
          user={user ? { name: user.name, email: user.email } : null}
          isAdmin={Boolean(user?.roles?.some((role) => role.name.toLowerCase() === "admin"))}
          activeRoute="departments"
          statusMessage={
            isLoadingDepartments
              ? "Cargando departamentos..."
              : errorMessage
                ? errorMessage
                : "Departamentos y roles sincronizados"
          }
        />

        <section className="min-w-0 flex-1 px-4 py-6 lg:px-6 xl:px-8 2xl:px-10">
          <div className="mx-auto w-full max-w-6xl space-y-6">
            <header className="rounded-3xl border border-intra-border bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold tracking-[0.18em] text-intra-accent uppercase">
                Administración
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-intra-secondary">
                Departamentos y Roles
              </h2>
              <p className="mt-2 max-w-3xl text-base text-intra-secondary/70">
                Gestiona departamentos y crea roles específicos para cada uno.
              </p>
            </header>

            {errorMessage ? (
              <div
                className={`rounded-3xl px-4 py-3 text-base shadow-sm ${isPermissionError ? "border border-amber-200 bg-amber-50 text-amber-800" : "border border-red-200 bg-red-50 text-red-700"}`}
              >
                <p>{errorMessage}</p>
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-3xl border border-green-200 bg-green-50 px-4 py-3 text-base text-green-700 shadow-sm">
                <p>{successMessage}</p>
              </div>
            ) : null}

            {canAccessDepartments ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Departamentos - Left Panel */}
                <div className="lg:col-span-1">
                  <div className="space-y-4">
                    <div
                      ref={deptFormSectionRef}
                      className="space-y-4 rounded-3xl border border-intra-border bg-white p-6 shadow-sm"
                    >
                      <h3 className="text-lg font-semibold text-intra-secondary">
                        {editingDepartmentId ? "Editar" : "Nuevo"} Departamento
                      </h3>

                      <form onSubmit={handleSubmitDepartment} className="space-y-3">
                        <div>
                          <label htmlFor="dept-name" className="block text-sm font-semibold text-intra-secondary">
                            Nombre <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="dept-name"
                            type="text"
                            value={deptFormState.name}
                            onChange={(e) => setDeptFormState({ ...deptFormState, name: e.target.value })}
                            placeholder="Ej: Recursos Humanos"
                            className="mt-1 w-full rounded-lg border border-intra-border bg-white px-3 py-2 text-sm text-intra-secondary placeholder-intra-secondary/50 transition focus:border-intra-accent focus:outline-none focus:ring-2 focus:ring-intra-accent/20"
                          />
                        </div>

                        <div>
                          <label htmlFor="dept-description" className="block text-sm font-semibold text-intra-secondary">
                            Descripción
                          </label>
                          <textarea
                            id="dept-description"
                            value={deptFormState.description}
                            onChange={(e) => setDeptFormState({ ...deptFormState, description: e.target.value })}
                            placeholder="Descripción opcional"
                            rows={2}
                            className="mt-1 w-full rounded-lg border border-intra-border bg-white px-3 py-2 text-sm text-intra-secondary placeholder-intra-secondary/50 transition focus:border-intra-accent focus:outline-none focus:ring-2 focus:ring-intra-accent/20"
                          />
                        </div>

                        <div className="flex gap-2 pt-2">
                          <button
                            type="submit"
                            disabled={isSavingDepartment}
                            className="flex-1 rounded-xl bg-intra-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-intra-accent/90 disabled:opacity-50"
                          >
                            {isSavingDepartment ? "Guardando..." : editingDepartmentId ? "Actualizar" : "Crear"}
                          </button>

                          {editingDepartmentId && (
                            <button
                              type="button"
                              onClick={resetDeptForm}
                              className="rounded-xl border border-intra-border px-3 py-2 text-sm font-semibold text-intra-secondary transition hover:bg-intra-ligth"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </form>
                    </div>

                    {isLoadingDepartments ? (
                      <div className="rounded-3xl border border-intra-border bg-white p-4 text-center">
                        <p className="text-sm text-intra-secondary/70">Cargando...</p>
                      </div>
                    ) : departments_sorted.length === 0 ? (
                      <div className="rounded-3xl border border-intra-border bg-white p-4 text-center">
                        <p className="text-sm text-intra-secondary/70">No hay departamentos</p>
                      </div>
                    ) : (
                      <div className="space-y-2 rounded-3xl border border-intra-border bg-white p-4 shadow-sm">
                        {departments_sorted.map((dept) => (
                          <div
                            key={dept.id}
                            className={`rounded-lg border p-3 transition cursor-pointer ${
                              selectedDepartmentId === dept.id
                                ? "border-intra-accent bg-intra-accent/10"
                                : "border-transparent bg-intra-ligth hover:bg-intra-ligth/80"
                            }`}
                          >
                            <div onClick={() => handleSelectDepartment(dept.id)}>
                              <p className="font-semibold text-intra-secondary">{dept.name}</p>
                              {dept.description && (
                                <p className="text-xs text-intra-secondary/70">{dept.description}</p>
                              )}
                            </div>

                            <div className="mt-2 flex gap-1">
                              <button
                                onClick={() => handleEditDepartment(dept)}
                                className="flex-1 rounded-lg bg-blue-500 px-2 py-1 text-xs font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50"
                                disabled={isSavingDepartment}
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => handleDeleteDepartment(dept)}
                                disabled={isDeletingDepartmentId === dept.id}
                                className="flex-1 rounded-lg bg-red-500 px-2 py-1 text-xs font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
                              >
                                {isDeletingDepartmentId === dept.id ? "..." : "Eliminar"}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Roles - Right Panel */}
                <div className="lg:col-span-2">
                  <div className="space-y-4">
                    {selectedDepartmentId ? (
                      <>
                        <div
                          ref={roleFormSectionRef}
                          className="space-y-4 rounded-3xl border border-intra-border bg-white p-6 shadow-sm"
                        >
                          <div className="space-y-3 rounded-2xl border border-intra-border bg-intra-ligth/40 p-4">
                            <p className="text-sm font-semibold text-intra-secondary">Seleccion de rol</p>
                            <div className="flex flex-col gap-3 sm:flex-row">
                              <select
                                value={selectedRoleId ?? ""}
                                onChange={(e) => handleSelectRole(Number(e.target.value))}
                                className="w-full rounded-lg border border-intra-border bg-white px-3 py-2 text-sm text-intra-secondary focus:border-intra-accent focus:outline-none focus:ring-2 focus:ring-intra-accent/20"
                              >
                                <option value="">Selecciona un rol de {selectedDepartment?.name}</option>
                                {roles_sorted.map((role) => (
                                  <option key={role.id} value={role.id}>
                                    {role.name} {role.can_post_announcements ? "- publica anuncios" : "- sin anuncios"}
                                  </option>
                                ))}
                              </select>

                              <button
                                type="button"
                                onClick={handleLoadSelectedRoleInForm}
                                disabled={!selectedRole}
                                className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Cargar para editar
                              </button>

                              <button
                                type="button"
                                onClick={handleStartCreateRole}
                                className="rounded-xl border border-intra-border px-4 py-2 text-sm font-semibold text-intra-secondary transition hover:bg-white"
                              >
                                Nuevo rol
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  if (selectedRole) {
                                    void handleDeleteRole(selectedRole);
                                  }
                                }}
                                disabled={!selectedRole || isDeletingRoleId === selectedRole.id}
                                className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {selectedRole && isDeletingRoleId === selectedRole.id ? "Eliminando..." : "Eliminar seleccionado"}
                              </button>
                            </div>
                            <p className="text-xs text-intra-secondary/70">
                              Primero selecciona un rol, luego carga para editar o elimina directamente.
                            </p>
                          </div>

                          <h3 className="text-lg font-semibold text-intra-secondary">
                            {editingRoleId ? "Editar" : "Nuevo"} Rol en {selectedDepartment?.name}
                          </h3>

                          <form onSubmit={handleSubmitRole} className="space-y-3">
                            <div>
                              <label htmlFor="role-name" className="block text-sm font-semibold text-intra-secondary">
                                Nombre <span className="text-red-500">*</span>
                              </label>
                              <input
                                id="role-name"
                                type="text"
                                value={roleFormState.name}
                                onChange={(e) => setRoleFormState({ ...roleFormState, name: e.target.value })}
                                placeholder="Ej: Jefe de Área"
                                className="mt-1 w-full rounded-lg border border-intra-border bg-white px-3 py-2 text-sm text-intra-secondary placeholder-intra-secondary/50 transition focus:border-intra-accent focus:outline-none focus:ring-2 focus:ring-intra-accent/20"
                              />
                            </div>

                            <div className="flex items-center gap-2">
                              <input
                                id="role-announcements"
                                type="checkbox"
                                checked={roleFormState.can_post_announcements}
                                onChange={(e) =>
                                  setRoleFormState({
                                    ...roleFormState,
                                    can_post_announcements: e.target.checked,
                                  })
                                }
                                className="rounded"
                              />
                              <label htmlFor="role-announcements" className="text-sm font-semibold text-intra-secondary">
                                Puede publicar anuncios
                              </label>
                            </div>

                            <div className="flex gap-2 pt-2">
                              <button
                                type="submit"
                                disabled={isSavingRole}
                                className="flex-1 rounded-xl bg-intra-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-intra-accent/90 disabled:opacity-50"
                              >
                                {isSavingRole ? "Guardando..." : editingRoleId ? "Actualizar" : "Crear"}
                              </button>

                              {editingRoleId && (
                                <button
                                  type="button"
                                  onClick={resetRoleForm}
                                  className="rounded-xl border border-intra-border px-3 py-2 text-sm font-semibold text-intra-secondary transition hover:bg-intra-ligth"
                                >
                                  Cancelar
                                </button>
                              )}
                            </div>
                          </form>
                        </div>

                        {isLoadingRoles ? (
                          <div className="rounded-3xl border border-intra-border bg-white p-8 text-center shadow-sm">
                            <p className="text-intra-secondary/70">Cargando roles...</p>
                          </div>
                        ) : roles_sorted.length === 0 ? (
                          <div className="rounded-3xl border border-intra-border bg-white p-8 text-center shadow-sm">
                            <p className="text-intra-secondary/70">No hay roles. Crea uno arriba.</p>
                          </div>
                        ) : (
                          <div className="overflow-hidden rounded-3xl border border-intra-border bg-white shadow-sm">
                            <table className="w-full border-collapse">
                              <thead>
                                <tr className="border-b border-intra-border bg-intra-ligth">
                                  <th className="px-6 py-4 text-left text-sm font-semibold text-intra-secondary">
                                    Nombre
                                  </th>
                                  <th className="px-6 py-4 text-center text-sm font-semibold text-intra-secondary">
                                    Publicar
                                  </th>
                                  <th className="px-6 py-4 text-center text-sm font-semibold text-intra-secondary">
                                    Seleccion
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-intra-border">
                                {roles_sorted.map((role) => (
                                  <tr
                                    key={role.id}
                                    className={`cursor-pointer transition ${selectedRoleId === role.id ? "bg-blue-50" : "hover:bg-intra-ligth/50"}`}
                                    onClick={() => handleSelectRole(role.id)}
                                  >
                                    <td className="px-6 py-4 text-sm font-medium text-intra-secondary">{role.name}</td>
                                    <td className="px-6 py-4 text-center">
                                      <span
                                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                                          role.can_post_announcements
                                            ? "bg-green-100 text-green-800"
                                            : "bg-gray-100 text-gray-800"
                                        }`}
                                      >
                                        {role.can_post_announcements ? "Sí" : "No"}
                                      </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleEditRole(role);
                                        }}
                                        className="rounded-lg border border-intra-border px-3 py-1.5 text-xs font-semibold text-intra-secondary transition hover:bg-white"
                                      >
                                        Cargar
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <div className="rounded-3xl border border-intra-border bg-white p-6 shadow-sm">
                          <p className="text-sm text-intra-secondary/70">
                            <span className="font-semibold text-intra-secondary">{roles_sorted.length}</span> rol
                            {roles_sorted.length !== 1 ? "es" : ""}
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-3xl border border-intra-border bg-white p-8 text-center shadow-sm">
                        <p className="text-intra-secondary/70">Selecciona un departamento para gestionar sus roles.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : isLoadingUser ? (
              <div className="rounded-3xl border border-intra-border bg-white p-8 text-center shadow-sm">
                <p className="text-intra-secondary/70">Cargando...</p>
              </div>
            ) : (
              <div className="rounded-3xl border border-intra-border bg-white p-8 text-center shadow-sm">
                <p className="text-intra-secondary/70">{errorMessage || "No tienes acceso a esta sección."}</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
