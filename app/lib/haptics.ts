const v = (pattern: number | number[]) => {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
};

export const haptic = {
  tap:     () => v(8),
  light:   () => v(12),
  medium:  () => v(22),
  heavy:   () => v(40),
  tick:    () => v(6),
  success: () => v([10, 40, 15]),
  warning: () => v([25, 40, 25]),
  error:   () => v([30, 50, 30, 50, 30]),
  signal:  () => v([15, 30, 15, 30, 25]),
  double:  () => v([8, 60, 8]),
};
