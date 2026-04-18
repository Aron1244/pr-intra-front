import Link from "next/link";

export default function NotFound() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-intra-ligth px-6 py-10 sm:px-10">
      <div className="pointer-events-none absolute -top-24 -left-20 h-72 w-72 rounded-full bg-intra-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-8 h-80 w-80 rounded-full bg-intra-accent/20 blur-3xl" />

      <section className="relative mx-auto flex min-h-[75vh] w-full max-w-3xl flex-col items-center justify-center rounded-3xl border border-intra-border bg-white p-8 text-center shadow-lg shadow-intra-secondary/10 sm:p-12">
        <p className="rounded-full border border-intra-border bg-intra-ligth px-4 py-1 text-xs font-semibold tracking-[0.18em] text-intra-secondary uppercase">
          Error 404
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-intra-secondary sm:text-5xl">
          Ruta no encontrada
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-intra-secondary/75 sm:text-base">
          La pagina que intentas abrir no existe o fue movida. Vuelve al login para
          continuar navegando en la intranet.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-intra-primary px-5 text-sm font-semibold text-white transition hover:bg-[#173d7d]"
          >
            Ir al login
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-intra-border px-5 text-sm font-semibold text-intra-secondary transition hover:bg-intra-ligth"
          >
            Ir al dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
