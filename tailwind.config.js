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
          bg: '#0A0C10', // deepest page background
          surface: '#12151B', // panel background
          'surface-raised': '#181C24', // hovered / nested panel
          border: '#232830', // 1px hairline borders
          'border-strong': '#323944',
          muted: '#6B7280', // secondary text
          text: '#D8DDE4', // primary text
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
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        blob: 'blob 7s infinite',
        'bounce-slow': 'bounce 3s infinite',
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
      },
    },
  },
  plugins: [],
};
