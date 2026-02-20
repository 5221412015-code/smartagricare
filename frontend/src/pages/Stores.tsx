import { useState, useEffect, useRef } from "react";
import { storeAPI } from "@/services/api";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";
import MobileLayout from "@/components/MobileLayout";
import { MapPin, Navigation, Search, Star, Loader2, ShoppingBag, ExternalLink } from "lucide-react";
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
  open: boolean;
  lat: number;
  lng: number;
}

const Stores = () => {
  const { language } = useApp();
  const [stores, setStores] = useState<Store[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);

  // Use a ref to track mounted state for async safety
  const isMounted = useRef(true);
  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    // Define fetch logic inside effect to avoid hoisting issues
    const safeFetch = async (lat: number, lng: number) => {
      if (!isMounted.current) return;
      setLoading(true);
      try {
        const data = await storeAPI.getNearbyStores(lat, lng);
        if (isMounted.current) setStores(data?.stores || []);
      } catch {
        if (isMounted.current) setStores([]);
      }
      if (isMounted.current) setLoading(false);
    };

    if (!navigator.geolocation) {
      if (isMounted.current) {
        setLoading(false);
      }
      return;
    }

    // Browser Geolocation
    navigator.geolocation.getCurrentPosition(
      pos => {
        if (!isMounted.current) return;
        setUserLat(pos.coords.latitude);
        setUserLng(pos.coords.longitude);
        safeFetch(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        if (!isMounted.current) return;
        console.error("Location error:", err);

        // Fallback to Visakhapatnam — still fetch stores, don't block UI
        const fallbackLat = 17.6868;
        const fallbackLng = 83.2185;
        setUserLat(fallbackLat);
        setUserLng(fallbackLng);
        safeFetch(fallbackLat, fallbackLng);

        if (err.code === 1) toast.error("Permission denied. Showing stores in Visakhapatnam.");
        else if (err.code === 2) toast.error("Location unavailable. Showing default location.");
        else toast.error("Location timeout. Showing default location.");
      },
      { timeout: 20000, enableHighAccuracy: true }
    );

    // Native Location Listener
    const nativeHandler = (event: MessageEvent) => {
      try {
        if (!event.data) return;
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'NATIVE_LOCATION') {
          console.log("Received Native Location:", data.coords);
          if (isMounted.current) {
            setUserLat(data.coords.latitude);
            setUserLng(data.coords.longitude);
            safeFetch(data.coords.latitude, data.coords.longitude);
            toast.success("Using Device GPS (Native)");
          }
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    };

    window.addEventListener("message", nativeHandler);

    return () => {
      window.removeEventListener("message", nativeHandler);
    };
  }, []);

  const filtered = stores.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.category.toLowerCase().includes(search.toLowerCase())
  );

  const openNavigation = (store: Store) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`;
    window.open(url, "_blank");
  };

  const mapSrc = userLat && userLng
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${userLng - 0.1},${userLat - 0.08},${userLng + 0.1},${userLat + 0.08}&layer=mapnik&marker=${userLat},${userLng}`
    : null;

  return (
    <MobileLayout>
      <div className="px-5 pt-6">
        <h1 className="text-xl font-bold text-foreground mb-1">{t('local_stores', language)}</h1>
        <p className="text-sm text-muted-foreground mb-5">{t('find_stores', language)}</p>

        {/* DEBUG BANNER REMOVED */}

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('search_stores', language)}
            className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        {/* Map */}
        {mapSrc && (
          <div className="mb-4 overflow-hidden rounded-2xl shadow-card">
            <iframe
              src={mapSrc}
              width="100%"
              height="180"
              style={{ border: 0 }}
              title="Map"
              loading="lazy"
              allow="geolocation"
            />
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-accent mb-3" />
            <p className="text-sm">{t('loading_stores', language)}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ShoppingBag className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">{t('no_stores_found', language)}</p>
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
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${store.open ? "bg-accent/20 text-accent" : "bg-destructive/20 text-destructive"}`}>
                      {store.open ? t('open', language) : t('closed', language)}
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
