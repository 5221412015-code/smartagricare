import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Sprout } from "lucide-react";

const Loading = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => navigate("/language", { replace: true }), 2200);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gradient-mint">
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.2, 1], opacity: [0, 1, 1] }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        className="mb-6"
      >
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-primary/10">
          <Sprout className="h-16 w-16 text-primary" />
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="text-2xl font-bold text-primary"
      >
        SmartAgriCare
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.5 }}
        className="mt-2 text-sm text-muted-foreground"
      >
        Growing Smarter Farms Together
      </motion.p>

      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.8, duration: 1.2, ease: "easeInOut" }}
        className="mt-8 h-1 w-32 origin-left rounded-full bg-accent"
      />
    </div>
  );
};

export default Loading;
