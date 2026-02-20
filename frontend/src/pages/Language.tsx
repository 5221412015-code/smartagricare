import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { Check } from "lucide-react";
import { motion } from "framer-motion";

const languages = [
  { code: "en" as const, name: "English", native: "English", flag: "🇬🇧" },
  { code: "hi" as const, name: "Hindi", native: "हिंदी", flag: "🇮🇳" },
  { code: "te" as const, name: "Telugu", native: "తెలుగు", flag: "🇮🇳" },
];

const Language = () => {
  const { language, setLanguage } = useApp();
  const [selected, setSelected] = useState(language);
  const navigate = useNavigate();

  const handleContinue = () => {
    setLanguage(selected);
    navigate("/auth");
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 gradient-mint">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-2xl font-bold text-foreground">Choose Your Language</h1>
        <p className="mb-8 text-center text-sm text-muted-foreground">Select your preferred language</p>

        <div className="flex flex-col gap-3">
          {languages.map((lang, i) => (
            <motion.button
              key={lang.code}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => setSelected(lang.code)}
              className={`flex items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left transition-all shadow-card bg-card ${
                selected === lang.code ? "border-accent bg-accent/5" : "border-transparent"
              }`}
            >
              <span className="text-3xl">{lang.flag}</span>
              <div className="flex-1">
                <p className="font-semibold text-foreground">{lang.native}</p>
                <p className="text-sm text-muted-foreground">{lang.name}</p>
              </div>
              {selected === lang.code && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent">
                  <Check className="h-4 w-4 text-accent-foreground" />
                </div>
              )}
            </motion.button>
          ))}
        </div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          onClick={handleContinue}
          className="mt-8 w-full rounded-xl bg-primary py-4 text-center font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
        >
          Continue
        </motion.button>
      </motion.div>
    </div>
  );
};

export default Language;
