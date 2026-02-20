import { useState, useEffect } from "react";
import { cropAPI } from "@/services/api";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";
import MobileLayout from "@/components/MobileLayout";
import { Maximize2, Clock, TrendingUp, Droplets, Check, ChevronDown, Leaf } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Default AP soils (will be overridden by backend)
const defaultSoils = [
  { id: "Red", label: "Red Soil", emoji: "🟤", desc: "Iron-rich" },
  { id: "Black Cotton", label: "Black Cotton", emoji: "⬛", desc: "Moisture retentive" },
  { id: "Alluvial", label: "Alluvial", emoji: "🟡", desc: "River delta" },
  { id: "Laterite", label: "Laterite", emoji: "🧱", desc: "Leached, acidic" },
  { id: "Sandy", label: "Sandy", emoji: "🏜️", desc: "Light, low nutrients" },
  { id: "Coastal Saline", label: "Coastal Saline", emoji: "🌊", desc: "Salt-affected" },
  { id: "Clay", label: "Clay", emoji: "🏔️", desc: "Heavy, water-logging" },
];

const seasons = [
  { id: "Kharif", label: "Kharif", emoji: "☀️", desc: "Jun–Oct (Summer)" },
  { id: "Rabi", label: "Rabi", emoji: "❄️", desc: "Oct–Mar (Winter)" },
  { id: "Zaid", label: "Zaid", emoji: "🌸", desc: "Feb–Jun (Summer)" },
];

const waterLevels = [
  { id: "Low", label: "Low", emoji: "💧" },
  { id: "Moderate", label: "Moderate", emoji: "💧💧" },
  { id: "High", label: "High", emoji: "💧💧💧" },
];

interface CropResult {
  name: string; match: number; period: string; water: string; yield: string;
  sowing?: string; harvest?: string; fertilizer?: string; emoji?: string;
  districts?: string[];
}

const CropRecommendation = () => {
  const { language } = useApp();
  const [soil, setSoil] = useState("");
  const [season, setSeason] = useState("");
  const [water, setWater] = useState("");
  const [district, setDistrict] = useState("");
  const [land, setLand] = useState("2");
  const [results, setResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [crops, setCrops] = useState<CropResult[]>([]);
  const [soilTypes, setSoilTypes] = useState(defaultSoils);
  const [districts, setDistricts] = useState<string[]>([]);
  const [showDistrictPicker, setShowDistrictPicker] = useState(false);
  const [selectedCrop, setSelectedCrop] = useState<CropResult | null>(null);

  // Fetch districts and soils from backend on mount
  useEffect(() => {
    cropAPI.getMeta().then(data => {
      if (data?.districts) setDistricts(data.districts);
      if (data?.soils) setSoilTypes(data.soils);
    }).catch(() => { });
  }, []);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const data = await cropAPI.getRecommendations(season, soil, water, district, land);
      if (data?.crops?.length) {
        setCrops(data.crops.map((c: any) => ({
          name: c.name, match: c.match ?? 85, period: c.period || '90-120 days',
          water: c.water || water, yield: c.yield || '20-30 q/ha',
          sowing: c.sowing, harvest: c.harvest, fertilizer: c.fertilizer,
          emoji: c.emoji, districts: c.districts,
        })));
      } else {
        setCrops([]);
      }
    } catch {
      setCrops([]);
    }
    setResults(true);
    setLoading(false);
  };

  return (
    <MobileLayout>
      <div className="px-5 pt-6">
        <h1 className="text-xl font-bold text-foreground mb-1">{t('crop_recommendation', language)}</h1>
        <p className="text-sm text-muted-foreground mb-5">{t('get_ai_suggestions', language)}</p>

        <AnimatePresence mode="wait">
          {!results ? (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">

              {/* District Selector */}
              <div>
                <p className="text-sm font-semibold text-foreground mb-3">{t('district', language)}</p>
                <button
                  onClick={() => setShowDistrictPicker(true)}
                  className={`w-full flex items-center justify-between rounded-xl border-2 px-4 py-3.5 text-left transition-all ${district ? "border-accent bg-accent/5" : "border-border bg-card"}`}
                >
                  <span className={district ? "text-foreground font-medium" : "text-muted-foreground"}>
                    {district || t('select_district', language)}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* Soil Type */}
              <div>
                <p className="text-sm font-semibold text-foreground mb-3">{t('soil_type', language)}</p>
                <div className="grid grid-cols-3 gap-2">
                  {soilTypes.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSoil(s.id)}
                      className={`relative flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 transition-all ${soil === s.id ? "border-accent bg-accent/10" : "border-border bg-card"}`}
                    >
                      {soil === s.id && (
                        <div className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-accent flex items-center justify-center">
                          <Check className="h-2.5 w-2.5 text-accent-foreground" />
                        </div>
                      )}
                      <span className="text-2xl">{s.emoji}</span>
                      <span className={`text-xs font-semibold ${soil === s.id ? "text-accent" : "text-foreground"}`}>{s.label}</span>
                      <span className="text-[10px] text-muted-foreground text-center leading-tight">{s.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Season */}
              <div>
                <p className="text-sm font-semibold text-foreground mb-3">{t('growing_season', language)}</p>
                <div className="grid grid-cols-3 gap-2">
                  {seasons.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSeason(s.id)}
                      className={`relative flex flex-col items-center gap-1.5 rounded-2xl border-2 p-4 transition-all ${season === s.id ? "border-accent bg-accent/10" : "border-border bg-card"}`}
                    >
                      {season === s.id && (
                        <div className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-accent flex items-center justify-center">
                          <Check className="h-2.5 w-2.5 text-accent-foreground" />
                        </div>
                      )}
                      <span className="text-3xl">{s.emoji}</span>
                      <span className={`text-xs font-semibold ${season === s.id ? "text-accent" : "text-foreground"}`}>{s.label}</span>
                      <span className="text-[10px] text-muted-foreground">{s.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Water Availability */}
              <div>
                <p className="text-sm font-semibold text-foreground mb-3">{t('water_availability', language)}</p>
                <div className="grid grid-cols-3 gap-2">
                  {waterLevels.map(w => (
                    <button
                      key={w.id}
                      onClick={() => setWater(w.id)}
                      className={`relative flex flex-col items-center gap-1.5 rounded-2xl border-2 p-4 transition-all ${water === w.id ? "border-accent bg-accent/10" : "border-border bg-card"}`}
                    >
                      {water === w.id && (
                        <div className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-accent flex items-center justify-center">
                          <Check className="h-2.5 w-2.5 text-accent-foreground" />
                        </div>
                      )}
                      <span className="text-2xl">{w.emoji}</span>
                      <span className={`text-xs font-semibold ${water === w.id ? "text-accent" : "text-foreground"}`}>{w.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Land Size */}
              <div>
                <p className="text-sm font-semibold text-foreground mb-3">{t('acres_of_land', language)}</p>
                <div className="relative">
                  <Maximize2 className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input
                    type="number"
                    value={land}
                    onChange={e => setLand(e.target.value)}
                    min="0.5"
                    step="0.5"
                    placeholder="Acres of Land"
                    className="w-full rounded-xl border border-border bg-card py-3.5 pl-11 pr-16 text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">acres</span>
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!soil || !season || !water || loading}
                className="w-full rounded-xl bg-primary py-3.5 font-semibold text-primary-foreground disabled:opacity-50 transition-transform active:scale-[0.98]"
              >
                {loading ? (
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                ) : t('get_recommendations', language)}
              </button>
            </motion.div>
          ) : (
            <motion.div key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-foreground">{t('recommended_crops', language)} ({crops.length})</h2>
                <button onClick={() => { setResults(false); setSelectedCrop(null); }} className="text-xs text-accent font-medium">{t('modify', language)}</button>
              </div>

              {crops.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Leaf className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No crops found for this combination. Try different filters.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {crops.map((crop, i) => (
                    <motion.button key={crop.name} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                      onClick={() => setSelectedCrop(crop)}
                      className="rounded-2xl bg-card shadow-card overflow-hidden text-left">
                      <div className="relative h-28 gradient-forest flex items-end p-3">
                        <span className="absolute top-2 left-2 text-2xl">{crop.emoji || '🌱'}</span>
                        <span className="absolute top-2 right-2 rounded-full bg-accent/90 px-2 py-0.5 text-[10px] font-bold text-accent-foreground">{crop.match}%</span>
                        <h3 className="text-sm font-bold text-primary-foreground leading-tight">{crop.name}</h3>
                      </div>
                      <div className="p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{crop.period}</div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Droplets className="h-3 w-3" />{crop.water}</div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><TrendingUp className="h-3 w-3" />{crop.yield}</div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* District Picker Modal */}
      <AnimatePresence>
        {showDistrictPicker && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 backdrop-blur-sm"
            onClick={() => setShowDistrictPicker(false)}
          >
            <motion.div
              initial={{ y: 200, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 200, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md max-h-[70vh] rounded-t-3xl bg-card p-6 shadow-elevated overflow-hidden flex flex-col"
            >
              <h2 className="text-lg font-bold text-foreground mb-1">{t('select_district', language)}</h2>
              <p className="text-sm text-muted-foreground mb-4">Andhra Pradesh Districts</p>
              <div className="overflow-y-auto flex-1 space-y-1">
                {districts.map(d => (
                  <button
                    key={d}
                    onClick={() => { setDistrict(d); setShowDistrictPicker(false); }}
                    className={`w-full text-left px-4 py-3 rounded-xl transition-all ${district === d ? "bg-accent/10 text-accent font-semibold" : "text-foreground hover:bg-muted"}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Crop Detail Modal */}
      <AnimatePresence>
        {selectedCrop && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 backdrop-blur-sm"
            onClick={() => setSelectedCrop(null)}
          >
            <motion.div
              initial={{ y: 200, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 200, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md rounded-t-3xl bg-card p-6 shadow-elevated"
            >
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">{selectedCrop.emoji || '🌱'}</span>
                <div>
                  <h2 className="text-lg font-bold text-foreground">{selectedCrop.name}</h2>
                  <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">{selectedCrop.match}% match</span>
                </div>
              </div>
              <div className="space-y-3">
                {selectedCrop.sowing && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Sowing Window</span><span className="font-medium text-foreground">{selectedCrop.sowing}</span></div>}
                {selectedCrop.harvest && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Harvest</span><span className="font-medium text-foreground">{selectedCrop.harvest}</span></div>}
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Growing Period</span><span className="font-medium text-foreground">{selectedCrop.period}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Water Requirement</span><span className="font-medium text-foreground">{selectedCrop.water}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Expected Yield</span><span className="font-medium text-foreground">{selectedCrop.yield}</span></div>
                {selectedCrop.fertilizer && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Fertilizer</span><span className="font-medium text-foreground text-right max-w-[55%]">{selectedCrop.fertilizer}</span></div>}
                {selectedCrop.districts && selectedCrop.districts.length > 0 && (
                  <div className="text-sm">
                    <span className="text-muted-foreground block mb-1">Best Districts</span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedCrop.districts.map(d => (
                        <span key={d} className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">{d}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button onClick={() => setSelectedCrop(null)} className="w-full mt-5 rounded-xl bg-primary py-3 font-semibold text-primary-foreground active:scale-[0.98] transition-transform">Close</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </MobileLayout>
  );
};

export default CropRecommendation;
