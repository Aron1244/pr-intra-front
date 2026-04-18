"use client";

import Link from "next/link";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-intra-ligth px-6 py-10 sm:px-10">
      <div className="pointer-events-none absolute -top-24 -left-20 h-72 w-72 rounded-full bg-intra-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-8 h-80 w-80 rounded-full bg-intra-accent/20 blur-3xl" />

      <section className="relative mx-auto flex min-h-[75vh] w-full max-w-3xl flex-col items-center justify-center rounded-3xl border border-intra-border bg-white p-8 text-center shadow-lg shadow-intra-secondary/10 sm:p-12">
        <p className="rounded-full border border-intra-border bg-intra-ligth px-4 py-1 text-xs font-semibold tracking-[0.18em] text-intra-secondary uppercase">
          Error de aplicacion
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-intra-secondary sm:text-5xl">
          Algo salio mal
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-intra-secondary/75 sm:text-base">
          Ocurrio un error inesperado al cargar la vista. Puedes intentar
          nuevamente o volver al inicio.
        </p>

        <p className="mt-4 max-w-xl rounded-lg border border-intra-border bg-intra-ligth/40 px-3 py-2 text-left font-mono text-xs text-intra-secondary/80">
          {error.message}
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-intra-primary px-5 text-sm font-semibold text-white transition hover:bg-[#173d7d]"
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-intra-border px-5 text-sm font-semibold text-intra-secondary transition hover:bg-intra-ligth"
          >
            Ir al login
          </Link>
        </div>
      </section>
    </main>
  );
}
