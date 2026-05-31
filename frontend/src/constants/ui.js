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
