import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { AuthShell } from "@/features/auth/AuthShell";

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
    <AuthShell
      title={ansicht === "anmelden" ? "Willkommen" : "Passwort vergessen"}
      description={
        ansicht === "passwort-vergessen" && !passwortLinkGesendet
          ? "Geben Sie Ihre E-Mail-Adresse ein. Wir senden Ihnen einen Link zum Zurücksetzen Ihres Passworts."
          : undefined
      }
    >
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
            Falls ein Konto mit <span className="font-medium text-heading">{email}</span> existiert,
            haben wir Ihnen einen Link zum Zurücksetzen des Passworts gesendet. Bitte prüfen Sie auch
            Ihren Spam-Ordner.
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
    </AuthShell>
  );
}
