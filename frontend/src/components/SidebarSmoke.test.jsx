import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import Sidebar from "./Sidebar";
import { AuthContext } from "../context/AuthContext";
import api from "../services/api";
import { MemoryRouter, useLocation } from "react-router-dom";

vi.mock("react-router-dom", async () => {
  const React = await import("react");
  const RouterContext = React.createContext({
    pathname: "/dashboard",
    navigate: () => {},
  });

  const MemoryRouter = ({ initialEntries = ["/dashboard"], children }) => {
    const [pathname, setPathname] = React.useState(initialEntries[0]);
    const value = React.useMemo(
      () => ({
        pathname,
        navigate: (nextPath) => setPathname(nextPath),
      }),
      [pathname],
    );

    return (
      <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
    );
  };

  const useLocation = () => React.useContext(RouterContext);
  const useNavigate = () => React.useContext(RouterContext).navigate;

  return {
    __esModule: true,
    MemoryRouter,
    useLocation,
    useNavigate,
  };
});

vi.mock("../services/api", () => ({
  __esModule: true,
  default: {
    post: vi.fn(),
  },
}));

vi.mock("./common/Tooltip", () => ({
  __esModule: true,
  default: ({ children }) => <>{children}</>,
}));

vi.mock("./common/Icon", () => {
  const MockIcon = (props) => <svg data-testid="mock-icon" {...props} />;
  const icons = new Proxy(
    {},
    {
      get: () => MockIcon,
    },
  );

  return {
    __esModule: true,
    default: icons,
  };
});

function PathProbe() {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
}

function renderSidebar(initialEntry = "/dashboard") {
  return render(
    <AuthContext.Provider
      value={{
        user: { role: "direktur", username: "direktur" },
        token: "token",
        login: vi.fn(),
        logout: vi.fn(),
        loading: false,
      }}
    >
      <MemoryRouter initialEntries={[initialEntry]}>
        <Sidebar
          isDarkMode={false}
          setIsDarkMode={vi.fn()}
          isSidebarOpen={true}
          setIsSidebarOpen={vi.fn()}
        />
        <PathProbe />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("Sidebar shell smoke", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
      writable: true,
    });
  });

  test("navigates between shell routes without DB writes", async () => {
    renderSidebar();

    expect(screen.getByTestId("current-path")).toHaveTextContent("/dashboard");
    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    fireEvent.click(screen.getByRole("button", { name: "Inventory" }));

    await waitFor(() => {
      expect(screen.getByTestId("current-path")).toHaveTextContent(
        "/inventory",
      );
    });

    expect(api.post).not.toHaveBeenCalled();
  });

  test("logout clears local token and returns to login", async () => {
    localStorage.setItem("token", "keep");
    renderSidebar("/inventory");

    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => {
      expect(screen.getByTestId("current-path")).toHaveTextContent("/login");
    });

    expect(localStorage.getItem("token")).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });

  test("opens the bug report as a keyboard-dismissible dialog", async () => {
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: "Bug / Saran Fitur" }));

    const dialog = screen.getByRole("dialog", { name: "📢 Kirim Laporan" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tutup laporan" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
