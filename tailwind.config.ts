import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "var(--paper)",
        paper2: "var(--paper2)",
        ink: { DEFAULT: "var(--ink)", soft: "var(--ink-soft)" },
        paddy: { DEFAULT: "var(--paddy)", deep: "var(--paddy-deep)", tint: "var(--paddy-tint)" },
        yolk: { DEFAULT: "var(--yolk)", deep: "var(--yolk-deep)", tint: "var(--yolk-tint)" },
        clay: "var(--clay)",
        line: "var(--line)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: { xl2: "18px" },
    },
  },
  plugins: [],
};
export default config;
