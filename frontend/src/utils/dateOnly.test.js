import {
  dateOnlyTimestamp,
  daysUntilDateOnly,
  formatDateOnly,
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

  it("formatter tanggal non-ED mempertahankan tanggal penuh, termasuk akhir bulan", () => {
    const options = { day: "2-digit", month: "short", year: "numeric" };
    expect(formatDateOnly("2027-05-12", options)).toBe("12 Mei 2027");
    expect(formatDateOnly("2028-02-29", options)).toBe("29 Feb 2028");
  });

  it("parser tanggal non-ED tidak mengartikan YYYY-MM sebagai akhir bulan", () => {
    expect(parseDateOnly("2028-02")).toBeNull();
  });
});
