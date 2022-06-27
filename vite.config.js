import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  return {
    server: {
      host: true,
      open: true,
    },
  };
});
