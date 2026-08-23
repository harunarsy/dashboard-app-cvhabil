import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiUrl = env.VITE_API_URL || env.REACT_APP_API_URL || "";

  return {
    plugins: [react()],
    define: {
      "process.env.REACT_APP_API_URL": JSON.stringify(apiUrl),
    },
    build: {
      outDir: "dist",
      sourcemap: false,
    },
    server: {
      port: 3000,
    },
  };
});
