import { lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Boot, Spinner, type Session } from "@tgcloud/ui/ui/Boot";
import { queryClient } from "./core/data";

const TVApp = lazy(() => import("./tv/TVApp"));
const MobileApp = lazy(() => import("./mobile/MobileApp"));
const DesktopApp = lazy(() => import("./desktop/DesktopApp"));

export type { Session };

export default function App() {
  return (
    <Boot
      // New vault: nothing from the previous one may remain in the query cache.
      onEnter={() => queryClient.clear()}
      main={(session, shell) => (
        <QueryClientProvider client={queryClient}>
          <Suspense fallback={<Spinner />}>{shell === "tv" ? <TVApp session={session} /> : shell === "mobile" ? <MobileApp session={session} /> : <DesktopApp session={session} />}</Suspense>
        </QueryClientProvider>
      )}
    />
  );
}
