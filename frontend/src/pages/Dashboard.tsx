import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { useNavigate } from "react-router-dom";
import MobileLayout from "@/components/MobileLayout";
import { MapPin, Droplets, Cloud, Wind, Bug, Sprout, Globe, Check, Sun, Mic, CloudRain, CloudDrizzle, CloudSnow, CloudLightning, CloudFog, CloudSun, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { weatherAPI } from "@/services/api";
import { t } from "@/lib/i18n";
import { toast } from "sonner";
import dashboardHero from "@/assets/dashboard-hero.jpg";

interface ForecastDay {
  date: string;
  tempMax: number;
  tempMin: number;
  precipitation: number;
  condition: string;
  weatherCode: number;
}

interface WeatherState {
  location: string;
  temp: number;
  feelsLike: number;
  condition: string;
  humidity: number;
  precipitation: number;
  wind: number;
  uvIndex: number;
  weatherCode: number;
  forecast: ForecastDay[];
}

const defaultWeather: WeatherState = {
  location: "Visakhapatnam, Andhra Pradesh",
  temp: 28,
  feelsLike: 30,
  condition: "Clear sky",
  humidity: 65,
  precipitation: 0,
  wind: 12,
  uvIndex: 0,
  weatherCode: 0,
  forecast: [],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapWeatherData(data: any): WeatherState {
  return {
    location: data.location || defaultWeather.location,
    temp: data.temperature ?? defaultWeather.temp,
    feelsLike: data.feelsLike ?? defaultWeather.feelsLike,
    condition: data.condition || defaultWeather.condition,
    humidity: data.humidity ?? defaultWeather.humidity,
    precipitation: data.precipitation ?? defaultWeather.precipitation,
    wind: data.windSpeed ?? defaultWeather.wind,
    uvIndex: data.uvIndex ?? defaultWeather.uvIndex,
    weatherCode: data.weatherCode ?? 0,
    forecast: Array.isArray(data.forecast) ? data.forecast : [],
  };
}

const DAY_KEYS = ['day_sun', 'day_mon', 'day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat'];

const languages = [
  { code: "en" as const, name: "English", native: "English", flag: "🇬🇧" },
  { code: "hi" as const, name: "Hindi", native: "हिंदी", flag: "🇮🇳" },
  { code: "te" as const, name: "Telugu", native: "తెలుగు", flag: "🇮🇳" },
];

function getWeatherIcon(code: number, className: string) {
  // WMO Weather interpretation codes
  if (code === 0 || code === 1) return <Sun className={className} />;
  if (code === 2) return <CloudSun className={className} />;
  if (code === 3) return <Cloud className={className} />;
  if (code === 45 || code === 48) return <CloudFog className={className} />;
  if (code >= 51 && code <= 57) return <CloudDrizzle className={className} />;
  if (code >= 61 && code <= 67) return <CloudRain className={className} />;
  if (code >= 71 && code <= 77) return <CloudSnow className={className} />;
  if (code >= 80 && code <= 82) return <CloudRain className={className} />;
  if (code >= 85 && code <= 86) return <CloudSnow className={className} />;
  if (code >= 95) return <CloudLightning className={className} />;
  return <Cloud className={className} />;
}

function getForecastIcon(code: number, className: string) {
  return getWeatherIcon(code, className);
}

const Dashboard = () => {
  const { user } = useAuth();
  const { language, setLanguage, coords } = useApp();
  const navigate = useNavigate();
  const [showLangModal, setShowLangModal] = useState(false);
  const [weatherData, setWeatherData] = useState(defaultWeather);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherFallback, setWeatherFallback] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const cancelledRef = useRef(false);
  const hasFetched = useRef(false);

  const doFetchWeather = (lat: number, lng: number) => {
    weatherAPI.getCurrentWeather(lat, lng).then(data => {
      if (cancelledRef.current) return;
      if (data) {
        setWeatherData(mapWeatherData(data));
        setWeatherFallback(false);
      }
      setWeatherLoading(false);
    }).catch((err) => {
      if (cancelledRef.current) return;
      console.error('Weather fetch failed:', err.message);
      setWeatherFallback(true);
      setWeatherLoading(false);
      toast.error("Weather data unavailable. Showing defaults.");
    });
  };

  // Use cached coords from AppContext — no direct geolocation call
  useEffect(() => {
    cancelledRef.current = false;
    if (!coords || hasFetched.current) return;
    hasFetched.current = true;
    doFetchWeather(coords.lat, coords.lng);
    return () => { cancelledRef.current = true; };
  }, [coords]);

  const refreshWeather = () => {
    if (!coords || cancelledRef.current) return;
    setRefreshing(true);
    setWeatherFallback(false);
    weatherAPI.getCurrentWeather(coords.lat, coords.lng).then(data => {
      if (cancelledRef.current) return;
      if (data) {
        setWeatherData(mapWeatherData(data));
        setWeatherFallback(false);
      }
      setRefreshing(false);
    }).catch(() => {
      if (cancelledRef.current) return;
      setWeatherFallback(true);
      setRefreshing(false);
    });
  };

  const activities = [
    { icon: Bug, title: t('disease_detection', language), sub: t('take_photo', language), badge: "Scan", badgeColor: "bg-accent/20 text-accent", link: "/disease-detection" },
    { icon: Sprout, title: t('crop_recommendation', language), sub: t('get_ai_suggestions', language), badge: "AP Crops", badgeColor: "bg-sky/20 text-sky", link: "/crop-recommendation" },
    { icon: MapPin, title: t('local_stores', language), sub: t('find_stores', language), badge: t('open', language), badgeColor: "bg-accent/20 text-accent", link: "/stores" },
    { icon: Mic, title: t('voice_assistant', language), sub: t('ask_anything', language), badge: "AI", badgeColor: "bg-purple-100 text-purple-600", link: "/voice-assistant" },
    { icon: Globe, title: t('language', language), sub: languages.find(l => l.code === language)?.native || "English", badge: "Change", badgeColor: "bg-muted text-muted-foreground", link: null },
  ];

  const handleActivityClick = (link: string | null) => {
    if (link) navigate(link);
    else setShowLangModal(true);
  };

  return (
    <MobileLayout>
      {/* Hero background */}
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
        </div>

        {/* Weather Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`glass-card rounded-3xl p-5 text-primary-foreground mb-5 ${weatherLoading ? 'animate-pulse' : ''}`}
        >
          <div className="flex items-center gap-1.5 text-xs opacity-80 mb-3">
            <MapPin className="h-3.5 w-3.5" />
            <span className="flex-1">{weatherData.location}</span>
            {weatherFallback && <span className="text-[11px] text-orange-300">(offline)</span>}
            <button onClick={refreshWeather} disabled={refreshing} className="opacity-60 hover:opacity-100 transition-opacity ml-1">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-5xl font-bold">{weatherData.temp}°</p>
              <p className="text-sm opacity-80 mt-1">{weatherData.condition}</p>
              <p className="text-xs opacity-60 mt-0.5">{t('feels_like', language)} {weatherData.feelsLike}°</p>
            </div>
            {getWeatherIcon(weatherData.weatherCode, "h-14 w-14 opacity-70")}
          </div>
          <div className="grid grid-cols-3 gap-3 rounded-2xl bg-primary-foreground/10 p-3">
            <div className="flex flex-col items-center gap-1">
              <Droplets className="h-4 w-4 opacity-70" />
              <span className="text-xs opacity-70">{t('humidity', language)}</span>
              <span className="text-sm font-semibold">{weatherData.humidity}%</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Sun className="h-4 w-4 opacity-70" />
              <span className="text-xs opacity-70">{t('uv_index', language)}</span>
              <span className="text-sm font-semibold">{weatherData.uvIndex}</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Wind className="h-4 w-4 opacity-70" />
              <span className="text-xs opacity-70">{t('wind', language)}</span>
              <span className="text-sm font-semibold">{weatherData.wind} km/h</span>
            </div>
          </div>
          {weatherData.forecast.length > 0 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {weatherData.forecast.slice(0, 7).map((day, i) => {
                const d = new Date(day.date + 'T00:00:00');
                const label = i === 0 ? t('today', language) : t(DAY_KEYS[d.getDay()], language);
                return (
                  <div key={day.date} className="flex flex-col items-center gap-0.5 rounded-xl bg-primary-foreground/10 px-2.5 py-2 min-w-[52px]">
                    <span className="text-[10px] opacity-70">{label}</span>
                    {getForecastIcon(day.weatherCode, "h-3.5 w-3.5 opacity-70")}
                    <span className="text-xs font-semibold">{day.tempMax}°</span>
                    <span className="text-[10px] opacity-60">{day.tempMin}°</span>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Activity Tiles */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground">{t('recent_activity', language)}</h3>
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
