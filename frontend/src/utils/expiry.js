import { daysUntilDateOnly } from "./dateOnly";

export const expiryDate = (value, precision) => {
  if (precision != null && precision !== "month" && precision !== "day") return null;
  const source = String(value ?? "").trim();
  const match = source.match(/^(\d{4})-(\d{2})(?:-(\d{2})(?:$|T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$))?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || year < 1) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const lastDay = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  const day = match[3] ? Number(match[3]) : lastDay;
  if (!match[3] && precision === "day") return null;
  if (day < 1 || day > lastDay || (precision === "month" && day !== lastDay)) return null;
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
};

export const formatExpiry = (value, precision, fallback = "-") => {
  const date = expiryDate(value, precision);
  if (!date) return fallback;
  const monthOnly = precision === "month" || /^\d{4}-\d{2}$/.test(String(value).trim());
  return date.toLocaleDateString("id-ID", {
    ...(monthOnly ? {} : { day: "2-digit" }),
    month: "short",
    year: "numeric",
  });
};

export const expiryInputValue = (value, precision) => {
  const date = expiryDate(value, precision);
  if (!date) return "";
  const yearMonth = `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  return precision === "month"
    ? yearMonth
    : `${yearMonth}-${String(date.getDate()).padStart(2, "0")}`;
};

export const expiryTimestamp = (value, precision) => expiryDate(value, precision)?.getTime() ?? null;
export const daysUntilExpiry = (value, precision, now = new Date()) =>
  daysUntilDateOnly(expiryDate(value, precision), now);
