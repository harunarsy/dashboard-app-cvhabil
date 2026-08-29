const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

export const parseDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  const match = String(value).match(DATE_ONLY_RE);
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day)
  ) {
    return null;
  }
  return parsed;
};

export const dateOnlyTimestamp = (value) => parseDateOnly(value)?.getTime() ?? null;

export const daysUntilDateOnly = (value, now = new Date()) => {
  const target = parseDateOnly(value);
  if (!target) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
};

export const formatDateOnly = (value, options, fallback = "-") => {
  const parsed = parseDateOnly(value);
  return parsed ? parsed.toLocaleDateString("id-ID", options) : fallback;
};
