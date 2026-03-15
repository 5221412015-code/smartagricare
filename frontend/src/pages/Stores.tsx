import { useState, useEffect, useRef, useMemo } from "react";
import { storeAPI } from "@/services/api";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";
import MobileLayout from "@/components/MobileLayout";
import { MapPin, Navigation, Search, Star, ShoppingBag, ExternalLink, Map, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

interface Store {
  id: number;
  name: string;
  category: string;
  rating: string;
  distance: string;
  distanceKm: number;
  address: string;
  open: boolean | null;
  lat: number;
  lng: number;
}

const StoreSkeleton = () => (
  <div className="rounded-2xl bg-card p-4 shadow-card animate-pulse">
    <div className="flex items-start gap-3 mb-3">
      <div className="h-10 w-10 rounded-xl bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
      </div>
      <div className="h-5 w-12 rounded-full bg-muted" />
    </div>
    <div className="flex items-center gap-3 mb-3">
      <div className="h-3 w-8 rounded bg-muted" />
      <div className="h-3 w-2/3 rounded bg-muted" />
    </div>
    <div className="h-10 w-full rounded-xl bg-muted" />
  </div>
);

const MapSkeleton = ({ language }: { language: string }) => (
  <div className="rounded-2xl overflow-hidden border border-border shadow-card">
    <div className="h-[220px] w-full bg-muted animate-pulse flex items-center justify-center">
      <Map className="h-8 w-8 text-muted-foreground/30" />
    </div>
    <p className="text-center text-[10px] text-muted-foreground py-1.5 bg-card animate-pulse">
      {t('loading_map', language)}
    </p>
  </div>
);

const Stores = () => {
  const { language, coords, coordsLoading } = useApp();
  const languageRef = useRef(language);
  languageRef.current = language;
  const [stores, setStores] = useState<Store[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showMap, setShowMap] = useState(true);

  const isMounted = useRef(true);
  const hasFetched = useRef(false);
  const lastNativeUpdate = useRef(0);

  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  const fetchStores = async (lat: number, lng: number) => {
    if (!isMounted.current) return;
    setLoading(true);
    try {
      const data = await storeAPI.getNearbyStores(lat, lng);
      if (isMounted.current) setStores(data?.stores || []);
    } catch {
      if (isMounted.current) {
        setStores([]);
        toast.error(t('stores_fetch_error', languageRef.current));
      }
    }
    if (isMounted.current) setLoading(false);
  };

  // Fetch stores when cached coords become available (one-time)
  useEffect(() => {
    if (!coords || hasFetched.current) return;
    hasFetched.current = true;
    fetchStores(coords.lat, coords.lng);
  }, [coords]);

  // If coords never arrive (shouldn't happen), stop loading
  useEffect(() => {
    if (!coordsLoading && !coords && isMounted.current) {
      setLoading(false);
    }
  }, [coordsLoading, coords]);

  // Native GPS message handler (Expo wrapper) with throttle
  useEffect(() => {
    const nativeHandler = (event: MessageEvent) => {
      try {
        if (!event.data) return;
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'NATIVE_LOCATION') {
          const now = Date.now();
          // Throttle: skip if < 10s since last native update
          if (now - lastNativeUpdate.current < 10_000) return;

          // Skip if distance < 100m from current coords
          if (coords) {
            const dLat = data.coords.latitude - coords.lat;
            const dLng = data.coords.longitude - coords.lng;
            const distKm = Math.sqrt(dLat * dLat + dLng * dLng) * 111;
            if (distKm < 0.1) return;
          }

          lastNativeUpdate.current = now;
          if (isMounted.current) {
            fetchStores(data.coords.latitude, data.coords.longitude);
          }
        }
      } catch {
        // Ignore JSON parse errors
      }
    };

    window.addEventListener("message", nativeHandler);
    return () => { window.removeEventListener("message", nativeHandler); };
  }, [coords]);

  // Memoize filtered stores
  const filtered = useMemo(() =>
    stores.filter(s =>
      !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.category.toLowerCase().includes(search.toLowerCase())
    ),
    [stores, search]
  );

  const userLat = coords?.lat ?? null;
  const userLng = coords?.lng ?? null;

  const mapSrc = useMemo(() => {
    if (userLat == null || userLng == null) return null;
    const delta = 0.27;
    const bbox = `${userLng - delta},${userLat - delta},${userLng + delta},${userLat + delta}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${userLat},${userLng}`;
  }, [userLat, userLng]);

  const openNavigation = (store: Store) => {
    const origin = userLat != null && userLng != null ? `&origin=${userLat},${userLng}` : '';
    const url = `https://www.google.com/maps/dir/?api=1${origin}&destination=${store.lat},${store.lng}`;
    window.open(url, "_blank");
  };

  const refreshStores = () => {
    if (userLat != null && userLng != null) {
      fetchStores(userLat, userLng);
    }
  };

  return (
    <MobileLayout>
      <div className="px-5 pt-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold text-foreground">{t('local_stores', language)}</h1>
          <button onClick={refreshStores} disabled={loading} className="flex items-center gap-1 text-sm font-medium text-accent disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-5">{t('find_stores', language)}</p>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('search_stores', language)}
            aria-label={t('search_stores', language)}
            className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        {/* Map Toggle + OpenStreetMap Embed */}
        <div className="mb-4">
          <button
            onClick={() => setShowMap(!showMap)}
            className="flex items-center gap-2 text-sm font-medium text-accent mb-2"
          >
            <Map className="h-4 w-4" />
            {showMap ? t('hide_map', language) : t('show_map', language)}
          </button>
          {showMap && (
            mapSrc ? (
              <div className="rounded-2xl overflow-hidden border border-border shadow-card">
                <iframe
                  src={mapSrc}
                  width="100%"
                  height="220"
                  style={{ border: 0 }}
                  loading="lazy"
                  title="Nearby agricultural stores"
                />
                <p className="text-center text-[10px] text-muted-foreground py-1.5 bg-card">
                  {t('map_area_note', language)}
                </p>
              </div>
            ) : (
              <MapSkeleton language={language} />
            )
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3 pb-4">
            {[1, 2, 3, 4].map(i => <StoreSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ShoppingBag className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">{t('no_stores_found', language)}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{t('no_stores_subtitle', language)}</p>
          </div>
        ) : (
          <div className="space-y-3 pb-4">
            {filtered.map((store, i) => (
              <motion.div
                key={store.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl bg-card p-4 shadow-card"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                    <MapPin className="h-5 w-5 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground truncate">{store.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{store.category}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${store.open === null ? "bg-muted text-muted-foreground" : store.open ? "bg-accent/20 text-accent" : "bg-destructive/20 text-destructive"}`}>
                      {store.open === null ? "—" : store.open ? t('open', language) : t('closed', language)}
                    </span>
                    <span className="text-xs text-muted-foreground">{store.distance}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center gap-0.5">
                    <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                    <span className="text-xs text-foreground font-medium">{store.rating}</span>
                  </div>
                  {store.address && <span className="text-xs text-muted-foreground truncate">{store.address}</span>}
                </div>

                <button
                  onClick={() => openNavigation(store)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary/10 py-2.5 text-sm font-medium text-primary transition-colors active:bg-primary/20"
                >
                  <Navigation className="h-4 w-4" />
                  {t('navigate', language)}
                  <ExternalLink className="h-3 w-3" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </MobileLayout>
  );
};

export default Stores;
