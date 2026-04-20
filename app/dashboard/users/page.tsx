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

type Department = {
  id: number;
  name: string;
};

type User = {
  id: number;
  name: string;
  email: string;
  department_id: number | null;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

type UserFormState = {
  name: string;
  email: string;
  password: string;
  department_id: string;
};

const INITIAL_FORM_STATE: UserFormState = {
  name: "",
  email: "",
  password: "",
  department_id: "",
};

export default function UsersPage() {
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [isDeletingUserId, setIsDeletingUserId] = useState<number | null>(null);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [canAccessUsers, setCanAccessUsers] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPermissionError, setIsPermissionError] = useState(false);
  const [user, setUser] = useState<MeResponse["data"] | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [formState, setFormState] = useState<UserFormState>(INITIAL_FORM_STATE);
  const formSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editingUserId && formSectionRef.current) {
      formSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editingUserId]);

  const loadUsers = useCallback(async () => {
    const usersResponse = await apiFetch<{ data: User[] }>("/users", { method: "GET" });
    setUsers(Array.isArray(usersResponse.data) ? usersResponse.data : []);
  }, []);

  const loadDepartments = useCallback(async () => {
    const depsResponse = await apiFetch<{ data: Department[] }>("/departments", { method: "GET" });
    setDepartments(Array.isArray(depsResponse.data) ? depsResponse.data : []);
  }, []);

  useEffect(() => {
    let ignore = false;

    const loadPageData = async () => {
      setIsLoadingUser(true);
      setIsLoadingUsers(true);
      setErrorMessage(null);
      setIsPermissionError(false);

      try {
        const meResponse = await apiFetch<MeResponse>("/me", { method: "GET" });

        if (ignore) {
          return;
        }

        const allowed = Boolean(meResponse.data.roles?.some((role) => role.name.toLowerCase() === "admin"));
        setUser(meResponse.data);
        setCanAccessUsers(allowed);

        if (!allowed) {
          setUsers([]);
          setErrorMessage("Solo administradores pueden gestionar usuarios.");
          setIsPermissionError(true);
          return;
        }

        await Promise.all([loadUsers(), loadDepartments()]);
      } catch (error) {
        if (!ignore) {
          if (error instanceof ApiClientError && error.status === 401) {
            setErrorMessage("No autenticado. Inicia sesion nuevamente.");
            setIsPermissionError(false);
            clearAccessToken();
          } else if (error instanceof ApiClientError && error.status === 403) {
            setErrorMessage("No tienes permisos para gestionar usuarios.");
            setIsPermissionError(true);
          } else if (error instanceof ApiClientError) {
            setErrorMessage(error.message);
            setIsPermissionError(false);
          } else {
            setErrorMessage("No se pudo cargar los usuarios.");
            setIsPermissionError(false);
          }
        }
      } finally {
        if (!ignore) {
          setIsLoadingUser(false);
          setIsLoadingUsers(false);
        }
      }
    };

    void loadPageData();

    return () => {
      ignore = true;
    };
  }, [loadUsers, loadDepartments]);

  const users_sorted = users.slice().sort((a, b) => a.name.localeCompare(b.name));
  const departments_sorted = departments.slice().sort((a, b) => a.name.localeCompare(b.name));

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const filteredUsers = users_sorted.filter((u) => {
    const matchesDepartment =
      selectedDepartmentFilter === "all"
        ? true
        : selectedDepartmentFilter === "unassigned"
          ? u.department_id === null
          : u.department_id === Number(selectedDepartmentFilter);

    const matchesSearch =
      normalizedSearchTerm.length === 0 ||
      u.name.toLowerCase().includes(normalizedSearchTerm) ||
      u.email.toLowerCase().includes(normalizedSearchTerm);

    return matchesDepartment && matchesSearch;
  });

  const usersWithoutDepartmentCount = users_sorted.filter((u) => u.department_id === null).length;

  const getDepartmentUsersCount = (departmentId: number): number =>
    users_sorted.filter((u) => u.department_id === departmentId).length;

  const currentFilterLabel =
    selectedDepartmentFilter === "all"
      ? "Todos los departamentos"
      : selectedDepartmentFilter === "unassigned"
        ? "Sin departamento"
        : departments_sorted.find((dept) => dept.id === Number(selectedDepartmentFilter))?.name ??
          "Departamento";

  const getDepartmentName = (deptId: number | null): string => {
    if (!deptId) return "Sin asignar";
    return departments.find((d) => d.id === deptId)?.name ?? "Desconocido";
  };

  const resetForm = () => {
    setFormState(INITIAL_FORM_STATE);
    setEditingUserId(null);
  };

  const handleSubmitUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canAccessUsers) {
      return;
    }

    const normalizedName = formState.name.trim();
    const normalizedEmail = formState.email.trim();
    const deptId = formState.department_id ? parseInt(formState.department_id, 10) : null;

    if (!normalizedName) {
      setErrorMessage("El nombre del usuario es obligatorio.");
      setIsPermissionError(false);
      return;
    }

    if (!normalizedEmail) {
      setErrorMessage("El email del usuario es obligatorio.");
      setIsPermissionError(false);
      return;
    }

    if (!editingUserId && !formState.password) {
      setErrorMessage("La contraseña es obligatoria para nuevos usuarios.");
      setIsPermissionError(false);
      return;
    }

    setIsSavingUser(true);
    setErrorMessage(null);
    setIsPermissionError(false);

    try {
      const payload: {
        name: string;
        email: string;
        department_id: number | null;
        password?: string;
      } = {
        name: normalizedName,
        email: normalizedEmail,
        department_id: deptId,
      };

      if (formState.password) {
        payload.password = formState.password;
      }

      if (editingUserId) {
        await apiFetch<User>(`/users/${editingUserId}`, {
          method: "PATCH",
          body: payload,
        });

        setSuccessMessage("Usuario actualizado correctamente.");
      } else {
        await apiFetch<User>("/users", {
          method: "POST",
          body: payload,
        });

        setSuccessMessage("Usuario creado correctamente.");
      }

      resetForm();
      await loadUsers();
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 403) {
        setErrorMessage("No tienes permisos para guardar usuarios.");
        setIsPermissionError(true);
      } else if (error instanceof ApiClientError) {
        setErrorMessage(error.message);
        setIsPermissionError(false);
      } else {
        setErrorMessage("No se pudo guardar el usuario.");
        setIsPermissionError(false);
      }
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleEditUser = (u: User) => {
    setFormState({
      name: u.name,
      email: u.email,
      password: "",
      department_id: u.department_id?.toString() ?? "",
    });
    setEditingUserId(u.id);
  };

  const handleDeleteUser = async (u: User) => {
    const confirmed = window.confirm(`Eliminar usuario \"${u.name}\"?`);
    if (!confirmed) {
      return;
    }

    setErrorMessage(null);
    setIsPermissionError(false);
    setIsDeletingUserId(u.id);

    try {
      await apiFetch(`/users/${u.id}`, {
        method: "DELETE",
      });

      setSuccessMessage("Usuario eliminado correctamente.");
      if (editingUserId === u.id) {
        resetForm();
      }
      await loadUsers();
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 403) {
        setErrorMessage("No tienes permisos para eliminar este usuario.");
        setIsPermissionError(true);
      } else if (error instanceof ApiClientError) {
        setErrorMessage(error.message);
        setIsPermissionError(false);
      } else {
        setErrorMessage("No se pudo eliminar el usuario.");
        setIsPermissionError(false);
      }
    } finally {
      setIsDeletingUserId(null);
    }
  };

  return (
    <div className="min-h-screen bg-intra-ligth">
      <main className="flex min-h-screen w-full">
        <DashboardSidebar
          user={user ? { name: user.name, email: user.email } : null}
          isAdmin={Boolean(user?.roles?.some((role) => role.name.toLowerCase() === "admin"))}
          canManageAnnouncements={Boolean(user?.can_manage_announcements)}
          activeRoute="users"
          statusMessage={isLoadingUser || isLoadingUsers ? "Cargando usuarios..." : errorMessage ? errorMessage : "Usuarios sincronizados"}
        />

        <section className="min-w-0 flex flex-1 flex-col px-4 py-6 lg:px-6 xl:px-8 2xl:px-10">
          <div className="mx-auto flex min-h-0 w-full max-w-360 flex-1 flex-col space-y-4">

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

            {!isLoadingUsers && !canAccessUsers ? (
              <section className="rounded-3xl border border-intra-border bg-white p-5 shadow-sm">
                <p className="text-base text-intra-secondary/70">Solo usuarios autorizados pueden gestionar usuarios.</p>
              </section>
            ) : null}

            {canAccessUsers ? (
              <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[370px_minmax(0,1fr)]">
                <section className="h-fit rounded-3xl border border-intra-border bg-white p-5 shadow-sm" ref={formSectionRef}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-intra-secondary">
                      {editingUserId ? "Editar usuario" : "Nuevo usuario"}
                    </h3>
                  </div>

                  <form onSubmit={handleSubmitUser} className="mt-3 space-y-3">
                    <div>
                      <label htmlFor="user-name" className="text-sm font-medium text-intra-secondary">
                        Nombre
                      </label>
                      <input
                        id="user-name"
                        type="text"
                        value={formState.name}
                        onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Ej. Juan Pérez"
                        className="mt-1 w-full rounded-xl border border-intra-border bg-white px-3 py-2 text-sm text-intra-secondary outline-none transition focus:border-intra-primary focus:ring-4 focus:ring-intra-primary/15"
                      />
                    </div>

                    <div>
                      <label htmlFor="user-email" className="text-sm font-medium text-intra-secondary">
                        Email
                      </label>
                      <input
                        id="user-email"
                        type="email"
                        value={formState.email}
                        onChange={(event) => setFormState((current) => ({ ...current, email: event.target.value }))}
                        placeholder="correo@empresa.com"
                        className="mt-1 w-full rounded-xl border border-intra-border bg-white px-3 py-2 text-sm text-intra-secondary outline-none transition focus:border-intra-primary focus:ring-4 focus:ring-intra-primary/15"
                      />
                    </div>

                    <div>
                      <label htmlFor="user-password" className="text-sm font-medium text-intra-secondary">
                        {editingUserId ? "Contraseña (opcional)" : "Contraseña"}
                      </label>
                      <input
                        id="user-password"
                        type="password"
                        value={formState.password}
                        onChange={(event) => setFormState((current) => ({ ...current, password: event.target.value }))}
                        placeholder="Mínimo 8 caracteres"
                        className="mt-1 w-full rounded-xl border border-intra-border bg-white px-3 py-2 text-sm text-intra-secondary outline-none transition focus:border-intra-primary focus:ring-4 focus:ring-intra-primary/15"
                      />
                    </div>

                    <div>
                      <label htmlFor="user-department" className="text-sm font-medium text-intra-secondary">
                        Departamento
                      </label>
                      <select
                        id="user-department"
                        value={formState.department_id}
                        onChange={(event) => setFormState((current) => ({ ...current, department_id: event.target.value }))}
                        className="mt-1 w-full rounded-xl border border-intra-border bg-white px-3 py-2 text-sm text-intra-secondary outline-none transition focus:border-intra-primary focus:ring-4 focus:ring-intra-primary/15"
                      >
                        <option value="">Sin asignar</option>
                        {departments_sorted.map((dept) => (
                          <option key={dept.id} value={dept.id}>
                            {dept.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      {editingUserId ? (
                        <button
                          type="button"
                          onClick={resetForm}
                          className="inline-flex h-9 items-center justify-center rounded-xl border border-intra-border px-3 text-sm font-semibold text-intra-secondary transition hover:bg-intra-ligth"
                        >
                          Cancelar
                        </button>
                      ) : null}
                      <button
                        type="submit"
                        disabled={isSavingUser}
                        className="inline-flex h-9 items-center justify-center rounded-xl bg-intra-primary px-4 text-sm font-semibold text-white transition hover:bg-[#173d7d] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSavingUser ? "Guardando..." : editingUserId ? "Actualizar" : "Crear"}
                      </button>
                    </div>
                  </form>
                </section>

                <section className="flex min-h-0 flex-1 flex-col rounded-3xl border border-intra-border bg-white p-5 shadow-sm">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-xl font-semibold text-intra-secondary">Usuarios del sistema</h3>
                      <span className="rounded-full bg-intra-ligth px-3 py-1 text-sm font-medium text-intra-secondary">
                        {filteredUsers.length} / {users_sorted.length}
                      </span>
                    </div>

                    <div className="rounded-2xl border border-intra-border bg-intra-ligth/40 p-3">
                      <p className="text-sm font-semibold text-intra-secondary">Buscar por departamento</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedDepartmentFilter("all")}
                          className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                            selectedDepartmentFilter === "all"
                              ? "bg-intra-accent text-white"
                              : "border border-intra-border bg-white text-intra-secondary hover:bg-intra-ligth"
                          }`}
                        >
                          Todos ({users_sorted.length})
                        </button>

                        {departments_sorted.map((dept) => (
                          <button
                            key={dept.id}
                            type="button"
                            onClick={() => setSelectedDepartmentFilter(String(dept.id))}
                            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                              selectedDepartmentFilter === String(dept.id)
                                ? "bg-intra-accent text-white"
                                : "border border-intra-border bg-white text-intra-secondary hover:bg-intra-ligth"
                            }`}
                          >
                            {dept.name} ({getDepartmentUsersCount(dept.id)})
                          </button>
                        ))}

                        <button
                          type="button"
                          onClick={() => setSelectedDepartmentFilter("unassigned")}
                          className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                            selectedDepartmentFilter === "unassigned"
                              ? "bg-intra-accent text-white"
                              : "border border-intra-border bg-white text-intra-secondary hover:bg-intra-ligth"
                          }`}
                        >
                          Sin departamento ({usersWithoutDepartmentCount})
                        </button>
                      </div>

                      <div className="mt-3">
                        <label htmlFor="users-search" className="text-sm font-medium text-intra-secondary">
                          Buscar en {currentFilterLabel.toLowerCase()}
                        </label>
                        <input
                          id="users-search"
                          type="text"
                          value={searchTerm}
                          onChange={(event) => setSearchTerm(event.target.value)}
                          placeholder="Buscar por nombre o email"
                          className="mt-1 w-full rounded-xl border border-intra-border bg-white px-3 py-2 text-sm text-intra-secondary outline-none transition focus:border-intra-primary focus:ring-4 focus:ring-intra-primary/15"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-auto pr-1">
                    {isLoadingUsers ? (
                      <p className="text-base text-intra-secondary/70">Cargando usuarios...</p>
                    ) : null}

                    {!isLoadingUsers && users_sorted.length === 0 ? (
                      <p className="text-base text-intra-secondary/70">Aun no hay usuarios.</p>
                    ) : null}

                    {!isLoadingUsers && users_sorted.length > 0 && filteredUsers.length === 0 ? (
                      <p className="text-base text-intra-secondary/70">
                        No hay usuarios para el filtro seleccionado.
                      </p>
                    ) : null}

                    {filteredUsers.map((u) => (
                      <article key={u.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900">{u.name}</p>
                            <p className="mt-1 text-xs text-slate-600 break-all">{u.email}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              Departamento: {getDepartmentName(u.department_id)}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditUser(u)}
                              className="inline-flex h-9 items-center justify-center rounded-xl border border-intra-border px-3 text-sm font-semibold text-intra-secondary transition hover:bg-intra-ligth"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteUser(u)}
                              disabled={isDeletingUserId === u.id}
                              className="inline-flex h-9 items-center justify-center rounded-xl border border-red-200 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isDeletingUserId === u.id ? "Eliminando..." : "Eliminar"}
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
