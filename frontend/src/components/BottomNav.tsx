import { useLocation, useNavigate } from "react-router-dom";
import { Home, Wheat, Plus, Mic, MapPin, ScanLine, User } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [fabOpen, setFabOpen] = useState(false);
  const { language } = useApp();

  const navItems = [
    { icon: Home, label: t('nav_home', language), path: "/dashboard" },
    { icon: Wheat, label: t('nav_crop_rec', language), path: "/crop-recommendation" },
    null, // center FAB placeholder
    { icon: ScanLine, label: t('nav_scan', language), path: "/disease-detection" },
    { icon: User, label: t('nav_profile', language), path: "/profile" },
  ];

  const fabActions = [
    { icon: MapPin, label: t('nav_find_stores', language), path: "/stores" },
    { icon: Mic, label: t('nav_voice', language), path: "/voice-assistant" },
  ];

  return (
    <>
      <AnimatePresence>
        {fabOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setFabOpen(false)}
          >
            <div className="absolute bottom-32 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
              {fabActions.map((action, i) => (
                <motion.button
                  key={action.path}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}
                  exit={{ opacity: 0, y: 20 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFabOpen(false);
                    navigate(action.path);
                  }}
                  className="flex items-center gap-3 rounded-2xl bg-card px-5 py-3 shadow-elevated"
                >
                  <action.icon className="h-5 w-5 text-accent" />
                  <span className="text-sm font-medium text-foreground">{action.label}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="fixed bottom-0 inset-x-0 z-50 bg-card border-t border-border safe-bottom">
        <div className="mx-auto flex max-w-md items-center justify-around h-[68px]">
          {navItems.map((item, i) => {
            if (!item) {
              return (
                <div key="fab" className="relative -mt-8">
                  <button
                    onClick={() => setFabOpen(!fabOpen)}
                    className="flex h-16 w-16 items-center justify-center rounded-full gradient-leaf shadow-elevated transition-transform active:scale-95"
                  >
                    <Plus className={`h-7 w-7 text-accent-foreground transition-transform ${fabOpen ? "rotate-45" : ""}`} />
                  </button>
                </div>
              );
            }
            const active = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center gap-1 min-w-[48px] min-h-[48px] justify-center"
              >
                <item.icon className={`h-5 w-5 transition-colors ${active ? "text-primary" : "text-muted-foreground"}`} />
                <span className={`text-[11px] transition-colors ${active ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                  {item.label}
                </span>
                {active && <div className="h-1 w-4 rounded-full bg-primary mt-0.5" />}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};

export default BottomNav;
