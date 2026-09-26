import React from 'react';
import { MONO } from '../../utils/documents/salesDocumentTheme';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const rgb = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

// Live preview dokumen Surat Pesanan — SATU bahasa desain dengan nota & PDF SP:
// tinta monokrom + mark H biru sebagai aksen tunggal, TANPA harga/total.
// SP = daftar pesanan barang (produk + qty + satuan). Harga masuk via Faktur Pembelian.
const INK = rgb(MONO.ink);
const SUB = rgb(MONO.sub);
const FAINT = rgb(MONO.faint);
const RULE = rgb(MONO.rule);
const HEAD_FILL = rgb(MONO.headFill);
const ZEBRA = rgb(MONO.zebra);

export default function SPPreview({ form = {}, items = [], settings = {} }) {
  const {
    distributor_name, distributor_address,
    po_number, order_date, expected_date, pic_name, notes,
  } = form;

  const companyName = settings.company_name || settings.shop_name || 'CV HABIL SEJAHTERA BERSAMA';
  const address = settings.address || '';
  const phone = settings.phone || '';
  const footerText = settings.footer_text || settings.footer || '';

  const headerNo = po_number || 'AUTO';
  const headerDate = order_date ? fmtDate(order_date) : fmtDate(new Date());

  return (
    <div style={{
      backgroundColor: '#FFF', borderRadius: '10px', padding: '16px',
      border: '1px solid var(--color-border)', boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      fontFamily: 'Helvetica, Arial, sans-serif', color: INK,
    }}>
      {/* Header — logo mark H + identitas perusahaan (kiri), judul + metadata (kanan) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
        <div style={{ display: 'flex', gap: '10px', flex: 1, minWidth: 0 }}>
          <img
            src="/habil-mark.svg"
            alt="Mark Habil"
            style={{ width: '30px', height: '30px', flexShrink: 0, objectFit: 'contain' }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '12px', fontWeight: '800', color: INK, marginBottom: '2px' }}>{companyName}</div>
            <div style={{ fontSize: '9px', color: SUB }}>NPWP: {settings.npwp || '93.813.949.0-609.000'}</div>
            {address && <div style={{ fontSize: '9px', color: SUB, lineHeight: '1.4' }}>{address}</div>}
            {phone && <div style={{ fontSize: '9px', color: SUB }}>{phone}</div>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '12px', fontWeight: '800', color: INK, letterSpacing: '0.05em', marginBottom: '2px' }}>SURAT PESANAN</div>
          <div style={{ fontSize: '9px', color: SUB }}>No. SP: {headerNo}</div>
          <div style={{ fontSize: '9px', color: SUB }}>Tanggal: {headerDate}</div>
          {expected_date && <div style={{ fontSize: '9px', color: SUB }}>Est. Tiba: {fmtDate(expected_date)}</div>}
        </div>
      </div>

      <div style={{ height: '1.5px', backgroundColor: RULE, marginBottom: '8px' }} />

      {/* Recipient */}
      <div style={{ marginBottom: '8px', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
        <div style={{ fontSize: '9px', color: SUB }}>Kepada Yth:</div>
        <div style={{ fontSize: '10px', fontWeight: '700', color: INK }}>{distributor_name || '—'}</div>
        {distributor_address && <div style={{ fontSize: '8px', color: SUB }}>{distributor_address}</div>}
      </div>

      {/* Items table — TANPA harga */}
      <div style={{ borderRadius: '6px', overflow: 'hidden', marginBottom: '8px' }}>
        <table style={{ width: '100%', fontSize: '8px', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: HEAD_FILL }}>
              <th style={{ padding: '4px 5px', textAlign: 'center', width: '24px', color: INK }}>No</th>
              <th style={{ padding: '4px 5px', textAlign: 'left', color: INK }}>Nama Barang</th>
              <th style={{ padding: '4px 5px', textAlign: 'center', width: '48px', color: INK }}>Qty</th>
              <th style={{ padding: '4px 5px', textAlign: 'center', width: '56px', color: INK }}>Satuan</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={4} style={{ padding: '12px', textAlign: 'center', color: FAINT, fontStyle: 'italic' }}>Belum ada produk</td></tr>
            )}
            {items.map((it, idx) => (
              <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#FFF' : ZEBRA }}>
                <td style={{ padding: '4px 5px', textAlign: 'center', color: INK, verticalAlign: 'top' }}>{idx + 1}</td>
                <td style={{ padding: '4px 5px', color: INK }}>{it.product_name || '—'}</td>
                <td style={{ padding: '4px 5px', textAlign: 'center', color: INK, verticalAlign: 'top' }}>{parseFloat(it.qty) || 0}</td>
                <td style={{ padding: '4px 5px', textAlign: 'center', color: INK, verticalAlign: 'top' }}>{it.unit || 'pcs'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {notes && (
        <div style={{ fontSize: '8px', color: SUB, marginBottom: '6px' }}>Catatan: {notes}</div>
      )}

      {/* Signature — sisi kanan saja (mirror generateSPPDF) */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', marginBottom: '6px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '8px', color: INK }}>Hormat Kami,</div>
          <div style={{ borderBottom: `1px solid ${INK}`, width: '100px', margin: '18px auto 5px' }} />
          <div style={{ fontSize: '8px', fontWeight: '700', color: INK }}>{pic_name || 'Harun Al Rasyid'}</div>
        </div>
      </div>

      {/* Footer */}
      {footerText && (
        <div style={{ borderTop: `1px dashed ${RULE}`, paddingTop: '6px', textAlign: 'center', marginTop: '8px' }}>
          <div style={{ fontSize: '7px', color: FAINT }}>{footerText}</div>
        </div>
      )}
    </div>
  );
}
