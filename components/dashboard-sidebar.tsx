"use client";

import Link from "next/link";

type SidebarRoute = {
  label: string;
  href: string;
  active?: boolean;
};

type DashboardSidebarProps = {
  user: {
    name: string;
    email: string;
  } | null;
  isAdmin: boolean;
  canManageAnnouncements?: boolean;
  activeRoute: "dashboard" | "conversations" | "documents" | "publications" | "users" | "departments";
  statusMessage: string;
};

export function DashboardSidebar({
  user,
  isAdmin,
  canManageAnnouncements = false,
  activeRoute,
  statusMessage,
}: DashboardSidebarProps) {
  const routes: SidebarRoute[] = [
    { label: "Inicio", href: "/dashboard", active: activeRoute === "dashboard" },
    {
      label: "Conversaciones",
      href: "/dashboard/conversations",
      active: activeRoute === "conversations",
    },
    {
      label: "Documentos",
      href: "/dashboard/documents",
      active: activeRoute === "documents",
    },
  ];

  if (canManageAnnouncements) {
    routes.push({
      label: "Publicaciones",
      href: "/dashboard/publications",
      active: activeRoute === "publications",
    });
  }

  if (isAdmin) {
    routes.push({
      label: "Departamentos",
      href: "/dashboard/departments",
      active: activeRoute === "departments",
    });
    routes.push({
      label: "Usuarios",
      href: "/dashboard/users",
      active: activeRoute === "users",
    });
  }

  const secondaryItems = isAdmin
    ? ["Usuarios"]
    : ["Mi actividad", "Mi perfil"];

  return (
    <aside className="sticky top-0 flex h-screen w-72 shrink-0 flex-col border-r border-intra-border bg-intra-secondary px-5 py-6 text-white shadow-xl shadow-intra-secondary/20">
      <div>
        <p className="text-xs tracking-[0.2em] text-white/60 uppercase">Intranet</p>
        <h1 className="mt-2 text-xl font-semibold">Panel interno</h1>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-white/60">Perfil activo</p>
          <p className="mt-1 text-sm font-semibold">{user?.name ?? "Cargando..."}</p>
          <p className="text-xs text-white/70">{user?.email ?? ""}</p>
          <p className="mt-3 inline-flex rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide">
            {isAdmin ? "admin" : "usuario"}
          </p>
        </div>

        <nav className="mt-6 space-y-1.5">
          {routes.map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm transition ${
                route.active ? "bg-white/15 text-white" : "text-white/85 hover:bg-white/10"
              }`}
            >
              {route.label}
            </Link>
          ))}

          <div className="pt-2">
            <p className="px-3 text-[11px] font-semibold tracking-[0.16em] text-white/50 uppercase">
              Secciones
            </p>
            <div className="mt-2 space-y-1">
              {secondaryItems.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm text-white/70 transition hover:bg-white/10"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </nav>
      </div>

      <div className="mt-auto space-y-3 pt-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/75">
          {statusMessage}
        </div>
        <Link
          href="/"
          className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-white/10"
        >
          Cerrar sesion
        </Link>
      </div>
    </aside>
  );
}