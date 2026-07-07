import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";

/** Monogram: light tile on dark panels so the F stays legible. */
function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
      focusable="false"
    >
      <rect width="32" height="32" fill="#fff" />
      <rect x="8" y="7" width="5" height="18" fill="#0A0A0A" />
      <rect x="8" y="7" width="16" height="5" fill="#0A0A0A" />
      <rect x="8" y="14" width="12" height="5" fill="#0A0A0A" />
    </svg>
  );
}

/** Abstract facade — vertical rhythm of a property portfolio. */
function FacadePattern() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Fine structural grid */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      {/* Building columns */}
      <div className="absolute inset-y-0 right-0 flex w-[58%] items-end justify-end gap-px pr-0">
        {[
          { h: "42%", o: 0.06 },
          { h: "68%", o: 0.1 },
          { h: "54%", o: 0.07 },
          { h: "88%", o: 0.12 },
          { h: "62%", o: 0.08 },
          { h: "76%", o: 0.1 },
          { h: "48%", o: 0.06 },
        ].map((col, i) => (
          <div
            key={i}
            className="relative flex-1 bg-white"
            style={{ height: col.h, opacity: col.o }}
          >
            <div
              className="absolute inset-x-2 top-4 bottom-4 opacity-40"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(to bottom, transparent, transparent 10px, #fff 10px, #fff 11px)",
              }}
            />
          </div>
        ))}
      </div>
      {/* Accent bar */}
      <div className="absolute bottom-0 left-0 h-1 w-24 bg-white" />
    </div>
  );
}

export function AnmeldenPage() {
  const { anmelden, passwortVergessen } = useAuth();
  const navigate = useNavigate();
  const [ansicht, setAnsicht] = useState<"anmelden" | "passwort-vergessen">("anmelden");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [passwortLinkGesendet, setPasswortLinkGesendet] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await anmelden(email.trim(), password);
      await navigate({ to: "/" });
    } catch {
      setError("Anmeldung fehlgeschlagen.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onPasswortVergessen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await passwortVergessen(email.trim());
      setPasswortLinkGesendet(true);
    } catch {
      setError("Der Link konnte nicht gesendet werden. Bitte versuchen Sie es erneut.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function zurueckZurAnmeldung() {
    setAnsicht("anmelden");
    setPasswortLinkGesendet(false);
    setError(null);
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Brand panel */}
      <aside className="relative hidden w-[46%] shrink-0 flex-col overflow-hidden bg-heading px-10 py-10 text-primary-foreground lg:flex xl:w-[48%] xl:px-14">
        <FacadePattern />

        <div className="relative z-10">
          <BrandMark className="size-10" />
        </div>

        <div className="relative z-10 flex flex-1 flex-col justify-center">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-white/45">
            FRENKEN
          </p>
          <h1 className="mt-4 text-[2.75rem] font-semibold leading-[1.05] tracking-tight text-white">
            Verwaltung
          </h1>
          <div className="mt-8 h-px w-12 bg-white/25" />
        </div>
      </aside>

      {/* Form panel */}
      <main className="relative flex flex-1 flex-col">
        {/* Mobile brand strip */}
        <div className="flex items-center gap-3 border-b border-hairline bg-heading px-6 py-4 text-primary-foreground lg:hidden">
          <BrandMark className="size-8" />
          <div>
            <p className="text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-white/50">
              FRENKEN
            </p>
            <p className="text-sm font-semibold tracking-tight text-white">Verwaltung</p>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
          <div className="w-full max-w-[22rem]">
            <h2 className="mb-10 text-2xl font-semibold tracking-tight text-heading">
              {ansicht === "anmelden" ? "Willkommen" : "Passwort vergessen"}
            </h2>

            {ansicht === "anmelden" ? (
              <form onSubmit={onSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="label-caps text-text-muted">
                    E-Mail
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 rounded-none border-hairline bg-surface shadow-none transition-[border-color,background-color] focus-visible:border-heading focus-visible:bg-surface focus-visible:ring-0"
                    placeholder="name@firma.de"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="password" className="label-caps text-text-muted">
                      Passwort
                    </Label>
                    <button
                      type="button"
                      onClick={() => {
                        setAnsicht("passwort-vergessen");
                        setError(null);
                        setPasswortLinkGesendet(false);
                      }}
                      className="text-xs text-text-muted underline-offset-2 transition-colors hover:text-heading hover:underline"
                    >
                      Passwort vergessen?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 rounded-none border-hairline bg-surface shadow-none transition-[border-color,background-color] focus-visible:border-heading focus-visible:bg-surface focus-visible:ring-0"
                  />
                </div>

                {error ? (
                  <p
                    className="border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
                    role="alert"
                  >
                    {error}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="group h-11 w-full bg-primary text-primary-foreground transition-colors hover:bg-heading"
                >
                  {isSubmitting ? (
                    "Einen Moment…"
                  ) : (
                    <>
                      Weiter
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>
              </form>
            ) : passwortLinkGesendet ? (
              <div className="space-y-6">
                <p className="text-sm text-text-muted">
                  Falls ein Konto mit <span className="font-medium text-heading">{email}</span>{" "}
                  existiert, haben wir Ihnen einen Link zum Zurücksetzen des Passworts gesendet.
                  Bitte prüfen Sie auch Ihren Spam-Ordner.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={zurueckZurAnmeldung}
                  className="h-11 w-full rounded-none border-hairline"
                >
                  Zurück zur Anmeldung
                </Button>
              </div>
            ) : (
              <form onSubmit={onPasswortVergessen} className="space-y-5">
                <p className="text-sm text-text-muted">
                  Geben Sie Ihre E-Mail-Adresse ein. Wir senden Ihnen einen Link zum Zurücksetzen
                  Ihres Passworts.
                </p>

                <div className="space-y-2">
                  <Label htmlFor="reset-email" className="label-caps text-text-muted">
                    E-Mail
                  </Label>
                  <Input
                    id="reset-email"
                    type="email"
                    autoComplete="username"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 rounded-none border-hairline bg-surface shadow-none transition-[border-color,background-color] focus-visible:border-heading focus-visible:bg-surface focus-visible:ring-0"
                    placeholder="name@firma.de"
                  />
                </div>

                {error ? (
                  <p
                    className="border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
                    role="alert"
                  >
                    {error}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="group h-11 w-full bg-primary text-primary-foreground transition-colors hover:bg-heading"
                >
                  {isSubmitting ? "Einen Moment…" : "Link senden"}
                </Button>

                <button
                  type="button"
                  onClick={zurueckZurAnmeldung}
                  className="w-full text-center text-sm text-text-muted underline-offset-2 transition-colors hover:text-heading hover:underline"
                >
                  Zurück zur Anmeldung
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
