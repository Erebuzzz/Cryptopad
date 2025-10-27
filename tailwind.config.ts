import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        "surface": "rgba(255, 255, 255, 0.85)",
        "surface-dark": "rgba(17, 24, 39, 0.85)",
        "ink": "#0b1120",
        "ink-muted": "#475569",
        "accent": "#4f46e5",
      },
      boxShadow: {
        glass: "0 20px 45px -20px rgba(15, 23, 42, 0.35)",
      },
      backgroundImage: {
        mesh: "radial-gradient(circle at 15% 20%, rgba(79, 70, 229, 0.25), transparent 55%), radial-gradient(circle at 85% 25%, rgba(236, 72, 153, 0.2), transparent 60%), linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.7))",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-4px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
