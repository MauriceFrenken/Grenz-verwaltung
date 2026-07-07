import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  Navigate,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "../components/auth/AuthProvider";
import { OutlookConnectionProvider } from "../features/dokumente/outlook/OutlookConnectionProvider";
import { AppShell } from "../components/layout/AppShell";
import { Toaster } from "../components/ui/sonner";
import { useAuth } from "../hooks/useAuth";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-6xl font-bold tracking-tight text-heading">404</h1>
        <h2 className="mt-4 text-lg font-semibold text-heading">Seite nicht gefunden</h2>
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

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
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
          Es ist ein Fehler aufgetreten. Sie können es erneut versuchen oder zur Startseite zurückkehren.
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

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "FRENKEN Verwaltung" },
      { name: "description", content: "Internes Verwaltungsprogramm der FRENKEN Holding — Dokumentenablage, Miet- und NK-Verwaltung, Ankaufs-Transaktionen." },
      { name: "author", content: "FRENKEN Holding GmbH" },
      { property: "og:title", content: "FRENKEN Verwaltung" },
      { property: "og:description", content: "Internes Verwaltungsprogramm der FRENKEN Holding." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
      },
      // Unique filenames (not /favicon.ico alone) so browsers drop the cached Lovable/IS icon.
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
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
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
  const { istAngemeldet, isLoading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const istAnmeldenSeite = pathname === "/anmelden";
  const istEinladungSeite = pathname === "/einladung";
  const istPasswortZuruecksetzenSeite = pathname === "/passwort-zuruecksetzen";
  const istAuthSeite = istAnmeldenSeite || istEinladungSeite || istPasswortZuruecksetzenSeite;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-text-muted">Sitzung wird geprüft…</p>
      </div>
    );
  }

  if (!istAngemeldet && !istAuthSeite) {
    return <Navigate to="/anmelden" />;
  }

  // Invite / recovery links establish a session and must set a password first.
  if (istEinladungSeite || istPasswortZuruecksetzenSeite) {
    return children;
  }

  if (istAngemeldet && istAnmeldenSeite) {
    return <Navigate to="/" />;
  }

  if (istAnmeldenSeite) {
    return children;
  }

  return <AppShell><OutlookConnectionProvider>{children}</OutlookConnectionProvider></AppShell>;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </AuthGate>
        <Toaster position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
