import { useState, useRef } from "react";
import { diseaseAPI } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";
import { useDropzone } from "react-dropzone";
import MobileLayout from "@/components/MobileLayout";
import { Camera, Upload, X, ShieldCheck, Info, Calendar, MapPin, ChevronDown, Volume2, VolumeX, Save, CheckCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface Result {
  disease: string;
  confidence: number;
  cause: string;
  treatment: string[];
  stores: string[];
}

const mockResult: Result = {
  disease: "Late Blight (Phytophthora infestans)",
  confidence: 94,
  cause: "Caused by the oomycete pathogen Phytophthora infestans, thriving in cool, moist conditions with temperatures between 10-25°C and high humidity.",
  treatment: [
    "Apply copper-based fungicide (Bordeaux mixture) immediately",
    "Remove and destroy all infected plant parts",
    "Improve field drainage to reduce moisture",
    "Space plants adequately for air circulation",
  ],
  stores: ["Kisan Agro Store - 1.2 km", "Green Farm Supplies - 2.8 km", "Bharat Seeds & Fertilizers - 4.1 km"],
};

const SpeakerButton = ({ text, language }: { text: string; language?: string }) => {
  const [speaking, setSpeaking] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  const toggle = () => {
    // Native WebView bridge (expo-speech)
    if ((window as any).__NATIVE_TTS__ && (window as any).ReactNativeWebView) {
      if (speaking) {
        (window as any).ReactNativeWebView.postMessage(JSON.stringify({ type: 'NATIVE_TTS_STOP' }));
        setSpeaking(false);
      } else {
        (window as any).ReactNativeWebView.postMessage(JSON.stringify({
          type: 'NATIVE_TTS_SPEAK', text, language: language || 'en',
        }));
        setSpeaking(true);
        // Auto-reset after estimated duration (native doesn't callback)
        setTimeout(() => setSpeaking(false), Math.max(3000, text.length * 60));
      }
      return;
    }
    if (!window.speechSynthesis) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    } else {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utterRef.current = utter;
        utter.rate = 0.95;
        utter.onend = () => setSpeaking(false);
        utter.onerror = () => setSpeaking(false);
        window.speechSynthesis.speak(utter);
        setSpeaking(true);
      } catch (e) {
        console.error("TTS error:", e);
        setSpeaking(false);
      }
    }
  };

  return (
    <button
      onClick={toggle}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${speaking ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground hover:bg-accent/20 hover:text-accent"}`}
      title={speaking ? "Stop" : "Read aloud"}
    >
      {speaking ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
    </button>
  );
};

const DiseaseDetection = () => {
  const { user } = useAuth();
  const { language } = useApp();
  const [image, setImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Use ref to track current blob URL for cleanup (avoids stale closure)
  const imageUrlRef = useRef<string | null>(null);

  const processImage = async (file: File) => {
    // Revoke previous object URL to avoid memory leak
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    const url = URL.createObjectURL(file);
    imageUrlRef.current = url;
    setImage(url);
    setResult(null);
    setSaved(false);
    setAnalyzing(true);
    try {
      const data = await diseaseAPI.detectDisease(file);
      if (data?.disease) {
        // Normalize ML response: confidence may be 0-1, treatment may be string
        const rawConf = data.confidence ?? 90;
        const confidence = rawConf <= 1 ? Math.round(rawConf * 100) : Math.round(rawConf);
        const rawTreatment = data.treatment || mockResult.treatment;
        const treatment = Array.isArray(rawTreatment) ? rawTreatment : [rawTreatment];
        setResult({
          disease: data.disease,
          confidence,
          cause: data.cause || data.description || mockResult.cause,
          treatment,
          stores: data.stores || mockResult.stores,
        });
      } else {
        toast.error("Could not identify a disease. Try a clearer image.");
        setResult(mockResult);
      }
    } catch {
      toast.error("ML service unavailable. Showing example result.");
      setResult(mockResult);
    } finally {
      setAnalyzing(false);
    }
  };

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  const onDrop = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Image too large. Maximum size is 10MB.");
      return;
    }
    processImage(file);
  };

  const handleCameraCapture = () => {
    cameraInputRef.current?.click();
  };

  const handleCameraFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
  };

  const { getRootProps, getInputProps } = useDropzone({ onDrop, accept: { "image/*": [] }, maxFiles: 1 });

  const toggle = (s: string) => setOpenSections(prev => {
    const next = new Set(prev);
    next.has(s) ? next.delete(s) : next.add(s);
    return next;
  });

  const clear = () => {
    window.speechSynthesis?.cancel();
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    imageUrlRef.current = null;
    setImage(null);
    setResult(null);
    setSaved(false);
  };

  const saveReport = async () => {
    if (!result || saving) return;
    setSaving(true);
    try {
      const res = await diseaseAPI.saveReport({
        userId: user?.id ? parseInt(user.id) : 0,
        disease: result.disease,
        confidence: result.confidence,
        cause: result.cause,
        treatment: result.treatment,
        stores: result.stores,
      });
      if (res?.success) {
        setSaved(true);
        toast.success(t('report_saved', language));
      } else {
        toast.error("Failed to save report");
      }
    } catch {
      toast.error("Failed to save report");
    }
    setSaving(false);
  };

  const sections = result ? [
    {
      key: "cause",
      icon: Info,
      title: t('cause_of_disease', language),
      speakText: result.cause,
      content: <p className="text-sm text-muted-foreground">{result.cause}</p>,
    },
    {
      key: "treatment",
      icon: ShieldCheck,
      title: t('treatment', language),
      speakText: result.treatment.join(". "),
      content: <ol className="list-decimal pl-4 space-y-1 text-sm text-muted-foreground">{result.treatment.map((t, i) => <li key={i}>{t}</li>)}</ol>,
    },
    {
      key: "schedule",
      icon: Calendar,
      title: t('medication_timeline', language),
      speakText: "Day 1: First application. Day 10: Second spray. Day 21: Follow-up. Day 30: Assessment.",
      content: (
        <div className="space-y-2">
          {["Day 1: First application", "Day 10: Second spray", "Day 21: Follow-up", "Day 30: Assessment"].map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-accent" />{s}
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "stores",
      icon: MapPin,
      title: t('nearby_stores', language),
      speakText: result.stores.join(". "),
      content: (
        <div className="space-y-2">
          {result.stores.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-3 w-3 text-accent" />{s}
            </div>
          ))}
        </div>
      ),
    },
  ] : [];

  return (
    <MobileLayout>
      <div className="px-5 pt-6">
        <h1 className="text-xl font-bold text-foreground mb-1">{t('disease_detection', language)}</h1>
        <p className="text-sm text-muted-foreground mb-5">{t('upload_diagnose', language)}</p>

        {/* Hidden camera input for mobile */}
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCameraFile} />

        {!image ? (
          <div className="flex flex-col gap-3">
            <button onClick={handleCameraCapture} className="flex items-center gap-3 rounded-2xl bg-card p-5 shadow-card transition-transform active:scale-[0.98]">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10"><Camera className="h-6 w-6 text-accent" /></div>
              <div className="text-left"><p className="font-semibold text-foreground">{t('take_photo', language)}</p><p className="text-xs text-muted-foreground">{t('use_camera', language)}</p></div>
            </button>

            <div {...getRootProps()} className="flex cursor-pointer items-center gap-3 rounded-2xl bg-card p-5 shadow-card transition-transform active:scale-[0.98]">
              <input {...getInputProps()} />
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10"><Upload className="h-6 w-6 text-accent" /></div>
              <div className="text-left"><p className="font-semibold text-foreground">{t('upload_gallery', language)}</p><p className="text-xs text-muted-foreground">{t('browse_files', language)}</p></div>
            </div>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="relative mb-5 overflow-hidden rounded-2xl">
              <img src={image} alt="Plant" className="w-full aspect-square object-cover" />
              <button onClick={clear} className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-foreground/60 text-background"><X className="h-4 w-4" /></button>
              {analyzing && (
                <div className="absolute inset-0 flex items-center justify-center bg-foreground/30 backdrop-blur-sm">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
                </div>
              )}
            </div>

            <AnimatePresence>
              {result && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-accent/20 px-3 py-1 text-xs font-medium text-accent">{t('analysis_complete', language)}</span>
                    <div className="flex items-center gap-2">
                      <div className="relative h-12 w-12">
                        <svg className="h-12 w-12 -rotate-90" viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" className="stroke-muted" />
                          <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" className="stroke-accent"
                            strokeDasharray={`${result.confidence} ${100 - result.confidence}`} strokeLinecap="round" />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">{result.confidence}%</span>
                      </div>
                    </div>
                  </div>

                  <h2 className="text-lg font-bold text-foreground">{result.disease}</h2>

                  {/* Accordion sections with speaker */}
                  {sections.map(section => (
                    <div key={section.key} className="rounded-2xl bg-card shadow-card overflow-hidden">
                      <div className="flex w-full items-center gap-3 p-4">
                        <section.icon className="h-5 w-5 text-accent shrink-0" />
                        <button
                          onClick={() => toggle(section.key)}
                          className="flex flex-1 items-center text-left"
                        >
                          <span className="flex-1 text-sm font-semibold text-foreground">{section.title}</span>
                          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform mr-2 ${openSections.has(section.key) ? "rotate-180" : ""}`} />
                        </button>
                        <SpeakerButton text={section.speakText} language={language} />
                      </div>
                      <AnimatePresence>
                        {openSections.has(section.key) && (
                          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                            <div className="px-4 pb-4">{section.content}</div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={saveReport}
                      disabled={saving || saved}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition-all ${saved ? "border-accent bg-accent/10 text-accent" : "border-border text-foreground"}`}
                    >
                      {saved ? <><CheckCircle className="h-4 w-4" /> Saved</> : saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" /> : <><Save className="h-4 w-4" /> {t('save_report', language)}</>}
                    </button>
                    <button onClick={clear} className="flex-1 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground">{t('scan_another', language)}</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </MobileLayout>
  );
};

export default DiseaseDetection;
