import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";

function ProtectedRoute() {
  const { isAuthenticated, sessionExpired } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location,
          sessionExpired,
        }}
      />
    );
  }

  return <Outlet />;
}

export default ProtectedRoute;
