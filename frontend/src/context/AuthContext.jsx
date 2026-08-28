/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useState, useEffect } from "react";

import { apiRequest } from "@/api/client";

const AuthContext = createContext(null);

function getStoredSession() {
  try {
    const admin = window.localStorage.getItem("sacco_admin");
    const token = window.localStorage.getItem("sacco_token");

    if (!token || !admin) return null;

    const payload = JSON.parse(window.atob(token.split(".")[1]));

    if (payload.exp && payload.exp * 1000 <= Date.now()) {
      window.localStorage.removeItem("sacco_token");
      window.localStorage.removeItem("sacco_admin");
      return null;
    }

    return { token, admin: JSON.parse(admin) };
  } catch {
    window.localStorage.removeItem("sacco_token");
    window.localStorage.removeItem("sacco_admin");
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(getStoredSession);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    function handleSessionExpired() {
      window.localStorage.removeItem("sacco_token");
      window.localStorage.removeItem("sacco_admin");
      setSession(null);
      setSessionExpired(true);
    }

    window.addEventListener("auth:session-expired", handleSessionExpired);

    return () => {
      window.removeEventListener("auth:session-expired", handleSessionExpired);
    };
  }, []);

  useEffect(() => {
    if (!session?.token) return;

    try {
      const payload = JSON.parse(window.atob(session.token.split(".")[1]));

      if (!payload.exp) return;

      const remainingTime = payload.exp * 1000 - Date.now();

      if (remainingTime <= 0) {
        window.dispatchEvent(new Event("auth:session-expired"));
        return;
      }

      const timer = window.setTimeout(() => {
        window.dispatchEvent(new Event("auth:session-expired"));
      }, remainingTime);

      return () => window.clearTimeout(timer);
    } catch {
      window.dispatchEvent(new Event("auth:session-expired"));
    }
  }, [session]);

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
    setSessionExpired(false);
    return nextSession;
  }
  function clearSessionExpired() {
    setSessionExpired(false);
  }

  function logout() {
    try {
      window.localStorage.removeItem("sacco_token");
      window.localStorage.removeItem("sacco_admin");
      setSession(null);
      setSessionExpired(false);
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
        sessionExpired,
        clearSessionExpired,
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
