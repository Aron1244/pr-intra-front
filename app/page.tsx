"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { API_BASE, ApiClientError, apiFetch } from "@/lib/api-client";
import { saveAccessToken } from "@/lib/auth-token";

type LoginResponse = {
  message: string;
  token_type: "Bearer";
  access_token: string;
  user: {
    id: number;
    name: string;
    email: string;
  };
};

type MeResponse = {
  data: {
    id: number;
    name: string;
    email: string;
  };
};

type LaravelValidationErrorPayload = {
  message?: string;
  errors?: Record<string, string[]>;
};

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const loginPayload = await apiFetch<LoginResponse>("/login", {
        method: "POST",
        auth: false,
        body: {
          email,
          password,
          device_name: "nextjs-client",
        },
      });

      saveAccessToken(loginPayload.access_token, remember);

      const currentUser = await apiFetch<MeResponse>("/me", {
        method: "GET",
      });

      if (currentUser.data.id) {
        router.push("/dashboard");
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 422) {
        const payload = error.payload as LaravelValidationErrorPayload;
        const firstFieldError = payload.errors
          ? Object.values(payload.errors)[0]?.[0]
          : undefined;
        setErrorMessage(firstFieldError ?? payload.message ?? "No fue posible iniciar sesion.");
      } else if (error instanceof ApiClientError && error.status === 401) {
        setErrorMessage("Credenciales invalidas. Verifica email y contrasena.");
      } else if (error instanceof ApiClientError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Error inesperado al iniciar sesion.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-intra-ligth px-6 py-8 sm:px-10 lg:px-16">
      <div className="pointer-events-none absolute -top-24 -left-20 h-72 w-72 rounded-full bg-intra-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-8 h-80 w-80 rounded-full bg-intra-accent/20 blur-3xl" />

      <main className="relative mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-3xl border border-intra-border/70 bg-gradient-to-br from-intra-primary to-[#173d7d] p-7 text-white shadow-xl shadow-intra-primary/20 sm:p-10">
          <p className="inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs tracking-[0.18em] uppercase">
            Intranet Corporativa
          </p>
          <h1 className="mt-6 max-w-xl text-3xl leading-tight font-semibold sm:text-5xl">
            Tu centro de trabajo interno, en un solo lugar.
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-relaxed text-white/85 sm:text-base">
            Accede a documentos, conversaciones y herramientas del equipo con
            una experiencia segura y simple.
          </p>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            <article className="rounded-xl border border-white/25 bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-2xl font-semibold">24/7</p>
              <p className="mt-1 text-sm text-white/80">Disponibilidad</p>
            </article>
            <article className="rounded-xl border border-white/25 bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-2xl font-semibold">+40</p>
              <p className="mt-1 text-sm text-white/80">Modulos internos</p>
            </article>
            <article className="rounded-xl border border-white/25 bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-2xl font-semibold">100%</p>
              <p className="mt-1 text-sm text-white/80">Acceso autenticado</p>
            </article>
          </div>
        </section>

        <section className="rounded-3xl border border-intra-border bg-white p-6 shadow-xl shadow-intra-secondary/10 sm:p-8">
          <div className="mx-auto w-full max-w-sm">
            <p className="text-sm font-medium tracking-wide text-intra-accent uppercase">
              Bienvenido
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-intra-secondary">
              Inicia sesion
            </h2>
            <p className="mt-2 text-sm text-intra-secondary/70">
              Usa tus credenciales corporativas para entrar a la plataforma.
            </p>
            <p className="mt-1 text-xs text-intra-secondary/55">
              API activa: {API_BASE}
            </p>

            <form className="mt-8 space-y-5" noValidate onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-intra-secondary"
                >
                  Correo corporativo
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="nombre@empresa.com"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-12 w-full rounded-xl border border-intra-border bg-intra-ligth/40 px-4 text-sm text-intra-secondary outline-none transition focus:border-intra-primary focus:ring-4 focus:ring-intra-primary/15"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="text-sm font-medium text-intra-secondary"
                  >
                    Contrasena
                  </label>
                  <a href="#" className="text-xs font-medium text-intra-primary hover:underline">
                    Olvide mi contrasena
                  </a>
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="********"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-12 w-full rounded-xl border border-intra-border bg-intra-ligth/40 px-4 text-sm text-intra-secondary outline-none transition focus:border-intra-primary focus:ring-4 focus:ring-intra-primary/15"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-intra-secondary/80">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="h-4 w-4 rounded border-intra-border text-intra-primary focus:ring-intra-primary"
                />
                Mantener sesion iniciada
              </label>

              {errorMessage ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {errorMessage}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-intra-primary text-sm font-semibold text-white transition hover:bg-[#173d7d] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-intra-primary/25"
              >
                {isSubmitting ? "Ingresando..." : "Entrar a la intranet"}
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
