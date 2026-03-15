import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 8080,
    allowedHosts: [".ngrok-free.dev", ".ngrok.io"],
    hmr: {
      overlay: false,
      // When accessed via ngrok, HMR websocket can't connect back — disable it
      // so the page loads without hanging. HMR still works on localhost.
      clientPort: 8080,
      protocol: "ws",
      host: "localhost",
    },
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          ui: ["framer-motion", "lucide-react", "sonner"],
        },
      },
    },
  },
});
