import React from 'react';

// pdf.js + canvas nyata tidak jalan di jsdom → mock modul loader sepenuhnya.
vi.mock('../../utils/pdfjsSetup', () => ({
  getPdfjs: vi.fn(),
}));

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PdfPreviewPanel from './PdfPreviewPanel';
import { getPdfjs } from '../../utils/pdfjsSetup';

const makePdfjsMock = () => ({
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 2,
      getPage: async () => ({
        getViewport: ({ scale }) => ({ width: 600 * scale, height: 850 * scale }),
        render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
      }),
    }),
    destroy: vi.fn(),
  }),
});

const makeBlob = () => new Blob(['%PDF-1.4 dummy'], { type: 'application/pdf' });

const baseProps = () => ({
  blob: null,
  loading: false,
  error: null,
  onRetry: vi.fn(),
  format: 'A5',
  onFormatChange: vi.fn(),
  onDownload: vi.fn(),
  onPrint: vi.fn(),
  actionsDisabled: false,
  isMobile: false,
});

const setup = (overrides = {}) => {
  const props = { ...baseProps(), ...overrides };
  const utils = render(<PdfPreviewPanel {...props} />);
  return { ...utils, props };
};

describe('PdfPreviewPanel', () => {
  beforeEach(() => {
    getPdfjs.mockResolvedValue(makePdfjsMock());
  });

  test('menampilkan state loading dan menonaktifkan aksi', () => {
    setup({ loading: true, blob: makeBlob() });

    expect(screen.getByText('Menyiapkan PDF…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unduh PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cetak' })).toBeDisabled();
    // Jumlah halaman selalu terlihat walau masih memuat.
    expect(screen.getByText(/^Hal/)).toBeInTheDocument();
  });

  test('menampilkan error dan tombol "Coba lagi" memanggil onRetry', () => {
    const { props } = setup({ error: 'Gagal menyiapkan PDF', blob: makeBlob() });

    expect(screen.getByText('Gagal menyiapkan PDF')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Unduh PDF' })).toBeDisabled();
  });

  test('menampilkan jumlah halaman setelah PDF termuat', async () => {
    setup({ blob: makeBlob() });

    expect(await screen.findByText('Hal 1 / 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Halaman sebelumnya' })).toBeDisabled();
  });

  test('navigasi halaman mengubah label dan menghormati batas', async () => {
    setup({ blob: makeBlob() });

    await screen.findByText('Hal 1 / 2');
    fireEvent.click(screen.getByRole('button', { name: 'Halaman berikutnya' }));

    expect(await screen.findByText('Hal 2 / 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Halaman berikutnya' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Halaman sebelumnya' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Halaman sebelumnya' }));
    expect(await screen.findByText('Hal 1 / 2')).toBeInTheDocument();
  });

  test('zoom +/− mengubah label persentase', async () => {
    setup({ blob: makeBlob() });

    expect(screen.getByText('100%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Perbesar' }));
    expect(screen.getByText('125%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Perkecil' }));
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  test('tombol ukuran memanggil onFormatChange dan menandai pilihan aktif', () => {
    const { props } = setup({ format: 'A5', blob: makeBlob() });

    expect(screen.getByRole('button', { name: 'Ukuran A5' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Ukuran A6' }));
    expect(props.onFormatChange).toHaveBeenCalledWith('A6');
  });

  test('aksi Unduh/Cetak aktif saat PDF siap dan memanggil handler', async () => {
    const { props } = setup({ blob: makeBlob() });

    const download = screen.getByRole('button', { name: 'Unduh PDF' });
    const print = screen.getByRole('button', { name: 'Cetak' });
    await waitFor(() => expect(download).toBeEnabled());
    expect(print).toBeEnabled();

    fireEvent.click(download);
    fireEvent.click(print);
    expect(props.onDownload).toHaveBeenCalledTimes(1);
    expect(props.onPrint).toHaveBeenCalledTimes(1);
  });

  test('actionsDisabled menonaktifkan Unduh/Cetak walau PDF siap', async () => {
    setup({ blob: makeBlob(), actionsDisabled: true });

    const download = screen.getByRole('button', { name: 'Unduh PDF' });
    await waitFor(() => expect(download).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Cetak' })).toBeDisabled();
  });

  test('kegagalan pdf.js tidak memblokir Unduh/Cetak — blob tetap valid', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getPdfjs.mockRejectedValue(new Error('pdf.js tidak didukung browser ini'));
    const { props } = setup({ blob: makeBlob() });

    expect(await screen.findByText('pdf.js tidak didukung browser ini')).toBeInTheDocument();
    const download = screen.getByRole('button', { name: 'Unduh PDF' });
    await waitFor(() => expect(download).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Cetak' })).toBeEnabled();

    fireEvent.click(download);
    expect(props.onDownload).toHaveBeenCalledTimes(1);
    // Retry di sini memuat ulang pdf.js, bukan membangun blob baru.
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(props.onRetry).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  test('tanpa blob menampilkan placeholder, bukan error', () => {
    setup({ blob: null });

    expect(screen.getByText(/Pratinjau belum tersedia/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Coba lagi' })).not.toBeInTheDocument();
  });

  test('render validation blockers & warnings (slot Task 17)', () => {
    setup({
      blob: makeBlob(),
      validation: {
        blockers: [{ message: 'Nomor nota belum final' }],
        warnings: [{ message: 'NPWP pembeli kosong' }],
      },
    });

    expect(screen.getByText('Nomor nota belum final')).toBeInTheDocument();
    expect(screen.getByText('NPWP pembeli kosong')).toBeInTheDocument();
  });

  test('blocker memblokir Unduh/Cetak dan menampilkan pesan + heading merah', async () => {
    setup({
      blob: makeBlob(),
      validation: {
        blockers: [
          { code: 'inconsistent_totals', message: 'Nominal dokumen tidak konsisten' },
        ],
        warnings: [],
      },
    });

    expect(screen.getByText('Dokumen belum bisa dicetak')).toBeInTheDocument();
    expect(screen.getByText('Nominal dokumen tidak konsisten')).toBeInTheDocument();
    const download = screen.getByRole('button', { name: 'Unduh PDF' });
    await waitFor(() => expect(download).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Cetak' })).toBeDisabled();
  });

  test('hanya warning → aksi tetap aktif dan pesan kuning tampil', async () => {
    setup({
      blob: makeBlob(),
      validation: {
        blockers: [],
        warnings: [
          { code: 'missing_due_date', message: 'Transaksi tempo belum memiliki tanggal jatuh tempo' },
        ],
      },
    });

    expect(screen.getByText('Peringatan')).toBeInTheDocument();
    expect(
      screen.getByText('Transaksi tempo belum memiliki tanggal jatuh tempo'),
    ).toBeInTheDocument();
    const download = screen.getByRole('button', { name: 'Unduh PDF' });
    await waitFor(() => expect(download).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Cetak' })).toBeEnabled();
  });
});
