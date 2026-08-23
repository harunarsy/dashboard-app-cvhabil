import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "./Login";
import { AuthContext } from "../context/AuthContext";

vi.mock("./common/Tooltip", () => ({
  __esModule: true,
  default: ({ children }) => <>{children}</>,
}));

function renderLogin() {
  const login = vi.fn();
  render(
    <AuthContext.Provider
      value={{ user: null, token: null, login, logout: vi.fn(), loading: false }}
    >
      <MemoryRouter>
        <Login isDarkMode={false} setIsDarkMode={vi.fn()} />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return { login };
}

describe("Login accessibility", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  test("associates visible labels with both credential fields", () => {
    renderLogin();

    expect(screen.getByLabelText("Username")).toHaveAttribute(
      "autocomplete",
      "username",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
  });

  test("announces empty credentials and focuses the first invalid field", () => {
    const { login } = renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "Masuk" }));

    const error = screen.getByRole("alert");
    const username = screen.getByLabelText("Username");
    const password = screen.getByLabelText("Password");

    expect(error).toHaveTextContent("Username dan password wajib diisi.");
    expect(username).toHaveFocus();
    expect(username).toHaveAttribute("aria-describedby", "login-error");
    expect(password).toHaveAttribute("aria-describedby", "login-error");
    expect(login).not.toHaveBeenCalled();
  });
});
