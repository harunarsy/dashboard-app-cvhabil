import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Select from 'react-select';
import { 
  Plus,
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  X,
  Search,
  Trash2,
  History,
  ChevronDown,
  User,
  RotateCcw
} from 'lucide-react';
import { tasksAPI } from '../services/api';
import Skeleton from './common/Skeleton';

const API_BASE = process.env.REACT_APP_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:5001/api' : '/api');

const COLUMNS = [
  { id: 'backlog', label: 'Backlog', icon: Circle, color: '#94a3b8' },
  { id: 'todo', label: 'To Do', icon: Clock, color: '#3b82f6' },
  { id: 'doing', label: 'In Progress', icon: Clock, color: '#f59e0b' },
  { id: 'done', label: 'Done', icon: CheckCircle2, color: '#10b981' }
];

const PRIORITY_COLORS = {
  high: { bg: '#fee2e2', text: '#ef4444' },
  medium: { bg: '#fef3c7', text: '#d97706' },
  low: { bg: '#f1f5f9', text: '#64748b' }
};

const TasksKanban = () => {
  const [tasks, setTasks] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    due_date: '',
    pic: ''
  });
  const [editingTask, setEditingTask] = useState(null);
  const [taskHistory, setTaskHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [trashTasks, setTrashTasks] = useState([]);
  const [trashLoading, setTrashLoading] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await tasksAPI.getAll();
      setTasks(res.data);
    } catch (err) {
      console.error('Error fetching tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrash = async () => {
    setTrashLoading(true);
    try {
      const res = await tasksAPI.getTrash();
      setTrashTasks(res.data);
    } catch (err) {
      console.error('Error fetching trash:', err);
    } finally {
      setTrashLoading(false);
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    try {
      // Fix empty string due_date causing DB error
      const taskData = {
        ...newTask,
        due_date: newTask.due_date === '' ? null : newTask.due_date
      };
      await tasksAPI.create(taskData);
      setShowAddModal(false);
      setNewTask({ title: '', description: '', status: 'todo', priority: 'medium', due_date: '', pic: '' });
      fetchTasks();
    } catch (err) {
      alert('Gagal menyimpan tugas. Silakan cek koneksi atau database.');
      console.error('Error adding task:', err);
    }
  };

  const updateTaskStatus = async (taskId, newStatus) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      if (task.status === newStatus) return;
      await tasksAPI.update(taskId, { ...task, status: newStatus });
      fetchTasks();
    } catch (err) {
      console.error('Error updating task status:', err);
    }
  };

  const onDragStart = (e, taskId) => {
    e.dataTransfer.setData('taskId', taskId);
  };

  const onDragOver = (e) => {
    e.preventDefault();
  };

  const onDrop = (e, columnId) => {
    const taskId = parseInt(e.dataTransfer.getData('taskId'));
    if (columnId === 'trash') {
      handleDeleteTask(taskId);
    } else {
      updateTaskStatus(taskId, columnId);
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await tasksAPI.softDelete(taskId);
      fetchTasks();
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  };

  const handleRestoreTask = async (taskId) => {
    try {
      await tasksAPI.restore(taskId);
      fetchTrash();
      fetchTasks();
    } catch (err) {
      console.error('Error restoring task:', err);
    }
  };

  const handlePermanentDelete = async (taskId) => {
    if (!window.confirm('Yakin ingin menghapus tugas ini secara permanen? Data tidak dapat dikembalikan.')) return;
    try {
      await tasksAPI.permanentDelete(taskId);
      fetchTrash();
    } catch (err) {
      console.error('Error permanent delete:', err);
    }
  };

  const handleUpdateTask = async (e) => {
    e.preventDefault();
    try {
      const taskData = {
        ...editingTask,
        due_date: editingTask.due_date === '' ? null : editingTask.due_date
      };
      await tasksAPI.update(editingTask.id, taskData);
      setEditingTask(null);
      fetchTasks();
    } catch (err) {
      alert('Gagal memperbarui tugas.');
      console.error('Error updating task:', err);
    }
  };

  const fetchHistory = async (taskId) => {
    try {
      // Need dedicated method in ledger or tasks? History is in tasks.js
      await tasksAPI.getAll(); // Actually, need to fetch history specifically
      // Let's keep direct call if not in tasksAPI or update tasksAPI
      // Actually, history is already in task_history table
      const historyRes = await axios.get(`${API_BASE}/tasks/${taskId}/history`);
      setTaskHistory(historyRes.data);
      setShowHistory(true);
    } catch (err) {
      console.error('Error fetching history:', err);
    }
  };

  const filteredTasks = tasks.filter(task => 
    task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    task.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTasksByStatus = (status) => filteredTasks.filter(task => task.status === status);

  return (
    <div className="flex flex-col h-full bg-[#fbfbfd] p-0 overflow-hidden">
      {/* Header - Simplified for Dashboard Integration */}
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#1d1d1f]">Manajemen Tugas</h2>
          <p className="text-[#86868b] text-sm font-medium">Pantau progres operasional secara real-time</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-[#0071e3] hover:bg-[#0077ed] text-white px-4 py-2 rounded-full text-xs font-semibold transition-all shadow-md hover:shadow-lg"
        >
          <Plus size={14} />
          <span>Tugas Baru</span>
        </button>
      </div>

      {/* Toolbar - Simplified */}
      <div className="flex gap-4 mb-4 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" size={14} />
          <input 
            type="text" 
            placeholder="Cari..." 
            className="w-full bg-white/80 border border-black/5 rounded-xl py-2 pl-9 pr-4 text-xs focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 transition-all font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <button 
          onClick={() => {
            fetchTrash();
            setShowTrashModal(true);
          }}
          className="flex items-center gap-2 bg-white border border-black/5 hover:bg-black/5 text-[#d93025] px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm"
          title="Tempat Sampah"
        >
          <Trash2 size={14} />
          <span>Sampah</span>
        </button>
      </div>

      {/* Trash Modal */}
      {showTrashModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowTrashModal(false)} />
          <div className="relative bg-white w-full max-w-3xl max-h-[80vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-black/5 flex justify-between items-center bg-[#fbfbfd]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#fee2e2] rounded-2xl flex items-center justify-center text-[#ef4444]">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[#1d1d1f]">Tempat Sampah</h3>
                  <p className="text-xs text-[#86868b]">Task yang dihapus dapat dikembalikan atau dihapus permanen</p>
                </div>
              </div>
              <button 
                onClick={() => setShowTrashModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {trashLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse bg-black/5 h-20 rounded-2xl" />
                  ))}
                </div>
              ) : trashTasks.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center text-[#86868b] mb-4">
                    <Trash2 size={32} />
                  </div>
                  <h4 className="font-bold text-[#1d1d1f]">Sampah Kosong</h4>
                  <p className="text-xs text-[#86868b] max-w-[200px] mt-1">Tidak ada task yang dihapus baru-baru ini.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {trashTasks.map(task => (
                    <div key={task.id} className="bg-[#fbfbfd] border border-black/5 p-4 rounded-2xl flex items-center justify-between group hover:border-[#0071e3]/30 transition-all">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold uppercase text-[#86868b]">{task.priority}</span>
                          <span className="w-1 h-1 rounded-full bg-black/10" />
                          <span className="text-[10px] font-bold text-[#86868b]">{task.status}</span>
                        </div>
                        <h4 className="font-bold text-[#1d1d1f] text-sm truncate">{task.title}</h4>
                        {task.description && (
                          <p className="text-xs text-[#86868b] line-clamp-1 mt-0.5">{task.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button 
                          onClick={() => handleRestoreTask(task.id)}
                          className="flex items-center gap-1.5 bg-white border border-black/5 hover:bg-[#0071e3]/5 hover:text-[#0071e3] text-[#1d1d1f] px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all"
                        >
                          <RotateCcw size={14} />
                          <span>Pulihkan</span>
                        </button>
                        <button 
                          onClick={() => handlePermanentDelete(task.id)}
                          className="flex items-center justify-center w-8 h-8 rounded-xl bg-white border border-black/5 hover:bg-[#fee2e2] hover:text-[#ef4444] text-[#86868b] transition-all"
                          title="Hapus Permanen"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-black/5 bg-[#fbfbfd] flex justify-end">
              <button 
                onClick={() => setShowTrashModal(false)}
                className="bg-[#1d1d1f] text-white px-6 py-2 rounded-full text-xs font-bold hover:opacity-90 transition-opacity"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Board Content */}
      <div className="flex-1 flex gap-4 overflow-x-auto pb-2 custom-scrollbar p-1">
        {COLUMNS.map(column => (
          <div 
            key={column.id} 
            className="flex-shrink-0 w-64 flex flex-col h-full"
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, column.id)}
          >
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <div 
                  className="w-1.5 h-1.5 rounded-full" 
                  style={{ backgroundColor: column.color }}
                />
                <h3 className="font-bold text-[#1d1d1f] text-sm tracking-tight">{column.label}</h3>
                <span className="bg-black/5 px-2 py-0.5 rounded-full text-[10px] font-bold text-[#86868b]">
                  {getTasksByStatus(column.id).length}
                </span>
              </div>
            </div>

            <div className="bg-black/[0.02] rounded-2xl p-2 flex flex-col gap-2 overflow-y-auto custom-scrollbar border border-black/[0.02] h-[320px]">
              {loading ? (
                [1, 2, 3].map(i => (
                  <div key={i} className="bg-white/90 p-3 rounded-xl border border-black/[0.05]">
                    <Skeleton width="40px" height="12px" style={{ marginBottom: '8px' }} />
                    <Skeleton width="100%" height="16px" style={{ marginBottom: '8px' }} />
                    <Skeleton width="80%" height="10px" />
                  </div>
                ))
              ) : (
                <>
                  {getTasksByStatus(column.id).map(task => (
                    <div 
                      key={task.id} 
                      draggable
                      onDragStart={(e) => onDragStart(e, task.id)}
                      onClick={() => setEditingTask(task)}
                      className="bg-white/90 backdrop-blur-sm border border-black/[0.05] p-3 rounded-xl shadow-sm hover:shadow-md transition-all group cursor-pointer active:scale-95"
                    >
                      <div className="flex justify-between items-start mb-1.5">
                        <span 
                          className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                          style={{ 
                            backgroundColor: PRIORITY_COLORS[task.priority]?.bg, 
                            color: PRIORITY_COLORS[task.priority]?.text 
                          }}
                        >
                          {task.priority}
                        </span>
                      </div>
                      <h4 className="font-bold text-[#1d1d1f] text-xs leading-snug mb-1.5 group-hover:text-[#0071e3] transition-colors">
                        {task.title}
                      </h4>
                      {task.description && (
                        <p className="text-[10px] text-[#86868b] line-clamp-2 mb-2 leading-relaxed">
                          {task.description}
                        </p>
                      )}
                      {task.due_date && (
                        <div className="flex items-center gap-1 text-[9px] font-bold text-[#86868b]">
                          <Calendar size={10} />
                          <span>{new Date(task.due_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
                        </div>
                      )}
                      {task.pic && (
                        <div className="flex items-center gap-1 text-[9px] font-bold text-blue-500 mt-1">
                          <User size={10} />
                          <span>PIC: {task.pic}</span>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {getTasksByStatus(column.id).length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-black/5 rounded-2xl py-8">
                      <p className="text-[10px] font-bold text-[#86868b] opacity-40 uppercase tracking-tighter">Empty</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Trash Zone */}
      <div 
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, 'trash')}
        className="mt-6 p-4 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 hover:border-red-400 hover:bg-red-50/50 transition-all text-gray-400 hover:text-red-500 group"
      >
        <Trash2 size={24} className="group-hover:scale-110 transition-transform" />
        <span className="text-[10px] font-bold uppercase tracking-wider">Drag here to delete</span>
      </div>

      {/* Add Modal (Apple Style) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
          <div className="bg-white/95 backdrop-blur-xl w-full max-w-lg rounded-[2.5rem] shadow-2xl p-8 transform transition-all border border-white/20">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-extrabold text-[#1d1d1f] tracking-tight">Buat Tugas Baru</h2>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-black/5 rounded-full text-[#86868b] transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleAddTask} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-[#86868b] tracking-wider ml-1">JUDUL TUGAS</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g., Audit Stok Gudang A"
                  className="w-full bg-black/5 border-none rounded-2xl py-3 px-4 text-[#1d1d1f] focus:ring-2 focus:ring-[#0071e3] transition-all font-medium"
                  value={newTask.title}
                  onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-[#86868b] tracking-wider ml-1">DESKRIPSI (OPSIONAL)</label>
                <textarea 
                  rows="3"
                  placeholder="Detail tugas..."
                  className="w-full bg-black/5 border-none rounded-2xl py-3 px-4 text-[#1d1d1f] focus:ring-2 focus:ring-[#0071e3] transition-all font-medium resize-none"
                  value={newTask.description}
                  onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#86868b] tracking-wider ml-1">PRIORITAS</label>
                  <select 
                    className="w-full bg-black/5 border-none rounded-2xl py-3 px-4 text-[#1d1d1f] focus:ring-2 focus:ring-[#0071e3] transition-all font-medium appearance-none"
                    value={newTask.priority}
                    onChange={(e) => setNewTask({...newTask, priority: e.target.value})}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#86868b] tracking-wider ml-1">DEADLINE</label>
                  <input 
                    type="date"
                    className="w-full bg-black/5 border-none rounded-2xl py-3 px-4 text-[#1d1d1f] focus:ring-2 focus:ring-[#0071e3] transition-all font-medium"
                    value={newTask.due_date}
                    onChange={(e) => setNewTask({...newTask, due_date: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-[#86868b] tracking-wider ml-1">PENANGGUNG JAWAB (PIC)</label>
                <Select
                  options={[
                    { value: 'Harun', label: 'Harun' },
                    { value: 'Fivin', label: 'Fivin' },
                    { value: 'Admin', label: 'Admin' }
                  ]}
                  placeholder="Pilih PIC..."
                  className="react-select-container"
                  classNamePrefix="react-select"
                  onChange={(opt) => setNewTask({...newTask, pic: opt ? opt.value : ''})}
                  styles={{
                    control: (base) => ({
                      ...base,
                      backgroundColor: 'rgba(0,0,0,0.05)',
                      border: 'none',
                      borderRadius: '16px',
                      padding: '4px',
                      boxShadow: 'none'
                    }),
                    menu: (base) => ({ ...base, borderRadius: '16px', overflow: 'hidden' })
                  }}
                />
              </div>

              <div className="pt-4">
                <button 
                  type="submit"
                  className="w-full bg-[#0071e3] hover:bg-[#0077ed] text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.98]"
                >
                  Simpan Tugas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-6">
          <div className="bg-white/95 backdrop-blur-xl w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden transform transition-all border border-white/20">
            <div className="flex justify-between items-center p-8 pb-4">
              <h2 className="text-2xl font-extrabold text-[#1d1d1f] tracking-tight">Detail Tugas</h2>
              <div className="flex gap-2">
                <button 
                  onClick={() => fetchHistory(editingTask.id)}
                  className="p-2 hover:bg-black/5 rounded-full text-[#86868b] transition-colors"
                  title="Lihat Riwayat"
                >
                  <History size={20} />
                </button>
                <button 
                  onClick={() => setEditingTask(null)}
                  className="p-2 hover:bg-black/5 rounded-full text-[#86868b] transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="px-8 pb-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {showHistory ? (
                <div className="space-y-4">
                  <button 
                    onClick={() => setShowHistory(false)}
                    className="text-xs font-bold text-[#0071e3] flex items-center gap-1 mb-2"
                  >
                    <ChevronDown size={14} className="rotate-90" /> Kembali
                  </button>
                  <div className="space-y-3">
                    {taskHistory.length > 0 ? taskHistory.map((log, li) => (
                      <div key={li} className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                        <div className="flex justify-between text-[10px] font-bold text-gray-400 mb-1">
                          <span className="uppercase">{log.action.replace('_', ' ')}</span>
                          <span>{new Date(log.changed_at).toLocaleString('id-ID')}</span>
                        </div>
                        <p className="text-xs text-gray-600">
                          {log.action === 'status_change' ? (
                            <>Status berubah: <span className="font-bold">{log.old_value.status}</span> → <span className="font-bold text-blue-500">{log.new_value.status}</span></>
                          ) : log.action === 'created' ? 'Tugas dibuat' : 'Detail diperbarui'}
                        </p>
                      </div>
                    )) : (
                      <p className="text-center py-4 text-xs text-gray-400 font-medium">Belum ada riwayat</p>
                    )}
                  </div>
                </div>
              ) : (
                <form onSubmit={handleUpdateTask} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[#86868b] tracking-wider ml-1">JUDUL TUGAS</label>
                    <input 
                      type="text" 
                      required
                      className="w-full bg-black/5 border-none rounded-2xl py-3 px-4 text-[#1d1d1f] focus:ring-2 focus:ring-[#0071e3] transition-all font-medium"
                      value={editingTask.title}
                      onChange={(e) => setEditingTask({...editingTask, title: e.target.value})}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[#86868b] tracking-wider ml-1">DESKRIPSI</label>
                    <textarea 
                      rows="3"
                      className="w-full bg-black/5 border-none rounded-2xl py-3 px-4 text-[#1d1d1f] focus:ring-2 focus:ring-[#0071e3] transition-all font-medium resize-none"
                      value={editingTask.description || ''}
                      onChange={(e) => setEditingTask({...editingTask, description: e.target.value})}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-[#86868b] tracking-wider ml-1">PRIORITAS</label>
                      <select 
                        className="w-full bg-black/5 border-none rounded-2xl py-3 px-4 text-[#1d1d1f] focus:ring-2 focus:ring-[#0071e3] transition-all font-medium appearance-none"
                        value={editingTask.priority}
                        onChange={(e) => setEditingTask({...editingTask, priority: e.target.value})}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-[#86868b] tracking-wider ml-1">DEADLINE</label>
                      <input 
                        type="date"
                        className="w-full bg-black/5 border-none rounded-2xl py-3 px-4 text-[#1d1d1f] focus:ring-2 focus:ring-[#0071e3] transition-all font-medium"
                        value={editingTask.due_date ? editingTask.due_date.split('T')[0] : ''}
                        onChange={(e) => setEditingTask({...editingTask, due_date: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-[#86868b] tracking-wider ml-1">PENANGGUNG JAWAB (PIC)</label>
                    <Select
                      options={[
                        { value: 'Harun', label: 'Harun' },
                        { value: 'Fivin', label: 'Fivin' },
                        { value: 'Admin', label: 'Admin' }
                      ]}
                      defaultValue={editingTask.pic ? { value: editingTask.pic, label: editingTask.pic } : null}
                      placeholder="Pilih PIC..."
                      className="react-select-container"
                      classNamePrefix="react-select"
                      onChange={(opt) => setEditingTask({...editingTask, pic: opt ? opt.value : ''})}
                      styles={{
                        control: (base) => ({
                          ...base,
                          backgroundColor: 'rgba(0,0,0,0.05)',
                          border: 'none',
                          borderRadius: '16px',
                          padding: '4px',
                          boxShadow: 'none'
                        }),
                        menu: (base) => ({ ...base, borderRadius: '16px', overflow: 'hidden' })
                      }}
                    />
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button"
                      onClick={() => handleDeleteTask(editingTask.id).then(() => setEditingTask(null))}
                      className="flex-1 bg-gray-100 hover:bg-red-50 text-red-500 py-4 rounded-2xl font-bold text-sm transition-all"
                    >
                      Hapus
                    </button>
                    <button 
                      type="submit"
                      className="flex-[2] bg-[#0071e3] hover:bg-[#0077ed] text-white py-4 rounded-2xl font-bold text-sm shadow-lg hover:shadow-xl transition-all active:scale-[0.98]"
                    >
                      Simpan Perubahan
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0,0,0,0.1);
        }
      `}} />
    </div>
  );
};

export default TasksKanban;
