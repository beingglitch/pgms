import Image from "next/image";

/**
 * Split-panel frame shared by /login and /signup: a dark, colour-washed
 * brand panel on wide screens (hidden on mobile, where the form alone is
 * the whole page) paired with the actual form on a plain canvas. Keeps the
 * two auth pages visually matched without duplicating the chrome twice.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-[#12142a] p-10 text-white lg:flex">
        <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-chip-purple-foreground/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-primary/40 blur-3xl" />
        <div className="pointer-events-none absolute right-16 top-1/3 h-56 w-56 rounded-full bg-chip-orange-foreground/25 blur-3xl" />

        <div className="relative flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 font-display text-sm font-bold backdrop-blur-sm">
            PG
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">My PG</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="font-display text-4xl font-semibold leading-[1.15] tracking-tight">{title}</h2>
          <p className="mt-4 text-base text-white/65">{subtitle}</p>
        </div>

        <Image
          src="/mascot/hero-wave.png"
          alt=""
          width={420}
          height={420}
          className="pointer-events-none absolute -bottom-8 -right-10 h-64 w-64 object-contain drop-shadow-2xl xl:h-80 xl:w-80"
          priority
        />

        <p className="relative text-xs font-medium tracking-wide text-white/35">
          TENANTS · LEDGER · ELECTRICITY · REMINDERS
        </p>
      </div>

      <div className="flex w-full items-center justify-center bg-canvas px-5 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </main>
  );
}
