import React, { useMemo } from 'react';
import { angkaKeTerbilang } from '../../utils/angkaKeTerbilang';

const fmtRp = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

export default function NotaPreview({ form = {}, items = [], settings = {} }) {
  const {
    customer_name, customer_address, customer_phone,
    payment_method, due_date, notes, order_number, sale_date,
  } = form;

  const companyName = settings.company_name || settings.shop_name || 'CV HABIL SEJAHTERA BERSAMA';
  const address = settings.address || '';
  const phone = settings.phone || '';
  const footerText = settings.footer_text || settings.footer || '';
  const signerName = settings.signer_name || '';
  const bankInfo = settings.bank_info || '';
  const qrisText = settings.qris_text || '';
  const ketentuan = settings.ketentuan || '';

  const isCash = payment_method === 'Tunai' || payment_method === 'Cash';

  const { total, dpp, ppn, terbilang } = useMemo(() => {
    const t = items.reduce((s, i) => {
      const qty = parseFloat(i.qty_in_unit ?? i.qty) || 0;
      const price = parseFloat(i.unit_price) || 0;
      return s + qty * price;
    }, 0);
    const d = t / 1.11;
    const p = t - d;
    const words = t > 0 ? (angkaKeTerbilang(Math.round(t)) + ' Rupiah').trim() : '';
    return { total: t, dpp: d, ppn: p, terbilang: words };
  }, [items]);

  const ketentuanLines = ketentuan.split('\n').filter(l => l.trim()).slice(0, 3);
  const ketentuanMore = ketentuan.split('\n').filter(l => l.trim()).length > 3;

  const headerNo = order_number || 'AUTO';
  const headerDate = sale_date ? fmtDate(sale_date) : fmtDate(new Date());
  const displayNo = headerNo.startsWith('HSB-') ? headerNo : `HSB-NOTA-${headerNo}`;

  return (
    <div style={{
      backgroundColor: '#FFF', borderRadius: '10px', padding: '16px',
      border: '1px solid var(--color-border)', boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
      fontFamily: 'Helvetica, Arial, sans-serif', color: '#000',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--color-primary)', marginBottom: '3px' }}>{companyName}</div>
          {address && <div style={{ fontSize: '9px', color: '#555', lineHeight: '1.4' }}>{address}</div>}
          {phone && <div style={{ fontSize: '9px', color: '#555' }}>{phone}</div>}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '11px', fontWeight: '800', color: '#000', marginBottom: '2px' }}>NOTA PENJUALAN</div>
          <div style={{ fontSize: '8px', color: '#777' }}>No: {displayNo}</div>
          <div style={{ fontSize: '8px', color: '#777' }}>{headerDate}</div>
          {due_date && !isCash && (
            <div style={{ fontSize: '8px', color: 'var(--color-danger)', fontWeight: '700', marginTop: '2px' }}>JT: {fmtDate(due_date)}</div>
          )}
          {payment_method && (
            <div style={{ fontSize: '8px', color: '#555', marginTop: '2px' }}>Metode: {payment_method}</div>
          )}
        </div>
      </div>

      <div style={{ height: '1.5px', backgroundColor: 'var(--color-primary)', marginBottom: '8px', borderRadius: '2px' }} />

      {/* Customer */}
      <div style={{ marginBottom: '8px' }}>
        <span style={{ fontSize: '9px', color: '#555' }}>Kepada Yth: </span>
        <span style={{ fontSize: '9px', fontWeight: '700', color: '#000' }}>{customer_name || '—'}</span>
        {customer_address && <div style={{ fontSize: '8px', color: '#777', marginLeft: '52px' }}>{customer_address}</div>}
        {customer_phone && <div style={{ fontSize: '8px', color: '#777', marginLeft: '52px' }}>Telp: {customer_phone}</div>}
      </div>

      {/* Items table */}
      <div style={{ backgroundColor: 'var(--color-bg)', borderRadius: '6px', overflow: 'hidden', marginBottom: '8px', border: '1px solid var(--color-primary)' }}>
        <table style={{ width: '100%', fontSize: '8px', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--color-primary)', color: '#FFF' }}>
              <th style={{ padding: '4px 5px', textAlign: 'center', width: '24px' }}>No</th>
              <th style={{ padding: '4px 5px', textAlign: 'left' }}>Nama Barang</th>
              <th style={{ padding: '4px 5px', textAlign: 'center', width: '48px' }}>Qty</th>
              <th style={{ padding: '4px 5px', textAlign: 'right', width: '70px' }}>Harga</th>
              <th style={{ padding: '4px 5px', textAlign: 'right', width: '80px' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '12px', textAlign: 'center', color: '#999', fontStyle: 'italic' }}>Belum ada produk</td></tr>
            )}
            {items.map((it, idx) => {
              const qty = parseFloat(it.qty_in_unit ?? it.qty) || 0;
              const price = parseFloat(it.unit_price) || 0;
              const lineTotal = qty * price;
              const ed = fmtDate(it.expired_date_snapshot);
              const hasMeta = it.batch_no_snapshot || ed;
              return (
                <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#FFF' : '#FAFAFA' }}>
                  <td style={{ padding: '4px 5px', textAlign: 'center', color: 'var(--color-border-strong)', verticalAlign: 'top' }}>{idx + 1}</td>
                  <td style={{ padding: '4px 5px', color: 'var(--color-border-strong)' }}>
                    <div>{it.product_name || '—'}</div>
                    {hasMeta && (
                      <div style={{ fontSize: '7px', color: '#777', marginTop: '1px' }}>
                        {it.batch_no_snapshot ? `Batch: ${it.batch_no_snapshot}` : ''}
                        {it.batch_no_snapshot && ed ? ' · ' : ''}
                        {ed ? `ED: ${ed}` : ''}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '4px 5px', textAlign: 'center', color: 'var(--color-border-strong)', verticalAlign: 'top' }}>{qty} {it.unit || 'pcs'}</td>
                  <td style={{ padding: '4px 5px', textAlign: 'right', color: 'var(--color-border-strong)', verticalAlign: 'top' }}>{fmtRp(price)}</td>
                  <td style={{ padding: '4px 5px', textAlign: 'right', color: 'var(--color-border-strong)', verticalAlign: 'top', fontWeight: '600' }}>{fmtRp(lineTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Breakdown */}
      <div style={{ textAlign: 'right', marginBottom: '8px' }}>
        <div style={{ fontSize: '8px', color: '#555' }}>Subtotal (DPP): {fmtRp(dpp)}</div>
        <div style={{ fontSize: '8px', color: '#555' }}>PPN 11%: {fmtRp(ppn)}</div>
        <div style={{ fontSize: '10px', fontWeight: '800', color: '#000', marginTop: '2px' }}>GRAND TOTAL: {fmtRp(total)}</div>
      </div>

      {terbilang && (
        <div style={{ fontSize: '7px', color: '#666', fontStyle: 'italic', marginBottom: '6px' }}>Terbilang: {terbilang}</div>
      )}

      {notes && (
        <div style={{ fontSize: '7px', color: '#777', marginBottom: '6px' }}>Catatan: {notes}</div>
      )}

      {/* Ketentuan */}
      {ketentuanLines.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '7px', fontWeight: '700', color: 'var(--color-danger)' }}>NOTE:</div>
          {ketentuanLines.map((line, i) => (
            <div key={i} style={{ fontSize: '7px', color: 'var(--color-danger)' }}>{i + 1}. {line}</div>
          ))}
          {ketentuanMore && <div style={{ fontSize: '7px', color: 'var(--color-danger)', opacity: 0.6 }}>…</div>}
        </div>
      )}

      {/* Bank */}
      {bankInfo && (
        <div style={{ textAlign: 'center', fontSize: '8px', fontWeight: '700', color: '#000', marginBottom: '4px' }}>REK {bankInfo}</div>
      )}
      {qrisText && (
        <div style={{ textAlign: 'center', fontSize: '8px', fontWeight: '700', color: '#000', marginBottom: '6px' }}>{qrisText}</div>
      )}

      {/* Signatures */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', marginTop: '12px' }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '8px', color: '#555' }}>Penerima,</div>
          <div style={{ borderBottom: '1px solid #555', width: '80px', margin: '14px auto 2px' }} />
          <div style={{ fontSize: '8px', color: '#999' }}>(                    )</div>
        </div>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: '8px', color: '#555' }}>Hormat kami,</div>
          <div style={{ borderBottom: '1px solid #555', width: '80px', margin: '14px auto 2px' }} />
          {signerName && <div style={{ fontSize: '8px', color: '#333' }}>{signerName}</div>}
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
