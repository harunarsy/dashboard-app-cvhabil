import { angkaKeTerbilang } from '../angkaKeTerbilang';
import { parseDateOnly } from '../dateOnly';

export const LEGACY_PPN_RATE = 0.11;

const hasQtyInUnit = (item) => item.qty_in_unit !== undefined && item.qty_in_unit !== null;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const emptyToNull = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
};

const hasAnyValue = (source, fields) => {
  if (!source) return false;
  return fields.some((field) => emptyToNull(source[field]) !== null);
};

const PROCUREMENT_FIELDS = [
  'source',
  'platformOrderNumber',
  'purchaseOrderNumber',
  'packageNumber',
  'contractNumber',
  'procurementMethod',
  'governmentAgency',
];

const LEGAL_BUYER_FIELDS = [
  'legalName',
  'entityType',
  'npwpOrNik',
  'picName',
  'picPosition',
  'workUnit',
];

export function hasProcurementData(procurement) {
  return hasAnyValue(procurement, PROCUREMENT_FIELDS);
}

export function hasLegalBuyerData(buyer) {
  return hasAnyValue(buyer, LEGAL_BUYER_FIELDS);
}

export function formatRupiah(value, decimals = 0) {
  const amount = Number(value);
  const safe = Number.isFinite(amount) ? amount : 0;
  const formatted = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safe);
  return formatted.replace(/\u00A0/g, ' ').replace(/^(Rp)\s*/, '$1 ');
}

export function formatDateID(value) {
  const parsed = parseDateOnly(value);
  if (!parsed) return null;
  return parsed.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatQtyDisplay(item = {}) {
  const qty = hasQtyInUnit(item) ? toNumber(item.qty_in_unit) : toNumber(item.qty);
  const unit = item.unit || 'pcs';
  return `${qty} ${unit}`;
}

export function groupSaleItems(items) {
  const bySnapshot = new Map();
  const grouped = [];
  (items || []).forEach((item) => {
    const hasBatchSnapshot = Boolean(
      item.batch_id_snapshot || item.batch_no_snapshot || item.expired_date_snapshot
    );
    if (!hasBatchSnapshot) {
      grouped.push({ ...item });
      return;
    }

    const key = [
      item.product_id ?? '',
      item.product_name ?? '',
      item.unit ?? '',
      item.unit_base ?? '',
      item.pack_size_at_sale ?? '',
      item.unit_price ?? '',
      item.batch_id_snapshot ?? '',
      item.batch_no_snapshot ?? '',
      item.expired_date_snapshot ?? '',
      hasQtyInUnit(item) ? 'unit-qty' : 'base-qty',
    ].join('\u001F');
    const existingIndex = bySnapshot.get(key);
    if (existingIndex === undefined) {
      bySnapshot.set(key, grouped.length);
      grouped.push({ ...item });
      return;
    }

    const existing = grouped[existingIndex];
    existing.qty = toNumber(existing.qty) + toNumber(item.qty);
    if (hasQtyInUnit(existing)) {
      existing.qty_in_unit = toNumber(existing.qty_in_unit) + toNumber(item.qty_in_unit);
    }
  });
  return grouped;
}

export function computeTotals(order = {}) {
  const grandTotal = toNumber(order.total);
  const shippingCharge = toNumber(order.ongkir);
  const paymentFee = order.payment_fee_mode === 'pass_on' ? toNumber(order.payment_fee) : 0;
  const productGross = grandTotal - shippingCharge - paymentFee;
  const ppnExcluded = order.ppn_excluded === true || order.ppn_excluded === 'true';
  const vatRate = toNumber(order.ppn_rate) || LEGACY_PPN_RATE;
  const dpp = ppnExcluded ? 0 : productGross / (1 + vatRate);
  const vatAmount = ppnExcluded ? 0 : productGross - dpp;

  return {
    productGross,
    discountTotal: 0,
    dpp,
    vatRate,
    vatAmount,
    shippingCharge,
    paymentFee,
    grandTotal,
    amountInWords: (angkaKeTerbilang(Math.round(grandTotal)) + ' Rupiah').replace(/\s+/g, ' ').trim(),
    ppnExcluded,
  };
}

export function parseBankInfo(raw) {
  const text = String(raw ?? '').trim();
  if (!text) {
    return { bankName: null, accountNumber: null, accountName: null, raw: null };
  }

  const tokens = text.split(/\s+/);
  let numberIndex = -1;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (/\d{6,}/.test(tokens[index])) {
      numberIndex = index;
      break;
    }
  }

  if (numberIndex === -1) {
    return { bankName: null, accountNumber: null, accountName: null, raw: text };
  }

  const bankName = numberIndex > 0 ? tokens[0] : null;
  const accountName = tokens.slice(1, numberIndex).join(' ').trim() || null;
  const accountNumber = tokens[numberIndex].match(/\d{6,}/)[0];
  return { bankName, accountNumber, accountName, raw: text };
}

const mapSaleItem = (item) => {
  const qty = hasQtyInUnit(item) ? toNumber(item.qty_in_unit) : toNumber(item.qty);
  const unitPrice = toNumber(item.unit_price);
  return {
    name: emptyToNull(item.product_name),
    code: null,
    qty,
    unit: emptyToNull(item.unit),
    unitPrice,
    discount: 0,
    lineTotal: qty * unitPrice,
    batchNumber: emptyToNull(item.batch_no_snapshot),
    expiredDate: emptyToNull(item.expired_date_snapshot),
  };
};

export function buildSalesDocumentViewModel(order = {}, settings = {}) {
  const bank = parseBankInfo(settings.bank_info);
  const method = emptyToNull(order.payment_method) || 'Tunai';
  const logo = emptyToNull(settings.logo_data_url) || emptyToNull(settings.logo);
  const terms = order.payment_terms === undefined || order.payment_terms === null || order.payment_terms === ''
    ? null
    : order.payment_terms;

  return {
    identity: {
      companyName: emptyToNull(settings.company_name) || emptyToNull(settings.shop_name),
      npwp: emptyToNull(settings.npwp),
      address: emptyToNull(settings.address),
      phone: emptyToNull(settings.phone),
      email: emptyToNull(settings.email),
      logo,
    },
    document: {
      orderNumber: emptyToNull(order.order_number),
      saleDate: emptyToNull(order.sale_date),
      dueDate: emptyToNull(order.due_date),
      paymentStatus: emptyToNull(order.payment_status),
      documentKind: null,
    },
    buyer: {
      displayName: emptyToNull(order.customer_name),
      legalName: emptyToNull(order.buyer_legal_name),
      entityType: emptyToNull(order.buyer_entity_type),
      npwpOrNik: emptyToNull(order.buyer_npwp) || emptyToNull(order.buyer_nik),
      phone: emptyToNull(order.customer_phone),
      email: emptyToNull(order.buyer_email),
      billingAddress: emptyToNull(order.billing_address) || emptyToNull(order.customer_address),
      shippingAddress: emptyToNull(order.shipping_address) || emptyToNull(order.customer_address),
      picName: emptyToNull(order.buyer_pic_name),
      picPosition: emptyToNull(order.buyer_pic_position),
      workUnit: emptyToNull(order.buyer_work_unit),
    },
    procurement: {
      source: emptyToNull(order.procurement_source),
      platformOrderNumber: emptyToNull(order.platform_order_number),
      purchaseOrderNumber: emptyToNull(order.purchase_order_number),
      packageNumber: emptyToNull(order.package_number),
      contractNumber: emptyToNull(order.contract_number),
      procurementMethod: emptyToNull(order.procurement_method),
      governmentAgency: emptyToNull(order.government_agency),
    },
    items: groupSaleItems(order.items).map(mapSaleItem),
    totals: computeTotals(order),
    payment: {
      method,
      bankName: bank.bankName,
      accountNumber: bank.accountNumber,
      accountName: bank.accountName,
      terms,
    },
    taxReference: {
      status: emptyToNull(order.tax_invoice_status),
      number: emptyToNull(order.tax_invoice_number),
      date: emptyToNull(order.tax_invoice_date),
    },
    signatures: {
      recipientName: emptyToNull(order.recipient_name),
      examinerName: emptyToNull(order.examiner_name),
      issuerName: emptyToNull(settings.signer_name),
    },
  };
}
