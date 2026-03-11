import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, Search, Check, Trash2, Pencil } from 'lucide-react';

export default function MasterSelect({
  value, onChange, options, onAdd, onRemove, onRename,
  placeholder = 'Pilih atau ketik untuk tambah...',
  isDarkMode = false, disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingName, setEditingName] = useState(null); // name yang sedang diedit
  const [editValue, setEditValue] = useState('');
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const newInputRef = useRef(null);
  const editInputRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false); setQuery(''); setAdding(false);
        setConfirmDelete(null); setEditingName(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);
  useEffect(() => { if (adding && newInputRef.current) newInputRef.current.focus(); }, [adding]);
  useEffect(() => { if (editingName && editInputRef.current) editInputRef.current.focus(); }, [editingName]);

  const filtered = options.filter(o => o.name.toLowerCase().includes(query.toLowerCase()));

  const handleSelect = (name) => { onChange(name); setOpen(false); setQuery(''); setConfirmDelete(null); };

  const handleAdd = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    try {
      await onAdd(trimmed); onChange(trimmed);
      setNewName(''); setAdding(false); setOpen(false);
    } catch (err) { alert('Gagal menambahkan: ' + (err.response?.data?.error || err.message)); }
  };

  const handleDelete = async (name, e) => {
    e.stopPropagation();
    if (confirmDelete === name) {
      try {
        await onRemove(name);
        if (value === name) onChange('');
        setConfirmDelete(null);
      } catch (err) { alert('Gagal menghapus: ' + (err.response?.data?.error || err.message)); }
    } else {
      setConfirmDelete(name);
      setEditingName(null);
    }
  };

  const handleStartEdit = (name, e) => {
    e.stopPropagation();
    setEditingName(name);
    setEditValue(name);
    setConfirmDelete(null);
  };

  const handleRename = async (oldName) => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === oldName) { setEditingName(null); return; }
    try {
      if (onRename) await onRename(oldName, trimmed);
      if (value === oldName) onChange(trimmed);
      setEditingName(null);
    } catch (err) { alert('Gagal mengubah nama: ' + (err.response?.data?.error || err.message)); }
  };

  const bg = isDarkMode ? '#1C1C1E' : '#FFFFFF';
  const bgHover = isDarkMode ? '#2C2C2E' : '#F5F5F7';
  const border = isDarkMode ? '#3A3A3C' : '#D1D1D6';
  const txt = isDarkMode ? '#FFFFFF' : '#000000';
  const muted = '#86868B';
  const accent = '#007AFF';

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: `1.5px solid ${open ? accent : border}`, borderRadius: '10px', backgroundColor: disabled ? (isDarkMode ? '#1C1C1E' : '#E5E5EA') : bg, color: value ? txt : muted, fontSize: '14px', cursor: disabled ? 'not-allowed' : 'pointer', transition: 'border-color 0.15s', boxShadow: open ? `0 0 0 3px ${accent}22` : 'none', userSelect: 'none' }}
        onClick={() => { if (!disabled) setOpen(o => !o); }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || placeholder}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
          {value && <span onClick={e => { e.stopPropagation(); onChange(''); }} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={14} color={muted} /></span>}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d={open ? 'M2 8L6 4L10 8' : 'M2 4L6 8L10 4'} stroke={muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      </div>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, backgroundColor: bg, border: `1.5px solid ${border}`, borderRadius: '12px', boxShadow: isDarkMode ? '0 8px 32px rgba(0,0,0,0.6)' : '0 8px 32px rgba(0,0,0,0.12)', zIndex: 9999, overflow: 'hidden', maxHeight: '320px', display: 'flex', flexDirection: 'column' }}>
          {/* Search */}
          <div style={{ padding: '10px', borderBottom: `1px solid ${border}`, display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <Search size={14} color={muted} />
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari..."
              style={{ flex: 1, border: 'none', outline: 'none', backgroundColor: 'transparent', color: txt, fontSize: '14px' }}
              onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setQuery(''); } }}
            />
            {query && <span onClick={() => setQuery('')} style={{ cursor: 'pointer' }}><X size={13} color={muted} /></span>}
          </div>

          {/* Options */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 && !adding && (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: muted }}>Tidak ditemukan</div>
            )}
            {filtered.map(opt => (
              <div key={opt.name} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', backgroundColor: value === opt.name ? `${accent}18` : 'transparent', gap: '6px' }}
                onMouseEnter={e => { if (value !== opt.name && editingName !== opt.name) e.currentTarget.style.backgroundColor = bgHover; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = value === opt.name ? `${accent}18` : 'transparent'; }}
              >
                <span style={{ width: '18px', flexShrink: 0 }}>{value === opt.name && <Check size={14} color={accent} />}</span>

                {editingName === opt.name ? (
                  // Edit mode inline
                  <div style={{ flex: 1, display: 'flex', gap: '6px' }} onClick={e => e.stopPropagation()}>
                    <input
                      ref={editInputRef}
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      style={{ flex: 1, padding: '4px 8px', border: `1.5px solid ${accent}`, borderRadius: '6px', backgroundColor: bg, color: txt, fontSize: '13px', outline: 'none' }}
                      onKeyDown={e => { if (e.key === 'Enter') handleRename(opt.name); if (e.key === 'Escape') setEditingName(null); }}
                    />
                    <button onClick={() => handleRename(opt.name)} style={{ padding: '4px 10px', backgroundColor: accent, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}>OK</button>
                    <button onClick={() => setEditingName(null)} style={{ padding: '4px 8px', backgroundColor: 'transparent', border: `1px solid ${border}`, borderRadius: '6px', cursor: 'pointer' }}><X size={12} color={muted} /></button>
                  </div>
                ) : (
                  <>
                    <span onClick={() => handleSelect(opt.name)} style={{ flex: 1, fontSize: '14px', color: value === opt.name ? accent : txt, fontWeight: value === opt.name ? '600' : '400', cursor: 'pointer' }}>
                      {opt.name}
                    </span>
                    {/* Edit button */}
                    {onRename && (
                      <button onClick={e => handleStartEdit(opt.name, e)} title="Ubah nama"
                        style={{ padding: '4px 6px', backgroundColor: 'transparent', border: `1px solid ${border}`, borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                        <Pencil size={11} color={muted} />
                      </button>
                    )}
                    {/* Delete button */}
                    <button onClick={e => handleDelete(opt.name, e)}
                      title={confirmDelete === opt.name ? 'Klik lagi untuk konfirmasi hapus' : 'Hapus dari daftar'}
                      style={{ padding: '4px 8px', backgroundColor: confirmDelete === opt.name ? '#FF3B30' : 'transparent', border: `1px solid ${confirmDelete === opt.name ? '#FF3B30' : border}`, borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.15s', flexShrink: 0 }}>
                      <Trash2 size={12} color={confirmDelete === opt.name ? 'white' : muted} />
                      {confirmDelete === opt.name && <span style={{ fontSize: '11px', color: 'white', fontWeight: '600' }}>Konfirmasi</span>}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Add new */}
          <div style={{ borderTop: `1px solid ${border}`, padding: '10px', flexShrink: 0, backgroundColor: isDarkMode ? '#111' : '#FAFAFA' }}>
            {!adding ? (
              <button onClick={() => { setAdding(true); setNewName(query); }}
                style={{ width: '100%', padding: '8px 12px', backgroundColor: 'transparent', border: `1.5px dashed ${border}`, borderRadius: '8px', cursor: 'pointer', color: accent, fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = `${accent}12`}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Plus size={14} />
                {query ? `Tambah "${query}"` : 'Tambah Baru...'}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input ref={newInputRef} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nama baru..."
                  style={{ flex: 1, padding: '8px 10px', border: `1.5px solid ${accent}`, borderRadius: '8px', backgroundColor: bg, color: txt, fontSize: '13px', outline: 'none' }}
                  onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
                />
                <button onClick={handleAdd} style={{ padding: '8px 14px', backgroundColor: accent, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700' }}>Simpan</button>
                <button onClick={() => { setAdding(false); setNewName(''); }} style={{ padding: '8px 10px', backgroundColor: 'transparent', border: `1px solid ${border}`, borderRadius: '8px', cursor: 'pointer' }}><X size={13} color={muted} /></button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}