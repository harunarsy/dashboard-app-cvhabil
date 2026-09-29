import React, { useMemo, useRef, useEffect } from 'react';
import { formatExpiry } from "../../utils/expiry";
import { formatDateOnly } from "../../utils/dateOnly";
import JsBarcode from 'jsbarcode';
import { angkaKeTerbilang } from '../../utils/angkaKeTerbilang';
import { MONO } from '../../utils/documents/salesDocumentTheme';

const fmtRp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => formatDateOnly(d, { day: '2-digit', month: 'short', year: 'numeric' }, '');
const rgb = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

// Live preview dokumen nota — SATU bahasa desain dengan PDF monokrom v2/legacy:
// tinta hitam (#111), abu untuk metadata, mark H biru sebagai satu-satunya aksen.
const INK = rgb(MONO.ink);
const SUB = rgb(MONO.sub);
const FAINT = rgb(MONO.faint);
const RULE = rgb(MONO.rule);
const HEAD_FILL = rgb(MONO.headFill);
const ZEBRA = rgb(MONO.zebra);

export default function NotaPreview({ form = {}, items = [], settings = {}, ppnExcluded = false }) {
  const {
    customer_name, customer_address, customer_phone,
    payment_method, due_date, notes, order_number, sale_date,
  } = form;

  const companyName = settings.company_name || settings.shop_name || 'CV HABIL SEJAHTERA BERSAMA';
  const npwp = settings.npwp || '93.813.949.0-609.000';
  const address = settings.address || '';
  const phone = settings.phone || '';
  const footerText = settings.footer_text || settings.footer || '';
  const signerName = settings.signer_name || '';
  const bankInfo = settings.bank_info || '';
  const qrisText = settings.qris_text || '';
  const ketentuan = settings.ketentuan || '';

  const { dpp, ppn, ongkir, ccFee, totalBayar, terbilang } = useMemo(() => {
    const t = items.reduce((s, i) => {
      const qty = parseFloat(i.qty_in_unit ?? i.qty) || 0;
      const price = parseFloat(i.unit_price) || 0;
      return s + qty * price;
    }, 0);
    // DPP/PPN hanya dari nilai produk; ongkir & biaya kartu TANPA PPN (konsisten PDF)
    const d = t / 1.11;
    const p = t - d;
    const o = Math.max(0, parseFloat(form.ongkir) || 0);
    // v1.25.1: fee kartu kredit pass_on tampil di nota (gross-up, margin utuh);
    // absorb = internal, tidak ditampilkan ke customer
    const rate = (parseFloat(form.payment_fee_rate) || 0) / 100;
    const passOn =
      form.payment_method === 'Kartu Kredit' &&
      form.payment_fee_mode === 'pass_on' &&
      rate > 0 && rate < 1;
    const fee = passOn ? ((t + o) * rate) / (1 - rate) : 0;
    const grand = t + o + fee;
    const words = grand > 0 ? (angkaKeTerbilang(Math.round(grand)) + ' Rupiah').trim() : '';
    return { total: t, dpp: d, ppn: p, ongkir: o, ccFee: fee, totalBayar: grand, terbilang: words };
  }, [items, form.ongkir, form.payment_method, form.payment_fee_rate, form.payment_fee_mode]);

  const ketentuanLines = ketentuan.split('\n').filter(l => l.trim()).slice(0, 3);
  const ketentuanMore = ketentuan.split('\n').filter(l => l.trim()).length > 3;

  const estWeightGram = Math.max(0, parseInt(form.est_weight_gram) || 0);
  const estWeightKg = (estWeightGram / 1000).toFixed(2).replace('.', ',');

  const headerNo = order_number || 'AUTO';
  const headerDate = sale_date ? fmtDate(sale_date) : fmtDate(new Date());
  const displayNo = headerNo.startsWith('HSB-') ? headerNo : `HSB-NOTA-${headerNo}`;

  // v1.65.1: Ref & effect untuk barcode di antara heading dan nomor nota
  const barcodeRef = useRef(null);
  useEffect(() => {
    if (barcodeRef.current && displayNo && displayNo !== 'HSB-NOTA-AUTO') {
      try {
        JsBarcode(barcodeRef.current, displayNo, {
          format: 'CODE128',
          width: 1.2,
          height: 28,
          displayValue: false,
          margin: 0,
          valid: () => true,
        });
      } catch (err) {
        console.error('Barcode render error:', err);
      }
    }
  }, [displayNo]);

  return (
    // v1.67.20: pratinjau disajikan sebagai LEMBAR landscape (rasio kertas 210:148,
    // sama dengan orientasi cetak A5/A6 di generateNotaPDF). Kolom sempit → geser
    // kiri/kanan (overflowX), bukan memaksa tata letak berdiri/portrait.
    <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
      <div style={{
        backgroundColor: '#FFF', borderRadius: '10px', padding: '16px',
        border: '1px solid var(--color-border)', boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
        fontFamily: 'Helvetica, Arial, sans-serif', color: INK,
        minWidth: '520px', width: '100%', maxWidth: '680px', margin: '0 auto',
        aspectRatio: '210 / 148', display: 'flex', flexDirection: 'column',
      }}>
      {/* Header — logo mark H + identitas perusahaan (kiri), judul + metadata (kanan) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', gap: '10px', flex: 1, minWidth: 0 }}>
          <img
            src="/habil-mark.svg"
            alt="Mark Habil"
            style={{ width: '34px', height: '34px', flexShrink: 0, objectFit: 'contain' }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: '800', color: INK, marginBottom: '3px' }}>{companyName}</div>
            {npwp && <div style={{ fontSize: '11px', color: SUB }}>NPWP: {npwp}</div>}
            {address && <div style={{ fontSize: '11px', color: SUB, lineHeight: '1.45' }}>{address}</div>}
            {phone && <div style={{ fontSize: '11px', color: SUB }}>{phone}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: '800', color: INK, marginBottom: '2px' }}>NOTA PENJUALAN</div>
          {/* v1.65.1: Barcode SVG di antara heading dan nomor nota */}
          {displayNo && displayNo !== 'HSB-NOTA-AUTO' && (
            <div style={{ textAlign: 'center', marginBottom: '2px', maxWidth: '100%', overflow: 'hidden' }}>
              <svg ref={barcodeRef} style={{ maxWidth: '100%', height: 'auto' }} />
            </div>
          )}
          <div style={{ fontSize: '11px', color: SUB }}>No: {displayNo}</div>
          <div style={{ fontSize: '11px', color: SUB }}>{headerDate}</div>
          {due_date && (
            <div style={{ fontSize: '11px', color: INK, fontWeight: '700', marginTop: '2px' }}>Jatuh Tempo Pembayaran: {fmtDate(due_date)}</div>
          )}
          {payment_method && (
            <div style={{ fontSize: '11px', color: SUB, marginTop: '2px' }}>Metode: {payment_method}</div>
          )}
        </div>
      </div>

      <div style={{ height: '1.5px', backgroundColor: RULE, marginBottom: '8px' }} />

      {/* Customer — v1.23.0: No. HP & Alamat berlabel di bawah nama.
          v1.52.8: overflowWrap 'anywhere' supaya nama/HP/alamat panjang (mis. teks
          tanpa spasi) membungkus ke bawah, tidak narik melebar ke kanan. */}
      <div style={{ marginBottom: '8px', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
        <span style={{ fontSize: '11px', color: SUB }}>Kepada Yth: </span>
        <span style={{ fontSize: '11px', fontWeight: '700', color: INK, overflowWrap: 'anywhere' }}>{customer_name || '—'}</span>
        {customer_phone && <div style={{ fontSize: '11px', color: SUB, marginLeft: '52px', overflowWrap: 'anywhere' }}>{String(customer_phone).replace(/[^\d+()\-\s]/g, '').replace(/\s+/g, ' ').trim()}</div>}
        {customer_address && <div style={{ fontSize: '11px', color: SUB, marginLeft: '52px', lineHeight: '1.45', overflowWrap: 'anywhere' }}>{String(customer_address).trim()}</div>}
      </div>

      {/* Items table — headFill monokrom + zebra, tanpa garis (paritas PDF) */}
      <div style={{ borderRadius: '6px', overflow: 'hidden', marginBottom: '8px' }}>
        <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: HEAD_FILL }}>
              <th style={{ padding: '5px 5px', textAlign: 'center', width: '24px', color: INK }}>No</th>
              <th style={{ padding: '5px 5px', textAlign: 'left', color: INK }}>Nama Barang</th>
              <th style={{ padding: '5px 5px', textAlign: 'center', width: '48px', color: INK }}>Qty</th>
              <th style={{ padding: '5px 5px', textAlign: 'right', width: '76px', color: INK }}>Harga Satuan</th>
              <th style={{ padding: '5px 5px', textAlign: 'right', width: '80px', color: INK }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '12px', textAlign: 'center', color: FAINT, fontStyle: 'italic', fontSize: '11px' }}>Belum ada produk</td></tr>
            )}
            {items.map((it, idx) => {
              const qty = parseFloat(it.qty_in_unit ?? it.qty) || 0;
              const price = parseFloat(it.unit_price) || 0;
              const lineTotal = qty * price;
              const ed = formatExpiry(it.expired_date_snapshot, it.expired_date_snapshot_precision, "");
              const hasMeta = it.batch_no_snapshot || ed;
              return (
                <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#FFF' : ZEBRA }}>
                  <td style={{ padding: '5px 5px', textAlign: 'center', color: INK, verticalAlign: 'top', fontSize: '11px' }}>{idx + 1}</td>
                  <td style={{ padding: '5px 5px', color: INK, fontSize: '11px' }}>
                    <div>{it.product_name || '—'}</div>
                    {hasMeta && (
                      <div style={{ fontSize: '10px', color: SUB, marginTop: '1px' }}>
                        {it.batch_no_snapshot ? `Batch: ${it.batch_no_snapshot}` : ''}
                        {it.batch_no_snapshot && ed ? ' · ' : ''}
                        {ed ? `ED: ${ed}` : ''}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '5px 5px', textAlign: 'center', color: INK, verticalAlign: 'top', fontSize: '11px' }}>{qty} {it.unit || 'pcs'}</td>
                  <td style={{ padding: '5px 5px', textAlign: 'right', color: INK, verticalAlign: 'top', fontSize: '11px' }}>{fmtRp(price)}</td>
                  <td style={{ padding: '5px 5px', textAlign: 'right', color: INK, verticalAlign: 'top', fontWeight: '600', fontSize: '11px' }}>{fmtRp(lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Breakdown — ongkir & biaya kartu (pass_on) baris terpisah TANPA PPN */}
      <div style={{ textAlign: 'right', marginBottom: '8px' }}>
        {/* v1.65.0: Tampilkan DPP & PPN hanya jika ppnExcluded false */}
        {!ppnExcluded && (
          <>
            <div style={{ fontSize: '11px', color: SUB }}>Subtotal (DPP): {fmtRp(dpp)}</div>
            <div style={{ fontSize: '11px', color: SUB }}>PPN 11%: {fmtRp(ppn)}</div>
          </>
        )}
        {ongkir > 0 && (
          <div style={{ fontSize: '11px', color: SUB }}>Ongkir: {fmtRp(ongkir)}</div>
        )}
        {ccFee > 0 && (
          <div style={{ fontSize: '11px', color: SUB }}>Biaya Kartu Kredit: {fmtRp(ccFee)}</div>
        )}
        <div style={{ fontSize: '13px', fontWeight: '800', color: INK, marginTop: '2px' }}>GRAND TOTAL: {fmtRp(totalBayar)}</div>
      </div>

      {/* v1.67.20: blok bawah menempel ke dasar lembar (seperti cetak) — catatan
          di kiri, bank di tengah, tanda tangan kiri/kanan, footer di dasar. */}
      <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
      <div style={{ maxWidth: '58%' }}>
      {terbilang && (
        <div style={{ fontSize: '10px', color: SUB, fontStyle: 'italic', marginBottom: '6px' }}>Terbilang: {terbilang}</div>
      )}

      {estWeightGram > 0 && (
        <div style={{ fontSize: '10px', color: SUB, marginBottom: '6px' }}>Estimasi Berat Paket: {estWeightKg} kg</div>
      )}

      {notes && (
        <div style={{ fontSize: '10px', color: SUB, marginBottom: '6px' }}>Catatan: {notes}</div>
      )}

      {/* Ketentuan — tinta penuh (bukan aksen warna) */}
      {ketentuanLines.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: INK }}>NOTE:</div>
          {ketentuanLines.map((line, i) => (
            <div key={i} style={{ fontSize: '10px', color: INK }}>{i + 1}. {line}</div>
          ))}
          {ketentuanMore && <div style={{ fontSize: '10px', color: FAINT }}>…</div>}
        </div>
      )}
      </div>

      {/* Bank */}
      {bankInfo && (
        <div style={{ textAlign: 'center', fontSize: '10px', fontWeight: '700', color: INK, marginBottom: '4px' }}>REK {bankInfo}</div>
      )}
      {qrisText && (
        <div style={{ textAlign: 'center', fontSize: '10px', fontWeight: '700', color: INK, marginBottom: '6px' }}>{qrisText}</div>
      )}

      {/* Signatures */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', marginTop: '16px' }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '10px', color: INK }}>Penerima,</div>
          <div style={{ borderBottom: `1px solid ${INK}`, width: '80px', margin: '16px auto 5px' }} />
          <div style={{ fontSize: '10px', color: FAINT }}>(                    )</div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '10px', color: INK }}>Hormat kami,</div>
          <div style={{ borderBottom: `1px solid ${INK}`, width: '80px', margin: '16px auto 5px' }} />
          {signerName && <div style={{ fontSize: '10px', color: SUB }}>{signerName}</div>}
        </div>
      </div>

      {/* Footer */}
      {footerText && (
        <div style={{ borderTop: `1px dashed ${RULE}`, paddingTop: '6px', textAlign: 'center', marginTop: '8px' }}>
          <div style={{ fontSize: '10px', color: FAINT }}>{footerText}</div>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}
