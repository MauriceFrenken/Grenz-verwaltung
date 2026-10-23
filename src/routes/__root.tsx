import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  Navigate,
  createRootRouteWithContext,
  type ErrorComponentProps,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  redirect,
} from "@tanstack/react-router";
import { useEffect, useMemo, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "../components/auth/AuthProvider";
import { AppShell } from "../components/layout/AppShell";
import { OpAdminZensurSync } from "../components/op-admin/OpAdminZensurSync";
import { Toaster } from "../components/ui/sonner";
import { useAuth } from "../hooks/useAuth";
import {
  istOeffentlicherAuthPfad,
  sichererRueckweg,
} from "../lib/auth-pfade";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-6xl font-bold tracking-tight text-heading">404</h1>
        <h2 className="mt-4 text-lg font-semibold text-heading">
          Seite nicht gefunden
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          Die aufgerufene Seite existiert nicht oder wurde verschoben.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-heading"
          >
            Zur Startseite
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error: fehler, reset }: ErrorComponentProps) {
  const error = useMemo(
    () => (fehler instanceof Error ? fehler : new Error(String(fehler))),
    [fehler],
  );
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-heading">
          Diese Seite konnte nicht geladen werden
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Es ist ein Fehler aufgetreten. Sie können es erneut versuchen oder zur
          Startseite zurückkehren.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-heading"
          >
            Erneut versuchen
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center border border-foreground bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-muted"
          >
            Zur Startseite
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    beforeLoad: ({ location }) => {
      // SSR kennt keine localStorage-Session → geschützte URLs nie als App ausliefern.
      if (!import.meta.env.SSR) return;
      if (istOeffentlicherAuthPfad(location.pathname)) return;
      throw redirect({
        to: "/anmelden",
        search: { von: location.pathname },
        replace: true,
      });
    },
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: "Grenz & Co. Verwaltung" },
        {
          name: "description",
          content:
            "Internes Verwaltungsprogramm von Grenz & Co. — Exposés, Postfach, Dokumentenablage, Rechnungsfreigabe und EBICS.",
        },
        { name: "author", content: "Grenz & Co. Immobilienberatungs-GmbH" },
        { property: "og:title", content: "Grenz & Co. Verwaltung" },
        {
          property: "og:description",
          content: "Internes Verwaltungsprogramm von Grenz & Co.",
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
      links: [
        {
          rel: "stylesheet",
          href: appCss,
        },
        // Eigene Dateinamen (nicht nur /favicon.ico), damit Browser alte Icons verwerfen.
        { rel: "icon", href: "/fv-icon.svg", type: "image/svg+xml" },
        { rel: "icon", href: "/fv-icon.ico", sizes: "32x32" },
        { rel: "shortcut icon", href: "/fv-icon.ico" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      ],
    }),
    shellComponent: RootShell,
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
    errorComponent: ErrorComponent,
  },
);

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const { istAngemeldet, status } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const von = useRouterState({
    select: (s) =>
      sichererRueckweg((s.location.search as { von?: unknown }).von),
  });
  const istAnmeldenSeite = pathname === "/anmelden";
  const istEinladungSeite = pathname === "/einladung";
  const istPasswortZuruecksetzenSeite = pathname === "/passwort-zuruecksetzen";
  const istDatenschutzSeite = pathname === "/datenschutz";
  const istImpressumSeite = pathname === "/impressum";
  const istSalesforceCallback = pathname === "/salesforce/callback";
  const istMicrosoftCallback = pathname === "/microsoft/callback";
  const istOauthCallback = istSalesforceCallback || istMicrosoftCallback;
  const istAuthSeite = istOeffentlicherAuthPfad(pathname);

  if (istOauthCallback) {
    return children;
  }

  // Bis die Session serverseitig bestätigt ist: neutrale Fläche, nie AppShell.
  if (status === "pending") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-text-muted">Sitzung wird geprüft…</p>
      </div>
    );
  }

  if (!istAngemeldet && !istAuthSeite) {
    return <Navigate to="/anmelden" search={{ von: pathname }} replace />;
  }

  // Invite / recovery links establish a session and must set a password first.
  if (
    istEinladungSeite ||
    istPasswortZuruecksetzenSeite ||
    istDatenschutzSeite ||
    istImpressumSeite
  ) {
    return children;
  }

  if (istAngemeldet && istAnmeldenSeite) {
    return <Navigate to={von ?? "/"} replace />;
  }

  if (istAnmeldenSeite) {
    return children;
  }

  if (!istAngemeldet) {
    return <Navigate to="/anmelden" replace />;
  }

  return <AppShell>{children}</AppShell>;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OpAdminZensurSync />
        <AuthGate>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </AuthGate>
        <Toaster position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
