const ASSISTANT_IDENTITY = Object.freeze({
  name: 'Habil Smart-Assistant',
  mode: 'rule_based',
  disclosure: 'Rule-based smart suggestions',
});

const SCOPES = new Set(['overview', 'inventory', 'customers', 'sales']);
const PRIORITY = { critical: 0, high: 1, medium: 2, info: 3 };

const truncate = (value, max = 160) => {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const formatRupiah = (value) =>
  `Rp ${Math.round(Number(value) || 0).toLocaleString('id-ID')}`;

function resolveScope(message, requestedScope) {
  if (SCOPES.has(requestedScope)) return requestedScope;

  const text = String(message || '').toLowerCase();
  if (/stok|stock|restock|inventory|produk|barang/.test(text)) return 'inventory';
  if (/customer|pelanggan|follow.?up|dormant|lama.*order/.test(text)) {
    return 'customers';
  }
  if (/sales|penjualan|omzet|order|minggu/.test(text)) return 'sales';
  return 'overview';
}

const restockRecommendation = (item) => ({
  id: `restock-${item.product_id}`,
  type: 'restock',
  severity:
    item.days_left <= 3
      ? 'critical'
      : item.days_left <= 7
        ? 'high'
        : 'medium',
  title: truncate(`Restock ${item.name}`, 100),
  summary: truncate(
    `Stok diperkirakan bertahan sekitar ${item.days_left} hari pada pola penjualan saat ini.`,
  ),
  reason: 'Velocity penjualan 30 hari diberi bobot 70% dan periode hari 31–90 diberi bobot 30%.',
  evidence: [
    { label: 'Stok', value: `${item.stock} ${item.base_unit || 'pcs'}` },
    { label: 'Kecepatan jual', value: `${item.velocity_per_day}/hari` },
    { label: 'Estimasi sisa', value: `${item.days_left} hari` },
  ],
  action: { label: 'Buka inventory', path: '/inventory' },
});

const dormantRecommendation = (item) => ({
  id: `customer-${item.customer_id}`,
  type: 'customer_follow_up',
  severity: item.days_silent >= 90 ? 'high' : 'medium',
  title: truncate(`Follow-up ${item.name}`, 100),
  summary: truncate(
    `Tidak ada order selama ${item.days_silent} hari; riwayatnya mencatat ${item.order_count} order.`,
  ),
  reason: 'Customer pernah bertransaksi tetapi melewati batas dormant 30 hari.',
  evidence: [
    { label: 'Diam', value: `${item.days_silent} hari` },
    { label: 'Riwayat order', value: `${item.order_count}x` },
    { label: 'Rata-rata nilai', value: formatRupiah(item.avg_total) },
  ],
  action: { label: 'Buka customer', path: '/customers' },
});

const weeklyRecommendation = (weekly) => {
  if (!weekly) return null;
  const previous = Number(weekly.revenue_previous) || 0;
  const current = Number(weekly.revenue_this) || 0;
  const deltaPct =
    previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;
  const isDown = deltaPct !== null && deltaPct < 0;

  return {
    id: 'weekly-sales-trend',
    type: 'weekly_sales',
    severity: isDown ? (deltaPct <= -20 ? 'high' : 'medium') : 'info',
    title: isDown ? 'Omzet mingguan perlu perhatian' : 'Pantau ritme penjualan minggu ini',
    summary:
      deltaPct === null
        ? 'Belum ada omzet minggu sebelumnya untuk pembanding yang setara.'
        : `Omzet ${deltaPct >= 0 ? 'naik' : 'turun'} ${Math.abs(deltaPct)}% dibanding tujuh hari sebelumnya.`,
    reason: 'Perbandingan memakai tujuh hari terakhir versus tujuh hari sebelumnya.',
    evidence: [
      { label: 'Omzet 7 hari', value: formatRupiah(current) },
      { label: 'Periode sebelumnya', value: formatRupiah(previous) },
      { label: 'Order 7 hari', value: `${weekly.orders_this}` },
    ],
    action: { label: 'Buka penjualan', path: '/sales' },
  };
};

function buildSmartAssistantResponse(
  data,
  { message = '', requestedScope, limit = 8, now = new Date() } = {},
) {
  const scope = resolveScope(message, requestedScope);
  const outputLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 8, 1), 12);
  const recommendations = [];

  if (scope === 'overview' || scope === 'inventory') {
    recommendations.push(...(data.restock || []).map(restockRecommendation));
  }
  if (scope === 'overview' || scope === 'customers') {
    recommendations.push(...(data.dormant || []).map(dormantRecommendation));
  }
  if (scope === 'overview' || scope === 'sales') {
    const weekly = weeklyRecommendation(data.weekly);
    if (weekly) recommendations.push(weekly);
  }

  recommendations.sort(
    (a, b) => PRIORITY[a.severity] - PRIORITY[b.severity] || a.id.localeCompare(b.id),
  );
  const bounded = recommendations.slice(0, outputLimit);
  const urgentCount = bounded.filter((item) =>
    ['critical', 'high'].includes(item.severity),
  ).length;

  return {
    assistant: ASSISTANT_IDENTITY,
    request: {
      scope,
      message: truncate(message, 500),
    },
    summary:
      bounded.length === 0
        ? 'Tidak ada saran yang memenuhi aturan pada cakupan ini.'
        : `${bounded.length} saran ditemukan${urgentCount ? `, ${urgentCount} perlu prioritas` : ''}.`,
    recommendations: bounded,
    meta: {
      generated_at: now.toISOString(),
      rule_version: '2026-08-23.1',
      data_boundary: 'authenticated_read_only',
      rules_evaluated:
        scope === 'overview'
          ? ['restock_velocity', 'customer_dormancy', 'weekly_sales_delta']
          : scope === 'inventory'
            ? ['restock_velocity']
            : scope === 'customers'
              ? ['customer_dormancy']
              : ['weekly_sales_delta'],
      output_limit: outputLimit,
    },
  };
}

module.exports = {
  ASSISTANT_IDENTITY,
  buildSmartAssistantResponse,
  resolveScope,
};
