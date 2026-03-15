import { useState, useRef, useEffect, useCallback } from "react";
import { voiceAPI } from "@/services/api";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";
import { speak, stopSpeaking, cleanForTts } from "@/lib/tts";
import MobileLayout from "@/components/MobileLayout";
import { Mic, MicOff, Volume2, VolumeX, Send, User, Bot, Keyboard, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const quickPrompts = [
  { en: "What crops should I plant this season?", hi: "इस सीजन में कौन सी फसल लगाऊं?", te: "ఈ సీజన్‌లో ఏ పంట వేయాలి?" },
  { en: "How to treat leaf blight?", hi: "लीफ ब्लाइट का इलाज कैसे करें?", te: "లీఫ్ బ్లైట్ చికిత్స ఎలా?" },
  { en: "Best fertilizer for rice?", hi: "धान के लिए सबसे अच्छा खाद?", te: "వరికి ఉత్తమ ఎరువు?" },
  { en: "Where to buy seeds nearby?", hi: "पास में बीज कहां खरीदें?", te: "సమీపంలో విత్తనాలు ఎక్కడ కొనాలి?" },
];

const VoiceAssistant = () => {
  const { language } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [textInput, setTextInput] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isSpeakingRef = useRef(false);
  const micCooldownRef = useRef(false);
  const msgIdCounter = useRef(0);

  const nextId = () => `msg-${Date.now()}-${++msgIdCounter.current}`;

  // Use ref for messages so recognition callback always has latest
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  const speakText = useCallback((text: string) => {
    stopSpeaking();
    isSpeakingRef.current = true;
    speak({
      text: cleanForTts(text),
      language,
      onEnd: () => { isSpeakingRef.current = false; },
      onError: () => { isSpeakingRef.current = false; },
    });
  }, [language]);

  const handleQuery = useCallback(async (query: string) => {
    if (!query.trim()) return;
    // Stop any ongoing TTS
    stopSpeaking();
    isSpeakingRef.current = false;

    const userMsg: Message = { id: nextId(), role: "user", text: query };
    setMessages(prev => [...prev, userMsg]);
    setProcessing(true);
    try {
      const history = [...messagesRef.current, userMsg].map(m => ({ role: m.role, content: m.text }));
      const data = await voiceAPI.processQuery(query, language, history);
      const response = data?.response || "I couldn't process that request. Please try again.";
      setMessages(prev => [...prev, { id: nextId(), role: "assistant", text: response }]);
      if (autoSpeak) {
        // Small delay to let state update, then speak
        setTimeout(() => speakText(response), 150);
      }
    } catch {
      const fallback = "Sorry, I encountered an error. Please try again.";
      setMessages(prev => [...prev, { id: nextId(), role: "assistant", text: fallback }]);
      if (autoSpeak) {
        setTimeout(() => speakText(fallback), 150);
      }
    }
    setProcessing(false);
  }, [language, autoSpeak, speakText]);

  // Keep a stable ref for use in recognition callback
  const handleQueryRef = useRef(handleQuery);
  handleQueryRef.current = handleQuery;

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setSpeechSupported(true);
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      const langMap: Record<string, string> = { en: "en-US", hi: "hi-IN", te: "te-IN" };
      rec.lang = langMap[language] || "en-US";

      rec.onresult = (e: any) => {
        const transcript = e.results[0]?.[0]?.transcript;
        if (transcript) {
          handleQueryRef.current(transcript);
        }
        setListening(false);
      };
      rec.onerror = (e: any) => {
        console.warn("Speech recognition error:", e.error);
        setListening(false);
        if (e.error === 'not-allowed') {
          toast.error("Microphone permission denied. Please allow microphone access.");
          setShowTextInput(true);
        }
      };
      rec.onend = () => setListening(false);
      recognitionRef.current = rec;
    } else {
      setSpeechSupported(false);
      setShowTextInput(true);
    }
    return () => {
      recognitionRef.current?.abort?.();
      stopSpeaking();
    };
  }, [language]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, processing]);

  const toggleListening = useCallback(() => {
    // Debounce rapid taps (500ms cooldown)
    if (micCooldownRef.current) return;
    micCooldownRef.current = true;
    setTimeout(() => { micCooldownRef.current = false; }, 500);

    if (!recognitionRef.current) {
      setShowTextInput(true);
      return;
    }

    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    // Stop any ongoing TTS before starting recognition
    stopSpeaking();
    isSpeakingRef.current = false;

    // Small delay to ensure TTS audio is fully stopped before mic activates
    setTimeout(() => {
      try {
        recognitionRef.current.start();
        setListening(true);
      } catch {
        // Already started — stop and retry
        try {
          recognitionRef.current.stop();
        } catch { /* ignore */ }
        setTimeout(() => {
          try {
            recognitionRef.current.start();
            setListening(true);
          } catch {
            toast.error("Could not start microphone. Try the text input.");
            setShowTextInput(true);
          }
        }, 300);
      }
    }, 100);
  }, [listening]);

  const handleTextSubmit = useCallback(() => {
    if (!textInput.trim()) return;
    handleQuery(textInput.trim());
    setTextInput("");
  }, [textInput, handleQuery]);

  return (
    <MobileLayout>
      <div className="flex flex-col h-[calc(100dvh-80px)]">
        {/* Header */}
        <div className="px-5 pt-6 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground">{t('voice_assistant', language)}</h1>
              <p className="text-sm text-muted-foreground">{t('ask_anything', language)}</p>
            </div>
            <button
              onClick={() => setAutoSpeak(!autoSpeak)}
              className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${autoSpeak ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"}`}
              title={autoSpeak ? "Auto-TTS On" : "Auto-TTS Off"}
            >
              {autoSpeak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-5 space-y-3 pb-4">
          {messages.length === 0 && !processing && (
            <div className="pt-8 space-y-3">
              <p className="text-center text-sm text-muted-foreground mb-4">Try asking:</p>
              {quickPrompts.map((p, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  onClick={() => handleQuery(p[language as keyof typeof p] || p.en)}
                  className="w-full text-left rounded-2xl bg-card p-4 shadow-card text-sm text-foreground active:scale-[0.98] transition-transform"
                >
                  {p[language as keyof typeof p] || p.en}
                </motion.button>
              ))}
            </div>
          )}

          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {m.role === "assistant" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 mt-1">
                  <Bot className="h-4 w-4 text-accent" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-card text-foreground shadow-card rounded-bl-sm"}`}
              >
                {m.text}
                {m.role === "assistant" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      speakText(m.text);
                    }}
                    className="mt-2 flex items-center gap-1 text-xs text-accent hover:text-accent/80 active:scale-95 py-1"
                  >
                    <Volume2 className="h-3.5 w-3.5" /> {t('listen', language)}
                  </button>
                )}
              </div>
              {m.role === "user" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-1">
                  <User className="h-4 w-4 text-primary" />
                </div>
              )}
            </motion.div>
          ))}

          {processing && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10">
                <Bot className="h-4 w-4 text-accent" />
              </div>
              <div className="rounded-2xl bg-card px-4 py-3 shadow-card">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Input area */}
        <div className="px-5 pb-5 border-t border-border bg-background">
          <AnimatePresence>
            {showTextInput && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 pt-3">
                  <input
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleTextSubmit()}
                    placeholder={t('type_message', language)}
                    className="flex-1 rounded-xl border border-border bg-card py-3 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <button
                    onClick={handleTextSubmit}
                    disabled={!textInput.trim() || processing}
                    className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center justify-center gap-4 pt-3">
            {speechSupported && (
              <button
                onClick={() => { setShowTextInput(!showTextInput); }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                {showTextInput ? <X className="h-4 w-4" /> : <Keyboard className="h-4 w-4" />}
              </button>
            )}

            <button
              onClick={toggleListening}
              disabled={processing}
              className={`flex h-16 w-16 items-center justify-center rounded-full shadow-lg transition-all active:scale-95 ${listening
                ? "bg-destructive text-destructive-foreground animate-pulse"
                : "bg-primary text-primary-foreground"
                }`}
            >
              {listening ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
            </button>

            {speechSupported && <div className="w-10" />}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-2">
            {listening ? t('listening', language) : speechSupported ? t('tap_to_speak', language) : t('type_message', language)}
          </p>
        </div>
      </div>
    </MobileLayout>
  );
};

export default VoiceAssistant;
