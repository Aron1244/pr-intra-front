"use client";

import { useEffect, useState } from "react";
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
  const [isStartingTour, setIsStartingTour] = useState(false);
  const driverCssLinkId = "intra-driverjs-css";

  const cleanupDriverArtifacts = () => {
    document.body.classList.remove("driver-active", "driver-fade", "driver-simple", "intra-tour-running");

    document
      .querySelectorAll(".driver-active-element")
      .forEach((node) => node.classList.remove("driver-active-element"));

    document
      .querySelectorAll(
        ".driver-popover, .driver-overlay, .driver-stage, .driver-overlay-animated, .driver-overlay-svg, [class*='driver-'][role='dialog']",
      )
      .forEach((node) => node.remove());
  };

  useEffect(() => {
    // Ensure stale Driver.js artifacts never leak across routes.
    cleanupDriverArtifacts();

    const staleLink = document.getElementById(driverCssLinkId);
    if (staleLink) {
      staleLink.remove();
    }

    return () => {
      cleanupDriverArtifacts();
      const existingLink = document.getElementById(driverCssLinkId);
      if (existingLink) {
        existingLink.remove();
      }
    };
  }, []);

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

  const handleStartOnboarding = async () => {
    if (isStartingTour) {
      return;
    }

    setIsStartingTour(true);

    try {
      // Defensive cleanup in case a previous tour was interrupted.
      cleanupDriverArtifacts();

      await new Promise<void>((resolve, reject) => {
        const existingLink = document.getElementById(driverCssLinkId) as HTMLLinkElement | null;

        if (existingLink) {
          if (existingLink.dataset.loaded === "true") {
            resolve();
            return;
          }

          existingLink.addEventListener("load", () => resolve(), { once: true });
          existingLink.addEventListener("error", () => reject(new Error("driver css load error")), {
            once: true,
          });
          return;
        }

        const link = document.createElement("link");
        link.id = driverCssLinkId;
        link.rel = "stylesheet";
        link.href = "https://cdn.jsdelivr.net/npm/driver.js@1.4.0/dist/driver.css";
        link.onload = () => {
          link.dataset.loaded = "true";
          resolve();
        };
        link.onerror = () => reject(new Error("driver css load error"));
        document.head.appendChild(link);
      });

      const { driver } = await import("driver.js");

      document.body.classList.add("intra-tour-running");

      const tour = driver({
        showProgress: true,
        allowClose: true,
        popoverClass: "intra-driver-popover",
        nextBtnText: "Siguiente",
        prevBtnText: "Anterior",
        doneBtnText: "Finalizar",
        onDestroyed: () => {
          cleanupDriverArtifacts();
          const existingLink = document.getElementById(driverCssLinkId);
          if (existingLink) {
            existingLink.remove();
          }
        },
        steps: [
          {
            element: '[data-onboarding="brand"]',
            popover: {
              title: "Panel interno",
              description: "Desde aqui navegas por toda la intranet.",
            },
          },
          {
            element: '[data-onboarding="profile"]',
            popover: {
              title: "Perfil activo",
              description: "Muestra tu sesion, correo y tipo de usuario.",
            },
          },
          {
            element: '[data-onboarding="routes"]',
            popover: {
              title: "Navegacion principal",
              description: "Accede a conversaciones, documentos, departamentos y mas.",
            },
          },
          {
            element: '[data-onboarding="status"]',
            popover: {
              title: "Estado del modulo",
              description: "Aqui veras mensajes de sincronizacion o advertencias.",
            },
          },
          {
            element: '[data-onboarding="help"]',
            popover: {
              title: "Ayuda guiada",
              description: "Puedes volver a abrir este onboarding cuando quieras.",
            },
          },
        ],
      });

      tour.drive();
    } catch (error) {
      cleanupDriverArtifacts();
      console.error("No se pudo iniciar el onboarding", error);
    } finally {
      setIsStartingTour(false);
    }
  };

  return (
    <aside className="sticky top-0 flex h-dvh w-72 shrink-0 flex-col overflow-y-auto border-r border-intra-border bg-intra-secondary px-5 py-6 text-white shadow-xl shadow-intra-secondary/20">
      <div>
        <p data-onboarding="brand" className="text-xs tracking-[0.2em] text-white/60 uppercase">Intranet</p>
        <h1 className="mt-2 text-xl font-semibold">Panel interno</h1>

        <div data-onboarding="profile" className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-white/60">Perfil activo</p>
          <p className="mt-1 text-sm font-semibold">{user?.name ?? "Cargando..."}</p>
          <p className="text-xs text-white/70">{user?.email ?? ""}</p>
          <p className="mt-3 inline-flex rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide">
            {isAdmin ? "admin" : "usuario"}
          </p>
        </div>

        <nav data-onboarding="routes" className="mt-6 space-y-1.5">
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
        <div data-onboarding="status" className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/75">
          {statusMessage}
        </div>
        <button
          data-onboarding="help"
          type="button"
          onClick={() => {
            void handleStartOnboarding();
          }}
          disabled={isStartingTour}
          className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isStartingTour ? "Abriendo ayuda..." : "Ayuda"}
        </button>
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