import React, { lazy, Suspense, useContext, useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Sidebar from "./components/Sidebar";
import RouteFade from "./components/common/RouteFade";
import { AuthContext, AuthProvider } from "./context/AuthContext";
import { useDocumentTitle } from "./hooks/useDocumentTitle";
import useReducedMotion from "./hooks/useReducedMotion";
import useVantaBackground from "./hooks/useVantaBackground";
import { UI_MOTION, uiTransition } from "./constants/ui";
import "./App.css";

const Login = lazy(() => import("./components/Login"));
const Dashboard = lazy(() => import("./components/Dashboard"));
const InvoiceList = lazy(() => import("./components/InvoiceList"));
const BugReports = lazy(() => import("./components/BugReports"));
const SalesOrderList = lazy(() => import("./components/SalesOrderList"));
const CustomerList = lazy(() => import("./components/CustomerList"));
const InventoryDashboard = lazy(
  () => import("./components/InventoryDashboard"),
);
const PurchaseOrderList = lazy(() => import("./components/PurchaseOrderList"));
const OnlineStoreDashboard = lazy(
  () => import("./components/OnlineStoreDashboard"),
);
const LedgerPage = lazy(() => import("./components/LedgerPage"));
const PrintSettings = lazy(() => import("./components/PrintSettings"));

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
}

function ProtectedRoute({
  children,
  isDarkMode,
  setIsDarkMode,
  isVantaMode,
  isSidebarOpen,
  setIsSidebarOpen,
  isMobile,
}) {
  const { token } = useContext(AuthContext);
  if (!token) return <Navigate to="/login" />;
  return (
    <div className="flex min-h-screen">
      <Sidebar
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        isVantaMode={isVantaMode}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
      />
      <div
        className="flex-1"
        style={{
          marginLeft: isMobile ? 0 : isSidebarOpen ? "284px" : "108px",
          transition: uiTransition("margin-left", UI_MOTION.duration.page),
        }}
      >
        <RouteFade>{children}</RouteFade>
      </div>
    </div>
  );
}

function PageTitleWrapper({ title, children }) {
  useDocumentTitle(title);
  return children;
}

function RouteFallback() {
  return (
    <div
      className="ui-motion-page"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        color: "var(--color-text-muted)",
        background: "var(--color-bg)",
        fontSize: "13px",
        fontWeight: 600,
      }}
    >
      Memuat...
    </div>
  );
}

function AppRoutes({
  isDarkMode,
  setIsDarkMode,
  isVantaMode,
  isSidebarOpen,
  setIsSidebarOpen,
  isMobile,
}) {
  const { token } = useContext(AuthContext);
  const wrap = (Component, title) => (
    <ProtectedRoute
      isDarkMode={isDarkMode}
      setIsDarkMode={setIsDarkMode}
      isVantaMode={isVantaMode}
      isSidebarOpen={isSidebarOpen}
      setIsSidebarOpen={setIsSidebarOpen}
      isMobile={isMobile}
    >
      <PageTitleWrapper title={title}>
        <Component
          isDarkMode={isDarkMode}
          isVantaMode={isVantaMode}
          isSidebarOpen={isSidebarOpen}
          isMobile={isMobile}
        />
      </PageTitleWrapper>
    </ProtectedRoute>
  );
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route
          path="/login"
          element={
            <RouteFade>
              <PageTitleWrapper title="Login">
                <Login
                  isDarkMode={isDarkMode}
                  setIsDarkMode={setIsDarkMode}
                  isVantaMode={isVantaMode}
                />
              </PageTitleWrapper>
            </RouteFade>
          }
        />
        <Route path="/dashboard" element={wrap(Dashboard, "Dashboard")} />
        <Route path="/invoices" element={wrap(InvoiceList, "Nota Penjualan")} />
        <Route path="/sales" element={wrap(SalesOrderList, "Nota Penjualan")} />
        <Route path="/customers" element={wrap(CustomerList, "Customers")} />
        <Route
          path="/inventory"
          element={wrap(InventoryDashboard, "Inventory")}
        />
        <Route
          path="/orders"
          element={wrap(PurchaseOrderList, "Surat Pesanan")}
        />
        <Route
          path="/online-store"
          element={wrap(OnlineStoreDashboard, "Toko Online")}
        />
        <Route path="/ledger" element={wrap(LedgerPage, "Buku Besar")} />
        <Route
          path="/print-settings"
          element={wrap(PrintSettings, "Settings")}
        />
        <Route path="/bugs" element={wrap(BugReports, "Bug Reports")} />
        <Route
          path="/"
          element={<Navigate to={token ? "/dashboard" : "/login"} />}
        />
      </Routes>
    </Suspense>
  );
}

function App() {
  // Init dark mode dari localStorage (persist antar sesi, juga aktif di Login page sebelum auth)
  const [isDarkMode, setIsDarkModeState] = useState(() => {
    try {
      return localStorage.getItem("habil_dark_mode") === "1";
    } catch {
      return false;
    }
  });
  const setIsDarkMode = (val) => {
    const next = typeof val === "function" ? val(isDarkMode) : val;
    setIsDarkModeState(next);
    try {
      localStorage.setItem("habil_dark_mode", next ? "1" : "0");
    } catch {}
  };
  // Vanta.js animated background (v1.8.6) — theme-aware FOG effect, always ON
  // Auto-disable only via: ?vanta=off URL / prefers-reduced-motion / deviceMemory<4. No UI toggle.
  const [vantaRef, isVantaMode] = useVantaBackground(isDarkMode);
  const reducedMotion = useReducedMotion();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const isMobile = useIsMobile();

  // Sync `dark` class ke body supaya token dark mode global konsisten
  useEffect(() => {
    try {
      if (isDarkMode) document.body.classList.add("dark");
      else document.body.classList.remove("dark");
    } catch {}
  }, [isDarkMode]);

  useEffect(() => {
    if (reducedMotion || typeof document === "undefined") return undefined;

    const selector = '.btn-primary[data-magnetic="true"]';
    let activeButton = null;

    const resetButton = (button) => {
      if (!button) return;
      button.style.removeProperty("--magnetic-x");
      button.style.removeProperty("--magnetic-y");
      button.style.removeProperty("--magnetic-scale");
    };

    const updateButton = (button, clientX, clientY) => {
      const rect = button.getBoundingClientRect();
      const maxX = Math.min(8, Math.max(4, rect.width * 0.08));
      const maxY = Math.min(6, Math.max(3, rect.height * 0.08));
      const offsetX =
        ((clientX - (rect.left + rect.width / 2)) / (rect.width / 2)) * maxX;
      const offsetY =
        ((clientY - (rect.top + rect.height / 2)) / (rect.height / 2)) * maxY;

      button.style.setProperty(
        "--magnetic-x",
        `${Math.max(-maxX, Math.min(maxX, offsetX)).toFixed(2)}px`,
      );
      button.style.setProperty(
        "--magnetic-y",
        `${Math.max(-maxY, Math.min(maxY, offsetY)).toFixed(2)}px`,
      );
      button.style.setProperty("--magnetic-scale", "1.01");
    };

    const clearActive = () => {
      resetButton(activeButton);
      activeButton = null;
    };

    const handlePointerMove = (event) => {
      if (
        event.pointerType &&
        event.pointerType !== "mouse" &&
        event.pointerType !== "pen"
      ) {
        clearActive();
        return;
      }

      const target =
        event.target instanceof Element ? event.target.closest(selector) : null;

      if (target !== activeButton) {
        clearActive();
        activeButton = target;
      }

      if (!target) return;
      updateButton(target, event.clientX, event.clientY);
    };

    const handlePointerOut = (event) => {
      if (!activeButton) return;
      if (!(event.target instanceof Node)) return;
      if (event.target !== activeButton && !activeButton.contains(event.target))
        return;
      if (event.relatedTarget && activeButton.contains(event.relatedTarget))
        return;
      clearActive();
    };

    const handleWindowBlur = clearActive;
    const handleVisibility = () => {
      if (document.hidden) clearActive();
    };

    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerout", handlePointerOut, true);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearActive();
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerout", handlePointerOut, true);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [reducedMotion]);

  return (
    <AuthProvider>
      <Router>
        {/* Vanta canvas behind everything — pointer-events: none di CSS */}
        <div ref={vantaRef} id="vanta-bg" />
        <div
          className={`app-content transition-colors duration-300 ${isDarkMode ? "dark" : ""}`}
          style={{
            backgroundColor: isVantaMode ? "transparent" : "var(--color-bg)",
          }}
        >
          <AppRoutes
            isDarkMode={isDarkMode}
            setIsDarkMode={setIsDarkMode}
            isVantaMode={isVantaMode}
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen}
            isMobile={isMobile}
          />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
