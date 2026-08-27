/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useState } from "react";

import { apiRequest } from "@/api/client";

const AuthContext = createContext(null);

function getStoredSession() {
  try {
    const admin = window.localStorage.getItem("sacco_admin");
    const token = window.localStorage.getItem("sacco_token");
    if (!token || !admin) return null;
    const payload = JSON.parse(window.atob(token.split(".")[1]));
    if (payload.exp && payload.exp * 1000 <= Date.now()) return null;
    return { token, admin: JSON.parse(admin) };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(getStoredSession);

  async function login(credentials) {
    const nextSession = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    window.localStorage.setItem("sacco_token", nextSession.token);
    window.localStorage.setItem(
      "sacco_admin",
      JSON.stringify(nextSession.admin),
    );
    setSession(nextSession);
    return nextSession;
  }

  function logout() {
    try {
      window.localStorage.removeItem("sacco_token");
      window.localStorage.removeItem("sacco_admin");
      setSession(null);
    } catch {
      throw new Error("Logout failed");
    }
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        admin: session?.admin ?? null,
        isAuthenticated: Boolean(session),
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
