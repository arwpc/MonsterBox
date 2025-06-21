/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./views/**/*.ejs",
    "./public/**/*.html",
    "./public/**/*.js",
    "./scripts/**/*.js"
  ],
  theme: {
    extend: {
      fontFamily: {
        'terminal': ['VT323', 'Courier New', 'monospace'],
        'retro': ['Press Start 2P', 'monospace'],
        'creepster': ['Creepster', 'cursive'],
        'mono': ['Courier New', 'monospace']
      },
      colors: {
        'neon-green': '#00ff00',
        'neon-purple': '#ff00ff',
        'neon-red': '#ff0040',
        'neon-blue': '#00ffff',
        'neon-orange': '#ff8000',
        'terminal-bg': '#000000',
        'terminal-text': '#00ff00',
        'dark-green': '#004400',
        'darker-green': '#002200'
      },
      boxShadow: {
        'neon-green': '0 0 10px #00ff00',
        'neon-purple': '0 0 10px #ff00ff',
        'neon-red': '0 0 10px #ff0040',
        'neon-blue': '0 0 10px #00ffff',
        'neon-orange': '0 0 10px #ff8000',
        'glow-sm': '0 0 5px currentColor',
        'glow-md': '0 0 10px currentColor',
        'glow-lg': '0 0 15px currentColor',
        'glow-xl': '0 0 20px currentColor'
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'flicker': 'flicker 0.15s infinite linear'
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px currentColor' },
          '100%': { boxShadow: '0 0 20px currentColor' }
        },
        flicker: {
          '0%, 19.999%, 22%, 62.999%, 64%, 64.999%, 70%, 100%': {
            opacity: '0.99'
          },
          '20%, 21.999%, 63%, 63.999%, 65%, 69.999%': {
            opacity: '0.4'
          }
        }
      }
    }
  },
  plugins: [
    require('daisyui'),
    require('@tailwindcss/typography')
  ],
  daisyui: {
    themes: [
      {
        // Custom MonsterBox Terminal Theme
        "monsterbox": {
          "primary": "#00ff00",
          "primary-focus": "#00cc00", 
          "primary-content": "#000000",
          "secondary": "#ff00ff",
          "secondary-focus": "#cc00cc",
          "secondary-content": "#000000",
          "accent": "#00ffff",
          "accent-focus": "#00cccc",
          "accent-content": "#000000",
          "neutral": "#002200",
          "neutral-focus": "#001100",
          "neutral-content": "#00ff00",
          "base-100": "#000000",
          "base-200": "#111111",
          "base-300": "#222222",
          "base-content": "#00ff00",
          "info": "#00ffff",
          "info-content": "#000000",
          "success": "#00ff00",
          "success-content": "#000000",
          "warning": "#ff8000",
          "warning-content": "#000000",
          "error": "#ff0040",
          "error-content": "#000000"
        },
        // Custom MonsterBox Halloween Theme
        "monsterbox-halloween": {
          "primary": "#ff8000",
          "primary-focus": "#cc6600",
          "primary-content": "#000000",
          "secondary": "#ff00ff",
          "secondary-focus": "#cc00cc",
          "secondary-content": "#000000",
          "accent": "#ff0040",
          "accent-focus": "#cc0033",
          "accent-content": "#ffffff",
          "neutral": "#2a1810",
          "neutral-focus": "#1f120c",
          "neutral-content": "#ff8000",
          "base-100": "#0f0f0f",
          "base-200": "#1a1a1a",
          "base-300": "#2d2d2d",
          "base-content": "#ff8000",
          "info": "#00ffff",
          "info-content": "#000000",
          "success": "#00ff00",
          "success-content": "#000000",
          "warning": "#ffaa00",
          "warning-content": "#000000",
          "error": "#ff0040",
          "error-content": "#ffffff"
        },
        // Custom MonsterBox Retro Theme
        "monsterbox-retro": {
          "primary": "#00ff00",
          "primary-focus": "#00cc00",
          "primary-content": "#000000",
          "secondary": "#00ffff",
          "secondary-focus": "#00cccc",
          "secondary-content": "#000000",
          "accent": "#ff00ff",
          "accent-focus": "#cc00cc",
          "accent-content": "#000000",
          "neutral": "#003300",
          "neutral-focus": "#002200",
          "neutral-content": "#00ff00",
          "base-100": "#001100",
          "base-200": "#002200",
          "base-300": "#003300",
          "base-content": "#00ff00",
          "info": "#00ffff",
          "info-content": "#000000",
          "success": "#00ff00",
          "success-content": "#000000",
          "warning": "#ffff00",
          "warning-content": "#000000",
          "error": "#ff4444",
          "error-content": "#000000"
        }
      },
      // Include some standard DaisyUI themes for variety
      "dark",
      "dracula",
      "halloween",
      "forest",
      "light"
    ],
    darkTheme: "monsterbox", // Set default dark theme
    base: true, // Apply background color and foreground color for root element
    styled: true, // Include daisyUI colors and design decisions
    utils: true, // Add responsive and modifier utility classes
    rtl: false, // Add RTL variants
    prefix: "", // Prefix for daisyUI classnames
    logs: true // Show info about daisyUI version and used config
  }
}
