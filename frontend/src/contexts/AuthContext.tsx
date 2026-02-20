import React, { createContext, useContext, useState, useCallback } from "react";
import { authAPI } from "@/services/api";

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  location?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (fields: Partial<Omit<User, 'id' | 'email'>>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("smartagricare_user");
    return saved ? JSON.parse(saved) : null;
  });

  const login = useCallback(async (email: string, password: string) => {
    const data = await authAPI.login(email, password);
    if (!data.success) throw new Error(data.error || "Login failed");
    const u = { ...data.user, id: String(data.user.id) };
    setUser(u);
    localStorage.setItem("smartagricare_user", JSON.stringify(u));
    if (data.token) localStorage.setItem("smartagricare_token", data.token);
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const data = await authAPI.register(name, email, password);
    if (!data.success) throw new Error(data.error || "Registration failed");
    if (!data.user?.id) throw new Error("Registration failed: no user ID returned");
    const u: User = {
      id: String(data.user.id),
      name: data.user?.name || name,
      email: data.user?.email || email,
      location: "Andhra Pradesh, India",
    };
    setUser(u);
    localStorage.setItem("smartagricare_user", JSON.stringify(u));
    if (data.token) {
      localStorage.setItem("smartagricare_token", data.token);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem("smartagricare_user");
    localStorage.removeItem("smartagricare_token");
  }, []);

  const updateUser = useCallback((fields: Partial<Omit<User, 'id' | 'email'>>) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...fields };
      localStorage.setItem("smartagricare_user", JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, signup, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};
