import { daysUntilDateOnly } from "./dateOnly";
import { expiryDate, expiryInputValue, formatExpiry } from "./expiry";

describe("formatExpiry", () => {
  it.each([
    ["2027-09", "month", "Sep 2027"],
    ["2027-09-30", "month", "Sep 2027"],
    ["2028-02-29T00:00:00.000Z", "month", "Feb 2028"],
    ["2027-05-12", undefined, "12 Mei 2027"],
    ["2027-05-12", null, "12 Mei 2027"],
    ["2027-05-12T00:00:00.000Z", undefined, "12 Mei 2027"],
    ["2027-09-30", "day", "30 Sep 2027"],
    ["2027-09-30", null, "30 Sep 2027"],
  ])("format %s dengan precision %s menjadi %s", (value, precision, label) => {
    expect(formatExpiry(value, precision)).toBe(label);
  });

  it.each([null, undefined, "", "   ", "not-a-date", "2027-02-29"])(
    "memakai fallback untuk ED kosong atau tidak valid: %s",
    (value) => {
      expect(formatExpiry(value)).toBe("-");
      expect(formatExpiry(value, undefined, "Belum ada ED")).toBe("Belum ada ED");
    },
  );
});

describe("expiryDate", () => {
  it.each([
    ["2028-02", "month", 2028, 1, 29],
    ["2027-02", "month", 2027, 1, 28],
    ["2100-02", "month", 2100, 1, 28],
    ["2000-02", "month", 2000, 1, 29],
    ["2027-04", "month", 2027, 3, 30],
    ["2027-12", "month", 2027, 11, 31],
    ["2028-02-29", "month", 2028, 1, 29],
    ["2027-05-12", undefined, 2027, 4, 12],
    ["2027-05-12", null, 2027, 4, 12],
    ["2027-05-12", "day", 2027, 4, 12],
    ["2027-05-12T00:00:00.000Z", "day", 2027, 4, 12],
    ["2027-05-12T00:30:00+14:00", "day", 2027, 4, 12],
    ["2027-05-12T23:30:00-12:00", "day", 2027, 4, 12],
  ])(
    "mem-parsing %s (%s) sebagai kalender lokal tanpa menggeser hari",
    (value, precision, year, month, day) => {
      const parsed = expiryDate(value, precision);
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed.getFullYear()).toBe(year);
      expect(parsed.getMonth()).toBe(month);
      expect(parsed.getDate()).toBe(day);
      expect(parsed.getHours()).toBe(0);
    },
  );

  it.each([
    [null, null],
    ["", "month"],
    ["   ", "day"],
    ["not-a-date", undefined],
    ["2027-00", "month"],
    ["2027-13", "month"],
    ["2027-02-29", "day"],
    ["2028-02-30", "month"],
    ["2027-04-31", "day"],
    ["2027-05-12garbage", "day"],
    ["2027-05-12T99:00:00Z", "day"],
    ["2100-02-29", "day"],
    ["2027-05-12", "month"],
    ["2027-05-31", "week"],
  ])("ED invalid %s (%s) tidak menjadi tanggal expired", (value, precision) => {
    expect(expiryDate(value, precision)).toBeNull();
    expect(daysUntilDateOnly(expiryDate(value, precision))).toBeNull();
  });

  it.each([
    [new Date(2028, 1, 28, 23, 59), 1],
    [new Date(2028, 1, 29, 0, 1), 0],
    [new Date(2028, 1, 29, 23, 59), 0],
    [new Date(2028, 2, 1, 0, 1), -1],
  ])("countdown ED Februari kabisat memakai hari lokal (%s)", (now, days) => {
    expect(daysUntilDateOnly(expiryDate("2028-02", "month"), now)).toBe(days);
  });
});

describe("expiryInputValue", () => {
  it.each([
    ["2027-09-30", "month", "2027-09"],
    ["2028-02-29T00:00:00.000Z", "month", "2028-02"],
    ["2028-02", "month", "2028-02"],
    ["2027-05-12", undefined, "2027-05-12"],
    ["2027-05-12", null, "2027-05-12"],
    ["2027-05-12T00:00:00.000Z", "day", "2027-05-12"],
    ["2027-09-30", "day", "2027-09-30"],
    [null, null, ""],
    ["", "month", ""],
  ])("nilai input %s (%s) menjadi %s", (value, precision, inputValue) => {
    expect(expiryInputValue(value, precision)).toBe(inputValue);
  });
});
