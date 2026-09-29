const invalidExpiry = () => Object.assign(
  new Error('Expired Date tidak valid. Gunakan YYYY-MM atau YYYY-MM-DD dengan precision day/month.'),
  { code: 'INVALID_DATE', status: 400, statusCode: 400 },
);

const normalizeExpiry = (value, precision) => {
  if (precision != null && !['day', 'month'].includes(precision)) throw invalidExpiry();
  if (value == null || String(value).trim() === '') return { date: null, precision: null };
  let text;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw invalidExpiry();
    text = value.toISOString().slice(0, 10);
  } else {
    text = String(value).trim();
  }
  const match = text.match(/^(\d{4})-(\d{2})(?:-(\d{2})(?:$|T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$))?$/);
  if (!match) throw invalidExpiry();
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  if (year < 1 || month < 1 || month > 12) throw invalidExpiry();
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const last = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  const day = d === undefined ? last : Number(d);
  const resolved = precision ?? (d === undefined ? 'month' : 'day');
  if (day < 1 || day > last || (d === undefined && resolved === 'day')
    || (resolved === 'month' && day !== last)) throw invalidExpiry();
  return { date: `${y}-${m}-${String(day).padStart(2, '0')}`, precision: resolved };
};

// An omitted precision on an unchanged canonical DATE is an edit, not a mode switch.
const normalizeExpiryEdit = (value, precision, currentValue, currentPrecision) => {
  const nextValue = value === undefined ? currentValue : value;
  const next = normalizeExpiry(nextValue, precision);
  if (precision == null && next.date && next.date === normalizeExpiry(currentValue).date
    && !/^\d{4}-\d{2}$/.test(String(nextValue).trim())) {
    return normalizeExpiry(next.date, currentPrecision);
  }
  return next;
};

module.exports = { normalizeExpiry, normalizeExpiryEdit };
