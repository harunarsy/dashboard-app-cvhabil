import { describe, expect, it, vi } from 'vitest';
import { getMonochromeLogoDataUrl } from './monochromeLogo';

describe('logo Habil untuk dokumen', () => {
  it('memuat mark H Figma lokal, bukan ikon React bawaan', async () => {
    let loadedUrl = '';
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
    vi.stubGlobal('Image', class {
      naturalWidth = 240;
      naturalHeight = 233;
      set src(value) {
        loadedUrl = value;
        this.onload?.();
      }
    });
    const result = await getMonochromeLogoDataUrl();
    expect(loadedUrl).toBe('/habil-mark.svg');
    expect(result).toMatch(/^data:image\/png/);
    vi.unstubAllGlobals();
  });
});
