import React, { createContext, useContext, useState } from "react";

type Language = "en" | "hi" | "te";

interface AppContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(
    () => (localStorage.getItem("smartagricare_lang") as Language) || "en"
  );

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem("smartagricare_lang", lang);
  };

  return (
    <AppContext.Provider value={{ language, setLanguage: handleSetLanguage }}>
      {children}
    </AppContext.Provider>
  );
};
