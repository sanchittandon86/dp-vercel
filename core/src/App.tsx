import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import AppSidebar from "@/components/app-sidebar"
import Header from "@/components/header"
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar"
import { useModules } from "@/hooks/useModules"
import { FederationMFE } from "@/components/FederationMFE"
import { Toaster } from "sonner"
import { useMfeNotifications } from "@/hooks/useMfeNotifications"

/**
 * Shell layout: sidebar + header + main content. Mounted ONCE; only the content inside
 * <Routes> changes on navigation. AppLayout wraps Routes so the sidebar is never recreated.
 */
const AppLayout = () => {
  const { toggleSidebar } = useSidebar();
  const { availableModules, loading } = useModules();
  useMfeNotifications();

  return (
    <SidebarInset>
      <Header onMenuClick={toggleSidebar} />
      <div className="flex flex-1 flex-col pt-14 overflow-auto">
        <main className="flex-1 p-6">
          {/* Routes always mounted so layout/sidebar state never resets on navigation */}
          <Routes>
            {availableModules.map((m) => (
              <Route
                key={m.id}
                path={`${m.path}/*`}
                element={<FederationMFE module={m} />}
              />
            ))}
            <Route
              path="*"
              element={
                loading ? (
                  <p className="text-muted-foreground">Loading modules...</p>
                ) : availableModules.length > 0 ? (
                  <Navigate to={availableModules[0].path} replace />
                ) : (
                  <p className="text-muted-foreground">No modules available. Check that at least one MFE is running.</p>
                )
              }
            />
          </Routes>
        </main>
      </div>
    </SidebarInset>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <SidebarProvider>
        <AppSidebar />
        <AppLayout />
      </SidebarProvider>
      <Toaster position="top-right" richColors />
    </BrowserRouter>
  )
}
