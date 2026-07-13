// Parser & filler template batch-edit marketplace (TikTok Seller Center & Shopee mass-update),
// jalan 100% di browser (SheetJS). Template TikTok ~2.7MB → diproses lokal, tidak di-upload;
// backend cuma menerima baris JSON kecil utk matching + rekomendasi harga.
//
// Header dibaca by NAMA kolom (row 0), bukan index — TikTok kadang menggeser kolom antar versi
// dan Shopee beda total. Sebagian file menulis `!ref` yang SALAH/terpotong (TikTok mendeklarasi
// A1:AL5 padahal ada puluhan produk) → range dihitung ulang dari sel nyata.

import * as XLSX from 'xlsx';

const PLATFORMS = {
  tiktok: {
    mainSheet: 'Template',
    cols: {
      name: 'product_name',
      variation: 'variation_value',
      sku: 'seller_sku',
      skuId: 'sku_id',
      price: 'price',
      stock: 'quantity',
    },
    signature: 'seller_sku',
  },
  shopee: {
    mainSheet: null, // sheet pertama ("Sheet1")
    cols: {
      name: 'et_title_product_name',
      variation: 'et_title_variation_name',
      sku: 'et_title_variation_sku',
      parentSku: 'et_title_parent_sku',
      price: 'et_title_variation_price',
      stock: 'et_title_variation_stock',
    },
    signature: 'et_title_variation_price',
  },
};

const PLATFORM_LABEL = { tiktok: 'TikTok Shop', shopee: 'Shopee' };
// channel di price_list_entries HABIL
const PLATFORM_CHANNEL = { tiktok: 'tokopedia_tiktok', shopee: 'shopee' };
// category_key untuk pricing engine (fee profile)
const PLATFORM_PRICING = { tiktok: 'tokopedia_tiktok', shopee: 'shopee' };

const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';

const toInt = (v) => {
  if (isBlank(v)) return null;
  const n = Math.round(Number(String(v).replace(/[^0-9.-]/g, '')));
  return Number.isFinite(n) ? n : null;
};

// Recompute range dari alamat sel nyata (perbaiki `!ref` yang terpotong).
const ensureFullRange = (ws) => {
  let maxR = 0;
  let maxC = 0;
  let minR = Infinity;
  for (const key of Object.keys(ws)) {
    if (key[0] === '!') continue;
    const cell = XLSX.utils.decode_cell(key);
    if (cell.r > maxR) maxR = cell.r;
    if (cell.c > maxC) maxC = cell.c;
    if (cell.r < minR) minR = cell.r;
  }
  if (!Number.isFinite(minR)) return ws;
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
  return ws;
};

const detectPlatform = (wb) => {
  for (const [key, def] of Object.entries(PLATFORMS)) {
    const sheetName = def.mainSheet && wb.SheetNames.includes(def.mainSheet)
      ? def.mainSheet
      : wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const header = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, defval: null })[0] || [];
    if (header.map((h) => String(h || '').trim()).includes(def.signature)) {
      return { platform: key, sheetName };
    }
  }
  return { platform: null, sheetName: null };
};

const resolveColIdx = (header, cols) => {
  const idx = {};
  const norm = header.map((h) => String(h || '').trim());
  for (const [role, colName] of Object.entries(cols)) idx[role] = norm.indexOf(colName);
  return idx;
};

// Deteksi pengali bundle dari nama + VARIASI listing marketplace (pre-fill qty_bundle).
// KARTON→12, N BOX→N, N POUCH→N, BUNDLE N→N, ISI N BOX/POUCH→N.
// Variasi diprioritaskan: sering pengali ada di varian (mis. HOTTO nama "1 Pouch", varian "2 POUCH").
// SACHET SENGAJA TIDAK dijadikan pengali — "160 Sachet"/"25s" itu UKURAN pack beda (bukan kelipatan
// produk yg sama); itu urusan pemetaan per-varian, bukan bundle. Konservatif: ragu → 1.
const parseBundleStr = (str = '') => {
  const s = String(str).toUpperCase();
  let m;
  if ((m = s.match(/BUNDLE[\s-]*(\d{1,2})/))) return parseInt(m[1], 10);
  if ((m = s.match(/ISI\s*(\d{1,2})\s*(?:BOX|POUCH)/))) return parseInt(m[1], 10);
  if ((m = s.match(/(\d{1,2})\s*BOX\b/))) return parseInt(m[1], 10);
  if ((m = s.match(/(\d{1,2})\s*POUCH\b/))) return parseInt(m[1], 10);
  if (/\bKARTON\b/.test(s) && !/KARTONAN/.test(s)) return 12;
  return null;
};
const detectBundleQty = (name = '', variation = '') => {
  const v = parseBundleStr(variation); // varian dulu (mis. "2 POUCH")
  if (v && v >= 1) return Math.max(1, v);
  const n = parseBundleStr(name);
  if (n && n >= 1) return Math.max(1, n);
  return 1;
};

const colLetter = (idx) => {
  let s = '';
  let n = idx;
  while (n >= 0) { s = String.fromCharCode((n % 26) + 65) + s; n = Math.floor(n / 26) - 1; }
  return s;
};

// parseWorkbook(arrayBuffer) → { platform, sheetName, filename?, rows: [...] }
export const parseWorkbook = (arrayBuffer) => {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const { platform, sheetName } = detectPlatform(wb);
  if (!platform) {
    throw new Error('Template tidak dikenali. Pakai file batch-edit TikTok Seller Center (.xlsx) atau mass-update Shopee (.xlsx).');
  }
  const def = PLATFORMS[platform];
  const ws = ensureFullRange(wb.Sheets[sheetName]);
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true });
  const header = grid[0] || [];
  const colIdx = resolveColIdx(header, def.cols);
  const nameI = colIdx.name;
  const priceI = colIdx.price;
  const rows = [];
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r) continue;
    const name = r[nameI];
    if (isBlank(name)) continue;
    const nm = String(name).trim();
    if (nm === 'Wajib' || nm === 'Opsional') continue;
    const priceInt = toInt(r[priceI]);
    if (priceInt === null || priceInt <= 0) continue; // baris meta/instruksi/harga kosong

    const skuRaw = colIdx.sku >= 0 ? r[colIdx.sku] : null;
    const parentSku = colIdx.parentSku >= 0 ? r[colIdx.parentSku] : null;
    let sku = !isBlank(skuRaw)
      ? String(skuRaw).trim()
      : (!isBlank(parentSku) ? String(parentSku).trim() : null);
    if (sku && /^isi\s+\d+\s+box$/i.test(sku)) sku = null; // indikator bundle, bukan SKU asli

    const variation = colIdx.variation >= 0 && !isBlank(r[colIdx.variation])
      ? String(r[colIdx.variation]).trim() : null;

    rows.push({
      excelRow: i + 1,
      product_name: nm,
      variation,
      sku,
      sku_id: colIdx.skuId >= 0 && !isBlank(r[colIdx.skuId]) ? String(r[colIdx.skuId]).trim() : null,
      price: priceInt,
      stock: colIdx.stock >= 0 ? toInt(r[colIdx.stock]) : null,
      bundle_qty: detectBundleQty(nm, variation),
    });
  }
  return { platform, sheetName, rowCount: rows.length, rows };
};

// parseFile(File) → Promise<{ platform, rows, ... , buffer }>  (buffer disimpan utk isi ulang)
export const parseFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const buffer = e.target.result; // ArrayBuffer
      const parsed = parseWorkbook(buffer);
      resolve({ ...parsed, buffer, filename: file.name });
    } catch (err) { reject(err); }
  };
  reader.onerror = () => reject(new Error('Gagal membaca file.'));
  reader.readAsArrayBuffer(file);
});

// fillWorkbook(arrayBuffer, updates) → Uint8Array (xlsx). updates: [{excelRow, price, stock}].
export const fillWorkbook = (arrayBuffer, updates) => {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellStyles: true });
  const { platform, sheetName } = detectPlatform(wb);
  if (!platform) throw new Error('Template tidak dikenali saat mengisi.');
  const def = PLATFORMS[platform];
  const ws = ensureFullRange(wb.Sheets[sheetName]);
  const header = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, defval: null })[0] || [];
  const colIdx = resolveColIdx(header, def.cols);
  const priceCol = colLetter(colIdx.price);
  const stockCol = colIdx.stock >= 0 ? colLetter(colIdx.stock) : null;

  const setCell = (col, rowNum, value) => {
    if (value === null || value === undefined) return;
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    ws[`${col}${rowNum}`] = { t: 'n', v, w: String(v) };
  };
  for (const u of updates || []) {
    if (!u || !u.excelRow) continue;
    if (u.price !== null && u.price !== undefined && u.price !== '') setCell(priceCol, u.excelRow, u.price);
    if (stockCol && u.stock !== null && u.stock !== undefined && u.stock !== '') setCell(stockCol, u.excelRow, u.stock);
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
};

// Kunci pencocokan baris (sama persis dgn backend rowMatchKey): SKU (uppercase) atau nama+varian.
export const matchKeyForRow = (row) => {
  if (row.sku && String(row.sku).trim()) return String(row.sku).trim().toUpperCase();
  return String(`${row.product_name || ''} ${row.variation || ''}`).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
};

// Isi template lalu download DENGAN mencocokkan baris via match_key (bukan excelRow) — dipakai
// saat toko dibuka dari DB (baris tak punya excelRow). keyMap: { [match_key]: {price, stock} }.
// Parse file utk dapat excelRow tiap baris, cocokkan by key, baru isi.
export const downloadFilledByKey = (arrayBuffer, keyMap, filename) => {
  const parsed = parseWorkbook(arrayBuffer);
  const updates = parsed.rows.map((r) => {
    const u = keyMap[matchKeyForRow(r)];
    if (!u) return null;
    return { excelRow: r.excelRow, price: u.price, stock: u.stock };
  }).filter(Boolean);
  downloadFilled(arrayBuffer, updates, filename);
  return updates.length;
};

// Trigger download di browser.
export const downloadFilled = (arrayBuffer, updates, filename) => {
  const out = fillWorkbook(arrayBuffer, updates);
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'template-terisi.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export { PLATFORMS, PLATFORM_LABEL, PLATFORM_CHANNEL, PLATFORM_PRICING, detectBundleQty };
