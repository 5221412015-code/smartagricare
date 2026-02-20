import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { useNavigate } from "react-router-dom";
import MobileLayout from "@/components/MobileLayout";
import { Bell, MapPin, Droplets, Cloud, Wind, Bug, Sprout, Globe, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { weatherAPI } from "@/services/api";
import { t } from "@/lib/i18n";
import dashboardHero from "@/assets/dashboard-hero.jpg";

const defaultWeather = {
  location: "Andhra Pradesh, India",
  temp: 28,
  condition: "Clear sky",
  humidity: 65,
  precipitation: 0,
  wind: 12,
};

const languages = [
  { code: "en" as const, name: "English", native: "English", flag: "🇬🇧" },
  { code: "hi" as const, name: "Hindi", native: "हिंदी", flag: "🇮🇳" },
  { code: "te" as const, name: "Telugu", native: "తెలుగు", flag: "🇮🇳" },
];

const Dashboard = () => {
  const { user } = useAuth();
  const { language, setLanguage } = useApp();
  const navigate = useNavigate();
  const [showLangModal, setShowLangModal] = useState(false);
  const [weatherData, setWeatherData] = useState(defaultWeather);

  useEffect(() => {
    // Get user's real location for weather
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          fetchWeather(pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          // Fallback to AP center if location denied
          fetchWeather(15.9129, 79.74);
        },
        { timeout: 5000 }
      );
    } else {
      fetchWeather(15.9129, 79.74);
    }
  }, []);

  const fetchWeather = (lat: number, lng: number) => {
    weatherAPI.getCurrentWeather(lat, lng).then(data => {
      if (data) setWeatherData({
        location: data.location || defaultWeather.location,
        temp: data.temperature ?? defaultWeather.temp,
        condition: data.condition || defaultWeather.condition,
        humidity: data.humidity ?? defaultWeather.humidity,
        precipitation: data.precipitation ?? defaultWeather.precipitation,
        wind: data.windSpeed ?? defaultWeather.wind,
      });
    }).catch((err) => {
      console.error('Weather fetch failed:', err.message);
    });
  };

  const activities = [
    { icon: Bug, title: t('disease_detection', language), sub: t('take_photo', language), badge: "Scan", badgeColor: "bg-accent/20 text-accent", link: "/disease-detection" },
    { icon: Sprout, title: t('crop_recommendation', language), sub: t('get_ai_suggestions', language), badge: "AP Crops", badgeColor: "bg-sky/20 text-sky", link: "/crop-recommendation" },
    { icon: MapPin, title: t('local_stores', language), sub: t('find_stores', language), badge: t('open', language), badgeColor: "bg-accent/20 text-accent", link: "/stores" },
    { icon: Globe, title: t('language', language), sub: languages.find(l => l.code === language)?.native || "English", badge: "Change", badgeColor: "bg-muted text-muted-foreground", link: null },
  ];

  const handleActivityClick = (link: string | null) => {
    if (link) navigate(link);
    else setShowLangModal(true);
  };

  return (
    <MobileLayout>
      {/* Hero background — fills top, no white gap */}
      <div className="relative">
        <img src={dashboardHero} alt="" className="absolute inset-x-0 top-0 h-56 w-full object-cover" />
        <div className="absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-background/10 via-background/60 to-background" />
      </div>

      <div className="px-5 pt-4 relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">{t('hi_user', language, { name: user?.name || 'Farmer' })}</h2>
            <p className="text-sm text-muted-foreground">{t('welcome_back', language)}</p>
          </div>
          <button className="flex h-10 w-10 items-center justify-center rounded-full bg-card shadow-card">
            <Bell className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Weather Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-3xl p-5 text-primary-foreground mb-5"
        >
          <div className="flex items-center gap-1.5 text-xs opacity-80 mb-3">
            <MapPin className="h-3.5 w-3.5" />
            <span>{weatherData.location}</span>
          </div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-5xl font-bold">{weatherData.temp}°</p>
              <p className="text-sm opacity-80 mt-1">{weatherData.condition}</p>
            </div>
            <Cloud className="h-14 w-14 opacity-70" />
          </div>
          <div className="grid grid-cols-3 gap-3 rounded-2xl bg-primary-foreground/10 p-3">
            <div className="flex flex-col items-center gap-1">
              <Droplets className="h-4 w-4 opacity-70" />
              <span className="text-xs opacity-70">{t('humidity', language)}</span>
              <span className="text-sm font-semibold">{weatherData.humidity}%</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Cloud className="h-4 w-4 opacity-70" />
              <span className="text-xs opacity-70">{t('precipitation', language)}</span>
              <span className="text-sm font-semibold">{weatherData.precipitation} mm</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Wind className="h-4 w-4 opacity-70" />
              <span className="text-xs opacity-70">{t('wind', language)}</span>
              <span className="text-sm font-semibold">{weatherData.wind} km/h</span>
            </div>
          </div>
        </motion.div>

        {/* Activity Tiles */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground">{t('recent_activity', language)}</h3>
          <button className="text-xs text-accent font-medium">{t('see_all', language)}</button>
        </div>

        <div className="space-y-3 pb-4">
          {activities.map((a, i) => (
            <motion.button
              key={a.title}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              onClick={() => handleActivityClick(a.link)}
              className="flex w-full items-center gap-4 rounded-2xl bg-card p-4 shadow-card text-left transition-transform active:scale-[0.98]"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                <a.icon className="h-6 w-6 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{a.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.sub}</p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${a.badgeColor}`}>{a.badge}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Language Modal */}
      <AnimatePresence>
        {showLangModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end justify-center bg-foreground/40 backdrop-blur-sm"
            onClick={() => setShowLangModal(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md rounded-t-3xl bg-card p-6 shadow-elevated"
            >
              <h2 className="text-lg font-bold text-foreground mb-1">{t('choose_language', language)}</h2>
              <p className="text-sm text-muted-foreground mb-5">{t('tap_to_apply', language)}</p>
              <div className="flex flex-col gap-3">
                {languages.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setLanguage(lang.code);
                      setShowLangModal(false);
                    }}
                    className={`flex items-center gap-4 rounded-2xl border-2 px-4 py-3 text-left transition-all ${language === lang.code ? "border-accent bg-accent/5" : "border-border bg-background"
                      }`}
                  >
                    <span className="text-2xl">{lang.flag}</span>
                    <div className="flex-1">
                      <p className="font-semibold text-foreground">{lang.native}</p>
                      <p className="text-xs text-muted-foreground">{lang.name}</p>
                    </div>
                    {language === lang.code && (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent">
                        <Check className="h-3.5 w-3.5 text-accent-foreground" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </MobileLayout>
  );
};

export default Dashboard;
