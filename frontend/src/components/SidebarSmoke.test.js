import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import Sidebar from "./Sidebar";
import { AuthContext } from "../context/AuthContext";
import api from "../services/api";

jest.mock("react-router-dom", () => {
  const React = require("react");
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
}, { virtual: true });

jest.mock("../services/api", () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

jest.mock("./common/Tooltip", () => ({
  __esModule: true,
  default: ({ children }) => <>{children}</>,
}));

jest.mock("./common/Icon", () => {
  const React = require("react");
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

const { MemoryRouter, useLocation } = require("react-router-dom");

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
        login: jest.fn(),
        logout: jest.fn(),
        loading: false,
      }}
    >
      <MemoryRouter initialEntries={[initialEntry]}>
        <Sidebar
          isDarkMode={false}
          setIsDarkMode={jest.fn()}
          isSidebarOpen={true}
          setIsSidebarOpen={jest.fn()}
        />
        <PathProbe />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("Sidebar shell smoke", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1280,
      writable: true,
    });
  });

  test("navigates between shell routes without DB writes", async () => {
    renderSidebar();

    expect(screen.getByTestId("current-path")).toHaveTextContent("/dashboard");

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
});
