import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";

export function EinladungPage() {
  const { istAngemeldet, isLoading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let active = true;

    // Invite links land with tokens in the URL; wait briefly for AuthProvider.
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
      setError("Passwort konnte nicht gesetzt werden. Bitte den Einladungslink erneut öffnen.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading || !sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-text-muted">Einladung wird geprüft…</p>
      </div>
    );
  }

  if (!istAngemeldet) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight text-heading">
            Einladung ungültig oder abgelaufen
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Bitte öffnen Sie den Link aus der Einladungs-E-Mail erneut oder wenden Sie sich an Ihren
            Administrator.
          </p>
          <Button
            className="mt-6 bg-primary text-primary-foreground hover:bg-heading"
            onClick={() => navigate({ to: "/anmelden" })}
          >
            Zur Anmeldung
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-[22rem]">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-heading">
          Passwort festlegen
        </h1>
        <p className="mb-8 text-sm text-text-muted">
          Willkommen bei FRENKEN Verwaltung. Bitte wählen Sie ein Passwort für Ihr Konto.
        </p>

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
              className="h-11 rounded-none border-hairline bg-surface shadow-none focus-visible:border-heading focus-visible:ring-0"
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
              className="h-11 rounded-none border-hairline bg-surface shadow-none focus-visible:border-heading focus-visible:ring-0"
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
            className="group h-11 w-full bg-primary text-primary-foreground hover:bg-heading"
          >
            {isSubmitting ? (
              "Einen Moment…"
            ) : (
              <>
                Konto aktivieren
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
