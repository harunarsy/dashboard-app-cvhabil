import { describe, expect, it } from 'vitest';
import { angkaKeTerbilang } from './angkaKeTerbilang';

describe('angkaKeTerbilang', () => {
  it('nilai di bawah satu miliar tidak berubah (batas juta)', () => {
    expect(angkaKeTerbilang(999999999)).toBe(
      ' Sembilan Ratus Sembilan Puluh Sembilan Juta Sembilan Ratus Sembilan Puluh Sembilan Ribu Sembilan Ratus Sembilan Puluh Sembilan',
    );
  });

  it('nilai miliar dengan sisa juta/ribu dirangkai penuh', () => {
    expect(angkaKeTerbilang(1234567890)).toBe(
      ' Satu Miliar Dua Ratus Tiga Puluh Empat Juta Lima Ratus Enam Puluh Tujuh Ribu Delapan Ratus Sembilan Puluh ',
    );
  });

  it('nilai miliar dengan sisa kecil', () => {
    expect(angkaKeTerbilang(1000000001)).toBe(' Satu Miliar Satu');
  });

  it('nilai triliun dengan sisa kecil', () => {
    expect(angkaKeTerbilang(1000000000001)).toBe(' Satu Triliun Satu');
  });
});
