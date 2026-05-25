import type { Config } from "tailwindcss";

export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
        },
        court: {
          green: "#16a34a",
          line: "#86efac",
        },
      },
      fontFamily: {
        display: ["Nunito", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        card: "0 4px 24px rgba(0,0,0,0.10)",
        "card-hover": "0 8px 40px rgba(0,0,0,0.16)",
      },
      animation: {
        bounce: "bounce 0.6s infinite",
        "bounce-slow": "bounce 1.2s infinite",
        wiggle: "wiggle 0.4s ease-in-out infinite",
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.35s ease-out",
        "pop-in": "popIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      keyframes: {
        wiggle: {
          "0%, 100%": { transform: "rotate(-4deg)" },
          "50%": { transform: "rotate(4deg)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { transform: "translateY(12px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        popIn: {
          from: { transform: "scale(0.8)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
