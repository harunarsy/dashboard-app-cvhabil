import React from 'react';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

// Live preview dokumen Surat Pesanan — mirror NotaPreview, TANPA harga/total.
// SP = daftar pesanan barang (produk + qty + satuan). Harga masuk via Faktur Pembelian.
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
      fontFamily: 'Helvetica, Arial, sans-serif', color: '#000',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '8px' }}>
        <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--color-action)', marginBottom: '3px' }}>{companyName}</div>
        <div style={{ fontSize: '9px', color: '#555' }}>NPWP: {settings.npwp || '93.813.949.0-609.000'}</div>
        {address && <div style={{ fontSize: '9px', color: '#555', lineHeight: '1.4' }}>{address}</div>}
        {phone && <div style={{ fontSize: '9px', color: '#555' }}>{phone}</div>}
        <div style={{ fontSize: '12px', fontWeight: '800', color: '#000', marginTop: '6px', letterSpacing: '0.05em' }}>SURAT PESANAN</div>
      </div>

      <div style={{ height: '1.5px', backgroundColor: 'var(--color-action)', marginBottom: '8px', borderRadius: '2px' }} />

      {/* Recipient + meta */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '9px', color: '#555' }}>Kepada Yth:</div>
          <div style={{ fontSize: '10px', fontWeight: '700', color: '#000' }}>{distributor_name || '—'}</div>
          {distributor_address && <div style={{ fontSize: '8px', color: '#777' }}>{distributor_address}</div>}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '8px', color: '#777' }}>No. SP: {headerNo}</div>
          <div style={{ fontSize: '8px', color: '#777' }}>Tanggal: {headerDate}</div>
          {expected_date && <div style={{ fontSize: '8px', color: '#777' }}>Est. Tiba: {fmtDate(expected_date)}</div>}
        </div>
      </div>

      {/* Items table — TANPA harga */}
      <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: '6px', overflow: 'hidden', marginBottom: '8px', border: '1px solid var(--color-action)' }}>
        <table style={{ width: '100%', fontSize: '8px', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--color-action)', color: '#FFF' }}>
              <th style={{ padding: '4px 5px', textAlign: 'center', width: '24px' }}>No</th>
              <th style={{ padding: '4px 5px', textAlign: 'left' }}>Nama Barang</th>
              <th style={{ padding: '4px 5px', textAlign: 'center', width: '48px' }}>Qty</th>
              <th style={{ padding: '4px 5px', textAlign: 'center', width: '56px' }}>Satuan</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={4} style={{ padding: '12px', textAlign: 'center', color: '#999', fontStyle: 'italic' }}>Belum ada produk</td></tr>
            )}
            {items.map((it, idx) => (
              <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#FFF' : '#FAFAFA' }}>
                <td style={{ padding: '4px 5px', textAlign: 'center', color: 'var(--color-border-strong)', verticalAlign: 'top' }}>{idx + 1}</td>
                <td style={{ padding: '4px 5px', color: 'var(--color-border-strong)' }}>{it.product_name || '—'}</td>
                <td style={{ padding: '4px 5px', textAlign: 'center', color: 'var(--color-border-strong)', verticalAlign: 'top' }}>{parseFloat(it.qty) || 0}</td>
                <td style={{ padding: '4px 5px', textAlign: 'center', color: 'var(--color-border-strong)', verticalAlign: 'top' }}>{it.unit || 'pcs'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {notes && (
        <div style={{ fontSize: '7px', color: '#777', marginBottom: '6px' }}>Catatan: {notes}</div>
      )}

      {/* Signature — sisi kanan saja (mirror generateSPPDF) */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', marginBottom: '6px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '8px', color: '#555' }}>Hormat Kami,</div>
          <div style={{ borderBottom: '1px solid #555', width: '100px', margin: '18px auto 5px' }} />
          <div style={{ fontSize: '8px', fontWeight: '700', color: '#333' }}>{pic_name || 'Harun Al Rasyid'}</div>
        </div>
      </div>

      {/* Footer */}
      {footerText && (
        <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: '6px', textAlign: 'center', marginTop: '8px' }}>
          <div style={{ fontSize: '7px', color: '#AEAEB2' }}>{footerText}</div>
        </div>
      )}
    </div>
  );
}
