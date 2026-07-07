import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { AuthShell } from "@/features/auth/AuthShell";
import { AuthDatenschutzLink } from "@/components/legal/AuthDatenschutzLink";

export function PasswortZuruecksetzenPage() {
  const { istAngemeldet, isLoading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let active = true;

    const timer = window.setTimeout(() => {
      if (active) setSessionReady(true);
    }, 800);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen haben.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await navigate({ to: "/" });
    } catch {
      setError(
        "Passwort konnte nicht gesetzt werden. Bitte den Link aus der E-Mail erneut öffnen.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading || !sessionReady) {
    return (
      <AuthShell title="Einen Moment…" description="Ihr Link wird geprüft.">
        <p className="text-sm text-text-muted">Bitte warten Sie einen Augenblick.</p>
      </AuthShell>
    );
  }

  if (!istAngemeldet) {
    return (
      <AuthShell
        title="Link ungültig oder abgelaufen"
        description="Bitte fordern Sie auf der Anmeldeseite einen neuen Link zum Zurücksetzen des Passworts an."
      >
        <Button
          className="h-11 w-full bg-primary text-primary-foreground transition-colors hover:bg-heading"
          onClick={() => navigate({ to: "/anmelden" })}
        >
          Zur Anmeldung
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Neues Passwort"
      description="Bitte wählen Sie ein neues Passwort für Ihr Konto."
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="password" className="label-caps text-text-muted">
            Passwort
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            autoFocus
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-none border-hairline bg-surface shadow-none transition-[border-color,background-color] focus-visible:border-heading focus-visible:bg-surface focus-visible:ring-0"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="passwordConfirm" className="label-caps text-text-muted">
            Passwort bestätigen
          </Label>
          <Input
            id="passwordConfirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
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
              Passwort speichern
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </Button>
      </form>
      <AuthDatenschutzLink variant="hinweis" />
    </AuthShell>
  );
}
