import { useState, useRef, useEffect, useCallback } from "react";
import { diseaseAPI } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";
import { speak, stopSpeaking } from "@/lib/tts";
import { useDropzone } from "react-dropzone";
import MobileLayout from "@/components/MobileLayout";
import { Camera, Upload, X, ShieldCheck, Info, ChevronDown, Volume2, VolumeX, Save, CheckCircle, AlertTriangle, Leaf, Pill, ImageOff, Sprout, Bug, Droplets } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface MedEntry {
  medicine: string;
  quantity_per_acre: string;
  water_volume: string;
  when_to_apply: string;
  repeat: string;
  total_duration: string;
}

interface Result {
  status?: string;
  crop?: string;
  disease: string;
  confidence: number;
  cause: string;
  treatment: string[];
  medication_timeline: MedEntry[];
  max_sprays: string;
  is_viral: boolean;
  viral_note: string;
  stores: string[];
  message?: string;
  deficiencies: string[];
  disorders: string[];
  natural_organic_treatment: string[];
}

const SpeakerButton = ({ text, language }: { text: string; language?: string }) => {
  const [speaking, setSpeaking] = useState(false);

  const toggle = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
    } else {
      speak({
        text,
        language: language || "en",
        onEnd: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      });
      setSpeaking(true);
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const languageRef = useRef(language);
  languageRef.current = language;
  const isMountedRef = useRef(true);
  const [showCamera, setShowCamera] = useState(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      stopSpeaking();
    };
  }, []);

  // Attach stream to video element when camera overlay opens
  useEffect(() => {
    if (showCamera && streamRef.current && videoRef.current) {
      const video = videoRef.current;
      video.srcObject = streamRef.current;
      video.play().catch(() => {});
    }
  }, [showCamera]);

  const openCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      setShowCamera(true);
    } catch {
      // Camera not available (desktop or permission denied) — fall back to file input
      cameraInputRef.current?.click();
    }
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 960;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    // Stop camera stream
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setShowCamera(false);
    canvas.toBlob(blob => {
      if (blob) processImage(new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  }, []);

  const closeCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setShowCamera(false);
  }, []);

  const processImage = async (file: File) => {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    const url = URL.createObjectURL(file);
    imageUrlRef.current = url;
    setImage(url);
    setResult(null);
    setSaved(false);
    setAnalyzing(true);
    try {
      const data = await diseaseAPI.detectDisease(file, languageRef.current);
      if (!isMountedRef.current) return;
      if (data?.status === 'unrecognized') {
        setResult({
          status: 'unrecognized',
          disease: 'Unrecognized',
          confidence: data.confidence <= 1 ? Math.round(data.confidence * 100) : Math.round(data.confidence),
          cause: '',
          treatment: [],
          medication_timeline: [],
          max_sprays: '',
          is_viral: false,
          viral_note: '',
          stores: [],
          message: data.message || '',
          deficiencies: [],
          disorders: [],
          natural_organic_treatment: [],
        });
      } else if (data?.disease) {
        const rawConf = data.confidence ?? 90;
        const confidence = rawConf <= 1 ? Math.round(rawConf * 100) : Math.round(rawConf);
        const rawTreatment = data.treatment || [];
        const treatment = Array.isArray(rawTreatment) ? rawTreatment : [rawTreatment];
        setResult({
          status: data.status || 'diseased',
          crop: data.crop || '',
          disease: data.disease,
          confidence,
          cause: data.cause || data.cause_of_disease || '',
          treatment,
          medication_timeline: data.medication_timeline || [],
          max_sprays: data.max_sprays || '',
          is_viral: data.is_viral || false,
          viral_note: data.viral_note || '',
          stores: data.stores || [],
          message: data.message || '',
          deficiencies: data.deficiencies || [],
          disorders: data.disorders || [],
          natural_organic_treatment: data.natural_organic_treatment || [],
        });
      } else {
        toast.error("Could not identify a disease. Try a clearer image.");
      }
    } catch {
      toast.error("Analysis service unavailable. Please try again.");
    } finally {
      if (isMountedRef.current) setAnalyzing(false);
    }
  };

  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  const onDrop = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Image too large. Maximum size is 10MB.");
      return;
    }
    processImage(file);
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
    stopSpeaking();
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

  const isHealthy = result?.status === 'healthy';
  const isUnrecognized = result?.status === 'unrecognized';

  const medTimelineSpeakText = result?.medication_timeline?.length
    ? result.medication_timeline.map(m => `${m.medicine}, ${m.quantity_per_acre} per acre, ${m.when_to_apply}`).join('. ')
    : '';

  const sections = result && !isHealthy && !isUnrecognized ? [
    ...(result.is_viral ? [{
      key: "viral",
      icon: AlertTriangle,
      title: t('viral_warning', language),
      speakText: result.viral_note,
      content: <p className="text-sm text-orange-400 font-medium">{result.viral_note}</p>,
    }] : []),
    {
      key: "cause",
      icon: Info,
      title: t('cause_of_disease', language),
      speakText: result.cause,
      content: (
        <div>
          {result.crop && <p className="text-xs font-medium text-accent mb-1">{result.crop}</p>}
          <p className="text-sm text-muted-foreground">{result.cause}</p>
        </div>
      ),
    },
    ...(result.deficiencies.length > 0 ? [{
      key: "deficiencies",
      icon: Droplets,
      title: t('deficiencies', language),
      speakText: result.deficiencies.join(". "),
      content: <ul className="list-disc pl-4 space-y-1.5 text-sm text-muted-foreground">{result.deficiencies.map((d, i) => <li key={i}>{d}</li>)}</ul>,
    }] : []),
    ...(result.disorders.length > 0 ? [{
      key: "disorders",
      icon: Bug,
      title: t('disorders', language),
      speakText: result.disorders.join(". "),
      content: <ul className="list-disc pl-4 space-y-1.5 text-sm text-muted-foreground">{result.disorders.map((d, i) => <li key={i}>{d}</li>)}</ul>,
    }] : []),
    {
      key: "treatment",
      icon: ShieldCheck,
      title: t('chemical_treatment', language),
      speakText: result.treatment.join(". "),
      content: <ol className="list-decimal pl-4 space-y-1 text-sm text-muted-foreground">{result.treatment.map((step, i) => <li key={i}>{step}</li>)}</ol>,
    },
    ...(result.natural_organic_treatment.length > 0 ? [{
      key: "organic",
      icon: Sprout,
      title: t('organic_treatment', language),
      speakText: result.natural_organic_treatment.join(". "),
      content: <ol className="list-decimal pl-4 space-y-1.5 text-sm text-muted-foreground">{result.natural_organic_treatment.map((step, i) => <li key={i}>{step}</li>)}</ol>,
    }] : []),
    ...(result.medication_timeline.length > 0 ? [{
      key: "medication",
      icon: Pill,
      title: t('medication_schedule', language),
      speakText: medTimelineSpeakText,
      content: (
        <div className="space-y-3">
          {result.medication_timeline.map((m, i) => (
            <div key={i} className="rounded-xl bg-primary-foreground/5 border border-border/50 p-3 space-y-1.5">
              <p className="text-sm font-semibold text-foreground">{m.medicine}</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{t('quantity', language)}: <span className="text-foreground">{m.quantity_per_acre}</span></span>
                <span>{t('water', language)}: <span className="text-foreground">{m.water_volume}</span></span>
                <span>{t('when', language)}: <span className="text-foreground">{m.when_to_apply}</span></span>
                <span>{t('repeat', language)}: <span className="text-foreground">{m.repeat}</span></span>
              </div>
              <p className="text-xs text-muted-foreground">{t('duration', language)}: <span className="text-foreground">{m.total_duration}</span></p>
            </div>
          ))}
          {result.max_sprays && (
            <p className="text-xs text-muted-foreground pt-1">{t('max_sprays', language)}: <span className="font-medium text-foreground">{result.max_sprays}</span></p>
          )}
        </div>
      ),
    }] : []),
  ] : [];

  return (
    <MobileLayout>
      <div className="px-5 pt-6">
        <h1 className="text-xl font-bold text-foreground mb-1">{t('disease_detection', language)}</h1>
        <p className="text-sm text-muted-foreground mb-5">{t('upload_diagnose', language)}</p>

        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCameraFile} />
        <canvas ref={canvasRef} className="hidden" />

        {/* Live Camera Viewfinder */}
        <AnimatePresence>
          {showCamera && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black flex flex-col">
              <video ref={videoRef} autoPlay playsInline muted className="flex-1 object-cover w-full h-full" />
              <div className="absolute bottom-0 inset-x-0 flex items-center justify-center gap-8 pb-12 pt-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
                <button onClick={closeCamera} className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm text-white active:scale-90 transition-transform">
                  <X className="h-7 w-7" />
                </button>
                <button onClick={capturePhoto} className="flex h-20 w-20 items-center justify-center rounded-full border-[5px] border-white bg-white/20 backdrop-blur-sm active:scale-90 transition-transform">
                  <div className="h-14 w-14 rounded-full bg-white" />
                </button>
                <div className="w-14" /> {/* spacer for centering */}
              </div>
              <p className="absolute bottom-3 left-0 right-0 text-center text-white/60 text-xs">Tap the circle to capture</p>
            </motion.div>
          )}
        </AnimatePresence>

        {!image ? (
          <div className="flex flex-col gap-3">
            <button onClick={openCamera} className="flex items-center gap-3 rounded-2xl bg-card p-5 shadow-card transition-transform active:scale-[0.98]">
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
              {result && isHealthy && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <div className="rounded-2xl bg-green-500/10 border border-green-500/30 p-5 text-center space-y-2">
                    <Leaf className="h-10 w-10 text-green-500 mx-auto" />
                    <h2 className="text-lg font-bold text-green-500">{t('healthy_crop', language)}</h2>
                    {result.crop && <p className="text-sm font-medium text-foreground">{result.crop}</p>}
                    <p className="text-sm text-muted-foreground">{result.message || t('no_disease_detected', language)}</p>
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <span className="text-xs text-muted-foreground">{t('confidence', language)}:</span>
                      <span className="text-sm font-bold text-green-500">{result.confidence}%</span>
                    </div>
                  </div>
                  <button onClick={clear} className="w-full rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground">{t('scan_another', language)}</button>
                </motion.div>
              )}

              {result && isUnrecognized && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  <div className="rounded-2xl bg-orange-500/10 border border-orange-500/30 p-5 text-center space-y-2">
                    <ImageOff className="h-10 w-10 text-orange-500 mx-auto" />
                    <h2 className="text-lg font-bold text-orange-500">{t('not_recognized', language)}</h2>
                    <p className="text-sm text-muted-foreground">{result.message || t('not_plant_image', language)}</p>
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <span className="text-xs text-muted-foreground">{t('confidence', language)}:</span>
                      <span className="text-sm font-bold text-orange-500">{result.confidence}%</span>
                    </div>
                  </div>
                  <button onClick={clear} className="w-full rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground">{t('scan_another', language)}</button>
                </motion.div>
              )}

              {result && !isHealthy && !isUnrecognized && (
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

                  {result.crop && <p className="text-xs font-medium text-accent">{result.crop}</p>}
                  <h2 className="text-lg font-bold text-foreground">{result.disease}</h2>

                  {sections.map(section => (
                    <div key={section.key} className="rounded-2xl bg-card shadow-card overflow-hidden">
                      <div className="flex w-full items-center gap-3 p-4">
                        <section.icon className={`h-5 w-5 shrink-0 ${section.key === 'viral' ? 'text-orange-400' : 'text-accent'}`} />
                        <button
                          onClick={() => toggle(section.key)}
                          className="flex flex-1 items-center text-left"
                        >
                          <span className={`flex-1 text-sm font-semibold ${section.key === 'viral' ? 'text-orange-400' : 'text-foreground'}`}>{section.title}</span>
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
