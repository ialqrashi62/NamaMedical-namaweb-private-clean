module.exports = {
  content: [
    "./public/**/*.html",
    "./public/**/*.js"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "surface-dim": "#d9dadb",
        "secondary-container": "#7af1fc",
        "inverse-on-surface": "#f0f1f2",
        "on-tertiary": "#ffffff",
        "primary": "#001629",
        "primary-fixed": "#cfe5ff",
        "on-secondary-fixed-variant": "#004f54",
        "surface-container-lowest": "#ffffff",
        "secondary-fixed": "#7df4ff",
        "surface-bright": "#f8f9fa",
        "on-tertiary-fixed": "#251a00",
        "on-primary-fixed": "#001d34",
        "surface-container": "#edeeef",
        "outline": "#73777e",
        "on-surface-variant": "#42474d",
        "error-container": "#ffdad6",
        "surface-container-high": "#e7e8e9",
        "surface-tint": "#406182",
        "surface-variant": "#e1e3e4",
        "on-error-container": "#93000a",
        "surface-container-low": "#f3f4f5",
        "on-primary-container": "#7293b6",
        "inverse-primary": "#a8caef",
        "background": "#f8f9fa",
        "secondary": "#006970",
        "secondary-fixed-dim": "#5dd8e2",
        "on-background": "#191c1d",
        "on-secondary": "#ffffff",
        "primary-container": "#002b49",
        "tertiary-fixed": "#ffdf9d",
        "on-tertiary-container": "#ac8c44",
        "inverse-surface": "#2e3132",
        "on-secondary-container": "#006e75",
        "on-primary": "#ffffff",
        "surface-container-highest": "#e1e3e4",
        "primary-fixed-dim": "#a8caef",
        "error": "#ba1a1a",
        "surface": "#f8f9fa",
        "outline-variant": "#c3c7ce",
        "on-primary-fixed-variant": "#274969",
        "tertiary-fixed-dim": "#e6c274",
        "tertiary-container": "#362700",
        "on-surface": "#191c1d",
        "on-secondary-fixed": "#002022",
        "on-tertiary-fixed-variant": "#5b4300",
        "tertiary": "#1d1300",
        "on-error": "#ffffff"
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      spacing: {
        "gutter": "24px",
        "md": "24px",
        "xl": "64px",
        "base": "8px",
        "margin-desktop": "48px",
        "margin-mobile": "16px",
        "xs": "4px",
        "lg": "40px",
        "sm": "12px"
      },
      fontFamily: {
        "display-lg": ["IBM Plex Sans Arabic", "IBM Plex Sans", "sans-serif"],
        "headline-lg": ["IBM Plex Sans Arabic", "IBM Plex Sans", "sans-serif"],
        "headline-md": ["IBM Plex Sans Arabic", "IBM Plex Sans", "sans-serif"],
        "title-lg": ["IBM Plex Sans Arabic", "IBM Plex Sans", "sans-serif"],
        "body-lg": ["IBM Plex Sans Arabic", "IBM Plex Sans", "sans-serif"],
        "body-md": ["IBM Plex Sans Arabic", "IBM Plex Sans", "sans-serif"],
        "label-md": ["IBM Plex Sans Arabic", "IBM Plex Sans", "sans-serif"],
        "caption": ["IBM Plex Sans Arabic", "IBM Plex Sans", "sans-serif"]
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries')
  ]
};
