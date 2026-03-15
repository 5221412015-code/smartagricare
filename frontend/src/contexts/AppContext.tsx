import React, { createContext, useContext, useState, useEffect } from "react";

type Language = "en" | "hi" | "te";

interface Coords {
  lat: number;
  lng: number;
  timestamp: number;
}

interface AppContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  coords: Coords | null;
  setCoords: (lat: number, lng: number) => void;
  coordsLoading: boolean;
}

const AppContext = createContext<AppContextType | null>(null);

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
};

const COORDS_MAX_AGE = 10 * 60 * 1000; // 10 minutes
const FALLBACK_LAT = 17.6868;
const FALLBACK_LNG = 83.2185;

function loadCachedCoords(): Coords | null {
  try {
    const stored = sessionStorage.getItem("smartagricare_coords");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && Date.now() - parsed.timestamp < COORDS_MAX_AGE) return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(
    () => {
      try {
        const stored = localStorage.getItem("smartagricare_lang");
        if (stored === "en" || stored === "hi" || stored === "te") return stored;
        return "en";
      } catch {
        return "en";
      }
    }
  );

  const [coords, setCoordsState] = useState<Coords | null>(loadCachedCoords);
  const [coordsLoading, setCoordsLoading] = useState(() => !coords);

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    try { localStorage.setItem("smartagricare_lang", lang); } catch { /* quota exceeded */ }
  };

  const setCoords = (lat: number, lng: number) => {
    const c: Coords = { lat, lng, timestamp: Date.now() };
    setCoordsState(c);
    setCoordsLoading(false);
    try { sessionStorage.setItem("smartagricare_coords", JSON.stringify(c)); } catch { /* ignore */ }
  };

  // Listen for native location from Android WebView (injected by Expo App.js)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'NATIVE_LOCATION' && data.coords) {
          setCoords(data.coords.latitude, data.coords.longitude);
        }
      } catch { /* ignore non-JSON messages */ }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // One-time geolocation on app init
  useEffect(() => {
    if (coords) { setCoordsLoading(false); return; }
    if (!navigator.geolocation) {
      setCoords(FALLBACK_LAT, FALLBACK_LNG);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => setCoords(pos.coords.latitude, pos.coords.longitude),
      () => setCoords(FALLBACK_LAT, FALLBACK_LNG),
      { timeout: 5000, enableHighAccuracy: false }
    );
  }, []);

  return (
    <AppContext.Provider value={{
      language, setLanguage: handleSetLanguage,
      coords, setCoords, coordsLoading,
    }}>
      {children}
    </AppContext.Provider>
  );
};
