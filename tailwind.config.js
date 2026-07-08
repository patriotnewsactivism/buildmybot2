/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        midnight: '#121212',
        'deep-indigo': '#1A1B2F',
        'electric-violet': '#8A2BE2',
        'luminous-teal': '#00F5D4',
        'soft-gray': '#B0B3B8',
        'warm-coral': '#FF6B6B',
        // --- Command Center design system (dark ops / HUD aesthetic) ---
        // Used by the admin/ops surfaces (AdminDashboardV2, analytics,
        // bot builder). Kept separate from the marketing-site tokens above
        // so the landing pages are unaffected.
        console: {
          bg: '#07090C', // deepest page background
          surface: '#0F1319', // panel background
          'surface-raised': '#161B23', // hovered / nested panel
          'surface-glass': 'rgba(20,24,31,0.6)', // glass panel over bg
          border: '#20252E', // 1px hairline borders
          'border-strong': '#323944',
          'border-glow': 'rgba(45,226,230,0.35)',
          muted: '#6B7280', // secondary text
          text: '#E4E9F0', // primary text
        },
        accent: {
          cyan: '#2DE2E6', // primary accent (electric cyan)
          green: '#39FF88', // matrix green — success / online
          amber: '#F5B942', // processing / warning
          red: '#FF4D5E', // error / critical
        },
      },
      fontFamily: {
        spaceGrotesk: ['Space Grotesk', 'Inter', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      backgroundImage: {
        'console-radial':
          'radial-gradient(ellipse 70% 40% at 50% -10%, rgba(45,226,230,0.035), transparent)',
        'panel-sheen':
          'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 10%)',
        'grid-pattern':
          'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
      },
      backgroundSize: {
        grid: '28px 28px',
      },
      boxShadow: {
        'glow-cyan': '0 0 0 1px rgba(45,226,230,0.12)',
        'glow-green': '0 0 0 1px rgba(57,255,136,0.12)',
        'glow-amber': '0 0 0 1px rgba(245,185,66,0.12)',
        'glow-red': '0 0 0 1px rgba(255,77,94,0.12)',
        panel: '0 1px 0 0 rgba(255,255,255,0.02) inset, 0 8px 16px -12px rgba(0,0,0,0.5)',
        'panel-raised': '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 10px 20px -12px rgba(0,0,0,0.5)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        blob: 'blob 7s infinite',
        'bounce-slow': 'bounce 3s infinite',
        breathe: 'breathe 2.4s ease-in-out infinite',
        scan: 'scan 3s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        blob: {
          '0%': { transform: 'translate(0px, 0px) scale(1)' },
          '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
          '100%': { transform: 'translate(0px, 0px) scale(1)' },
        },
        breathe: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        scan: {
          '0%': { backgroundPosition: '0% 0%' },
          '100%': { backgroundPosition: '0% 100%' },
        },
      },
    },
  },
  plugins: [],
};
