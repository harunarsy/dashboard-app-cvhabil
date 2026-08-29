import {
  dateOnlyTimestamp,
  daysUntilDateOnly,
  parseDateOnly,
} from "./dateOnly";

describe("dateOnly", () => {
  it("mem-parsing DATE sebagai kalender lokal, bukan UTC", () => {
    const parsed = parseDateOnly("2026-08-30");
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(7);
    expect(parsed.getDate()).toBe(30);
    expect(parsed.getHours()).toBe(0);
  });

  it("countdown memakai selisih hari kalender", () => {
    const afterMidnight = new Date(2026, 7, 29, 0, 30);
    expect(daysUntilDateOnly("2026-08-30", afterMidnight)).toBe(1);
  });

  it("timestamp konsisten untuk DATE dan timestamp PostgreSQL", () => {
    expect(dateOnlyTimestamp("2029-05-31")).toBe(
      dateOnlyTimestamp("2029-05-31T00:00:00.000Z"),
    );
  });

  it("menolak tanggal kalender tidak valid", () => {
    expect(parseDateOnly("2026-02-31")).toBeNull();
  });
});
