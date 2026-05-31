export const UI_MOTION = {
  easing: {
    enter: 'cubic-bezier(0.16, 1, 0.3, 1)',
    press: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  duration: {
    press: 100,
    fast: 150,
    base: 200,
    modal: 250,
    page: 300,
    loading: 300,
    micro: 50,
    countUp: 700,
    toastSuccess: 2500,
    toastError: 3500,
    draftDebounce: 2000,
    scanHighlight: 1800,
    scrollIntoView: 80,
    skeleton: 1200,
    settle: 800,
  },
  scale: {
    press: 0.97,
    modal: 0.96,
    cardLift: -2,
  },
};

export const UI_COLOR = {
  primary: 'var(--color-primary)',
  primaryHover: 'var(--color-primary-hover)',
  primaryPressed: 'var(--color-primary-pressed)',
  primarySoft: 'var(--color-primary-soft)',
  primarySoftStrong: 'var(--color-primary-soft-strong)',
  primarySoftWeak: 'var(--color-primary-soft-weak)',
  primaryBorder: 'var(--color-primary-border)',
  primaryBorderStrong: 'var(--color-primary-border-strong)',
  accent: 'var(--color-accent)',
  success: 'var(--color-success)',
  successSoft: 'var(--color-success-soft)',
  warning: 'var(--color-warning)',
  warningSoft: 'var(--color-warning-soft)',
  danger: 'var(--color-danger)',
  dangerSoft: 'var(--color-danger-soft)',
  bg: 'var(--color-bg)',
  bgSubtle: 'var(--color-bg-subtle)',
  surface: 'var(--color-surface)',
  surfaceElevated: 'var(--color-surface-elevated)',
  surfaceRaised: 'var(--color-surface-raised)',
  border: 'var(--color-border)',
  borderStrong: 'var(--color-border-strong)',
  text: 'var(--color-text)',
  textMuted: 'var(--color-text-muted)',
  textSubtle: 'var(--color-text-subtle)',
  focus: 'var(--color-focus)',
  gradientHero: 'var(--gradient-hero)',
  gradientSoft: 'var(--gradient-soft)',
  shadowFlat: 'var(--shadow-flat)',
  shadowCard: 'var(--shadow-card)',
  shadowHover: 'var(--shadow-hover)',
  shadowFloating: 'var(--shadow-floating)',
  stone: {
    50: 'var(--color-stone-50)',
    100: 'var(--color-stone-100)',
    200: 'var(--color-stone-200)',
    300: 'var(--color-stone-300)',
    400: 'var(--color-stone-400)',
    500: 'var(--color-stone-500)',
    600: 'var(--color-stone-600)',
    700: 'var(--color-stone-700)',
    800: 'var(--color-stone-800)',
    900: 'var(--color-stone-900)',
    950: 'var(--color-stone-950)',
  },
};

export const UI_TYPOGRAPHY = {
  fontFamily: 'var(--font-sans)',
  fontMono: 'var(--font-mono)',
  fontFeatures: '"cv02" 1, "cv03" 1, "cv04" 1, "cv11" 1, "ss01" 1, "tnum" 1',
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 24,
    '2xl': 30,
    '3xl': 36,
    '4xl': 48,
  },
  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
};

export const UI_SPACING = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
  9: 96,
};

export const UI_ELEVATION = {
  flat: 'var(--shadow-flat)',
  card: 'var(--shadow-card)',
  hover: 'var(--shadow-hover)',
  floating: 'var(--shadow-floating)',
};

export const UI_SIZE = {
  icon: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
  },
  control: {
    sm: 32,
    md: 40,
    lg: 44,
  },
};

export const uiTransition = (property = 'all', duration = UI_MOTION.duration.base, easing = UI_MOTION.easing.enter) =>
  `${property} ${duration}ms ${easing}`;

export const uiColorMix = (colorVar, alpha = 100) => `color-mix(in srgb, ${colorVar} ${alpha}%, transparent)`;
