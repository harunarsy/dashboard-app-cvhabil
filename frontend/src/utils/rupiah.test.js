import { hppFromHna, PPN_RATE } from "./rupiah";

test("PPN_RATE berasal dari @habil/core", () => {
  expect(PPN_RATE).toBe(0.11);
});

test("hppFromHna memberi hasil yang sama dengan core", () => {
  expect(hppFromHna(85500)).toBeCloseTo(94905, 2);
  expect(hppFromHna(87400)).toBeCloseTo(97014, 2);
});

test("nilai tidak sah tetap 0", () => {
  expect(hppFromHna("abc")).toBe(0);
});
