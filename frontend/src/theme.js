// Applies a gym's own look: accent colour and light/dark choice.

export const PRESETS = [
  { name: 'Orange', color: '' }, // the built-in default
  { name: 'Emerald', color: '#059669' },
  { name: 'Blue', color: '#2563eb' },
  { name: 'Violet', color: '#7c3aed' },
  { name: 'Rose', color: '#e11d48' },
  { name: 'Orange', color: '#ea580c' },
  { name: 'Teal', color: '#0d9488' },
  { name: 'Slate', color: '#334155' }
];

// Black or white text, whichever reads better on the colour.
function textOn(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#0b1016' : '#ffffff';
}

export function applyTheme(gym) {
  const root = document.documentElement;
  // Before login (landing, sign-up, legal pages) GymPing wears its own dark look.
  const mode = gym ? gym.theme_mode : 'dark';
  if (mode === 'light' || mode === 'dark') root.dataset.theme = mode;
  else delete root.dataset.theme;

  const color = gym?.theme_color;
  if (color && /^#[0-9a-f]{6}$/i.test(color)) {
    root.style.setProperty('--accent', color);
    root.style.setProperty('--on-accent', textOn(color));
  } else {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--on-accent');
  }
}
