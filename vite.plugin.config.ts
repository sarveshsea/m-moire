import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname),
  publicDir: false,
  build: {
    target: "es2017",
    minify: false,
  },
});
