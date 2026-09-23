import { computeTotals } from './salesDocumentModel';
import { DOCUMENT_PROFILES } from './salesDocumentTheme';

// Task 17 (spec §10): modul murni — tanpa DOM, tanpa jsPDF. Dipakai panel preview
// sebelum cetak untuk memblokir dokumen yang tidak layak terbit.
const PROCUREMENT_REF_FIELDS = [
  'platform_order_number',
  'purchase_order_number',
  'package_number',
  'contract_number',
  'procurement_method',
  'government_agency',
];

const MAX_PROCUREMENT_REF_LENGTH = 40;
const TOTALS_TOLERANCE = 1;

const asText = (value) => (value === undefined || value === null ? '' : String(value).trim());

const hasText = (value) => asText(value) !== '';

export function validateSalesDocument({ order = {}, format = 'A5', type: _type = 'nota' } = {}) {
  const blockers = [];
  const warnings = [];
  const safeOrder = order || {};

  if (!hasText(safeOrder.order_number)) {
    blockers.push({
      code: 'missing_order_number',
      message: 'Nomor nota belum tersedia — nota harus disimpan sebelum dokumen dicetak.',
    });
  }

  if (format === 'A4') {
    const hasCustomerName = hasText(safeOrder.customer_name);
    const hasAddress =
      hasText(safeOrder.billing_address) ||
      hasText(safeOrder.shipping_address) ||
      hasText(safeOrder.customer_address);
    if (!hasCustomerName || !hasAddress) {
      blockers.push({
        code: 'incomplete_a4_identity',
        message: 'Data pembeli belum lengkap untuk A4: nama customer dan alamat wajib diisi.',
      });
    }
  }

  const totals = computeTotals(safeOrder);
  if (!totals.ppnExcluded) {
    const grandTotalRaw = Number(safeOrder.total);
    const taxSplitConsistent =
      Math.abs(totals.dpp + totals.vatAmount - totals.productGross) <= TOTALS_TOLERANCE;
    const grandTotalConsistent =
      Math.abs(totals.productGross + totals.shippingCharge + totals.paymentFee - totals.grandTotal) <=
      TOTALS_TOLERANCE;
    const grandTotalValid = Number.isFinite(grandTotalRaw) && grandTotalRaw > 0;
    if (!taxSplitConsistent || !grandTotalConsistent || !grandTotalValid) {
      blockers.push({
        code: 'inconsistent_totals',
        message:
          'Nominal dokumen tidak konsisten (DPP/PPN/ongkir/biaya vs total). Periksa nilai transaksi.',
      });
    }
  }

  const isTempo =
    hasText(safeOrder.payment_terms) || /tempo|kredit/i.test(asText(safeOrder.payment_method));
  if (isTempo && !hasText(safeOrder.due_date)) {
    warnings.push({
      code: 'missing_due_date',
      message: 'Transaksi tempo belum memiliki tanggal jatuh tempo.',
    });
  }

  const hasLongProcurementRef = PROCUREMENT_REF_FIELDS.some(
    (field) => asText(safeOrder[field]).length > MAX_PROCUREMENT_REF_LENGTH,
  );
  if (hasLongProcurementRef) {
    warnings.push({
      code: 'long_procurement_ref',
      message: 'Referensi pengadaan lebih dari 40 karakter dan bisa terpotong di dokumen.',
    });
  }

  const items = Array.isArray(safeOrder.items) ? safeOrder.items : [];
  const recommendedItems = DOCUMENT_PROFILES[format]?.recommendedItems;
  if (Number.isFinite(recommendedItems) && items.length > recommendedItems) {
    warnings.push({
      code: 'item_count_not_ideal',
      message: `Jumlah item (${items.length}) melebihi ${recommendedItems} untuk ${format}; pertimbangkan ukuran yang lebih besar.`,
    });
  }

  return { blockers, warnings };
}
