// Draft form WIP (faktur/nota) — satu baris per (doc_type, owner).
// Menggantikan pola lama: baris palsu is_draft=TRUE di tabel invoices yang butuh
// transaksi FOR UPDATE tiap autosave dan harus difilter di semua query list.
// Di sini draft BUKAN dokumen — tidak punya nomor, tidak menyentuh stok.

const ensureTable = async (db) => {
  await db.query(`CREATE TABLE IF NOT EXISTS form_drafts (
    id SERIAL PRIMARY KEY,
    doc_type VARCHAR(20) NOT NULL,
    owner_id VARCHAR(40) NOT NULL DEFAULT '',
    draft_data JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(doc_type, owner_id)
  )`);
};

const getDraft = async (db, docType, ownerId) => {
  const { rows } = await db.query(
    `SELECT draft_data, updated_at FROM form_drafts
     WHERE doc_type = $1 AND owner_id IN ($2, '')
     ORDER BY (owner_id = $2) DESC, updated_at DESC
     LIMIT 1`,
    [docType, ownerId]
  );
  return rows[0] || null;
};

const saveDraft = async (db, docType, ownerId, draftData) => {
  const payload = draftData && typeof draftData === 'object' && !Array.isArray(draftData)
    ? draftData
    : {};
  await db.query(
    `INSERT INTO form_drafts (doc_type, owner_id, draft_data, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (doc_type, owner_id)
     DO UPDATE SET draft_data = EXCLUDED.draft_data, updated_at = NOW()`,
    [docType, ownerId, JSON.stringify(payload)]
  );
};

const clearDraft = async (db, docType, ownerId) => {
  await db.query(
    `DELETE FROM form_drafts WHERE doc_type = $1 AND owner_id IN ($2, '')`,
    [docType, ownerId]
  );
};

module.exports = { ensureTable, getDraft, saveDraft, clearDraft };
