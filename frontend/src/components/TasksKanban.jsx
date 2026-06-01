import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Select from "react-select";
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
  RotateCcw,
} from "lucide-react";
import { tasksAPI } from "../services/api";
import Skeleton from "./common/Skeleton";
import EmptyState, { EmptyStateIcons } from "./common/EmptyState";
import { UI_MOTION } from "../constants/ui";
import Tooltip from "./common/Tooltip";
import useBodyScrollLock from "../hooks/useBodyScrollLock";

const renderPortal = (node) =>
  typeof document === "undefined" ? node : createPortal(node, document.body);

const COLUMNS = [
  {
    id: "backlog",
    label: "Backlog",
    icon: Circle,
    color: "var(--color-text-subtle)",
  },
  {
    id: "todo",
    label: "To Do",
    icon: Clock,
    color: "var(--color-primary-hover)",
  },
  {
    id: "doing",
    label: "In Progress",
    icon: Clock,
    color: "var(--color-warning)",
  },
  {
    id: "done",
    label: "Done",
    icon: CheckCircle2,
    color: "var(--color-success)",
  },
];

// Theme-aware priority colors — light & dark variants
const PRIORITY_COLORS = {
  high: {
    lightBg: "var(--color-danger-soft)",
    lightFg: "var(--color-danger)",
    darkBg: "var(--color-danger-soft)",
    darkFg: "var(--color-danger)",
  },
  medium: {
    lightBg: "var(--color-warning-soft)",
    lightFg: "var(--color-warning)",
    darkBg: "var(--color-warning-soft)",
    darkFg: "var(--color-warning)",
  },
  low: {
    lightBg: "var(--color-bg-subtle)",
    lightFg: "var(--color-text-muted)",
    darkBg: "var(--color-surface-raised)",
    darkFg: "var(--color-text-subtle)",
  },
};

const TasksKanban = ({ isDarkMode = false, isMobile = false }) => {
  const [tasks, setTasks] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    status: "todo",
    priority: "medium",
    due_date: "",
    pic: "",
  });
  const [editingTask, setEditingTask] = useState(null);
  const [taskHistory, setTaskHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [trashTasks, setTrashTasks] = useState([]);
  const [toast, setToast] = useState("");
  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), UI_MOTION.duration.toastSuccess);
  };
  const [trashLoading, setTrashLoading] = useState(false);
  const TooltipButton = ({
    label,
    children,
    className = "",
    style = {},
    ...buttonProps
  }) => (
    <Tooltip text={label} position="top">
      <button
        {...buttonProps}
        aria-label={label}
        className={`ui-motion-button ui-focus-ring ${className}`.trim()}
        style={style}
      >
        {children}
      </button>
    </Tooltip>
  );

  // ─── Theme tokens (premium SaaS palette, mirror Dashboard) ──────────────
  const bg = "var(--color-bg)";
  // v1.8.7: translucent — Vanta tembus + backdrop-blur shield untuk text readability
  const cardBg = "var(--color-surface)";
  const surface = "var(--color-surface-elevated)";
  const columnBg = "color-mix(in srgb, var(--color-surface) 82%, transparent)";
  const border = "var(--color-border)";
  const subtleBorder =
    "color-mix(in srgb, var(--color-border) 70%, transparent)";
  const text = "var(--color-text)";
  const sub = "var(--color-text-subtle)";
  const accent = "var(--color-primary)";
  const danger = "var(--color-danger)";
  const dangerSoft = "var(--color-danger-soft)";
  useBodyScrollLock(showAddModal || showTrashModal || !!editingTask);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await tasksAPI.getAll();
      setTasks(res.data);
    } catch (err) {
      console.error("Error fetching tasks:", err);
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
      console.error("Error fetching trash:", err);
    } finally {
      setTrashLoading(false);
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    try {
      const taskData = {
        ...newTask,
        due_date: newTask.due_date === "" ? null : newTask.due_date,
      };
      await tasksAPI.create(taskData);
      setShowAddModal(false);
      setNewTask({
        title: "",
        description: "",
        status: "todo",
        priority: "medium",
        due_date: "",
        pic: "",
      });
      fetchTasks();
    } catch (err) {
      flash("Gagal menyimpan tugas. Silakan cek koneksi atau database.");
      console.error("Error adding task:", err);
    }
  };

  const updateTaskStatus = async (taskId, newStatus) => {
    try {
      const task = tasks.find((t) => t.id === taskId);
      if (task.status === newStatus) return;
      await tasksAPI.update(taskId, { ...task, status: newStatus });
      fetchTasks();
    } catch (err) {
      console.error("Error updating task status:", err);
    }
  };

  const onDragStart = (e, taskId) => {
    e.dataTransfer.setData("taskId", taskId);
  };
  const onDragOver = (e) => {
    e.preventDefault();
  };
  const onDrop = (e, columnId) => {
    const taskId = parseInt(e.dataTransfer.getData("taskId"));
    if (columnId === "trash") handleDeleteTask(taskId);
    else updateTaskStatus(taskId, columnId);
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await tasksAPI.softDelete(taskId);
      fetchTasks();
    } catch (err) {
      console.error("Error deleting task:", err);
    }
  };
  const handleRestoreTask = async (taskId) => {
    try {
      await tasksAPI.restore(taskId);
      fetchTrash();
      fetchTasks();
    } catch (err) {
      console.error("Error restoring task:", err);
    }
  };
  const handlePermanentDelete = async (taskId) => {
    if (
      !window.confirm(
        "Yakin ingin menghapus tugas ini secara permanen? Data tidak dapat dikembalikan.",
      )
    )
      return;
    try {
      await tasksAPI.permanentDelete(taskId);
      fetchTrash();
    } catch (err) {
      console.error("Error permanent delete:", err);
    }
  };

  const handleUpdateTask = async (e) => {
    e.preventDefault();
    try {
      const taskData = {
        ...editingTask,
        due_date: editingTask.due_date === "" ? null : editingTask.due_date,
      };
      await tasksAPI.update(editingTask.id, taskData);
      setEditingTask(null);
      fetchTasks();
    } catch (err) {
      flash("Gagal memperbarui tugas.");
      console.error("Error updating task:", err);
    }
  };

  const fetchHistory = async (taskId) => {
    try {
      const historyRes = await tasksAPI.getHistory(taskId);
      setTaskHistory(historyRes.data);
      setShowHistory(true);
    } catch (err) {
      console.error("Error fetching history:", err);
    }
  };

  const filteredTasks = tasks.filter(
    (task) =>
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.description?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const getTasksByStatus = (status) =>
    filteredTasks.filter((task) => task.status === status);

  // ─── Reusable inline styles ───────────────────────────────────────────────
  const inputStyle = {
    width: "100%",
    padding: "12px 16px",
    backgroundColor: surface,
    color: text,
    border: "none",
    borderRadius: "16px",
    fontSize: "14px",
    fontWeight: 500,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };
  const labelStyle = {
    display: "block",
    fontSize: "11px",
    fontWeight: "700",
    color: sub,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "6px",
    marginLeft: "4px",
  };

  // react-select dark-aware styles
  const reactSelectStyles = {
    control: (base, state) => ({
      ...base,
      backgroundColor: surface,
      border: "none",
      borderRadius: "16px",
      padding: "4px",
      boxShadow: state.isFocused ? `0 0 0 2px ${accent}40` : "none",
      color: text,
    }),
    singleValue: (base) => ({ ...base, color: text }),
    input: (base) => ({ ...base, color: text }),
    placeholder: (base) => ({ ...base, color: sub }),
    menu: (base) => ({
      ...base,
      borderRadius: "16px",
      overflow: "hidden",
      backgroundColor: cardBg,
      border: `1px solid ${border}`,
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? accent
        : state.isFocused
          ? surface
          : "transparent",
      color: state.isSelected ? "#FFF" : text,
      cursor: "pointer",
    }),
  };

  return (
    <div
      className="ui-motion-page flex flex-col h-full p-0 overflow-hidden"
      style={{ color: text }}
    >
      {/* Header */}
      <div className="flex justify-between items-end mb-6 flex-wrap gap-3">
        <div>
          <h2
            className="text-2xl font-bold tracking-tight"
            style={{ color: text }}
          >
            Manajemen Tugas
          </h2>
          <p className="text-sm font-medium" style={{ color: sub }}>
            Pantau progres operasional secara real-time
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary ui-motion-button ui-focus-ring flex items-center gap-2 text-white px-4 py-2 rounded-full text-xs font-semibold transition-all shadow-md hover:shadow-lg"
          data-magnetic="true"
          style={{ backgroundColor: accent }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "#0077ED")
          }
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = accent)}
        >
          <Plus size={14} />
          <span>Tugas Baru</span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex gap-4 mb-4 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2"
            size={14}
            style={{ color: sub }}
          />
          <input
            type="text"
            placeholder="Cari..."
            className="w-full rounded-xl py-2 pl-9 pr-4 text-xs font-medium transition-all"
            style={{
              backgroundColor: surface,
              color: text,
              border: `1px solid ${subtleBorder}`,
              outline: "none",
            }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={(e) =>
              (e.currentTarget.style.boxShadow = `0 0 0 2px ${accent}30`)
            }
            onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
          />
        </div>

        <button
          onClick={() => {
            fetchTrash();
            setShowTrashModal(true);
          }}
          className="ui-motion-button ui-focus-ring flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm"
          style={{
            backgroundColor: cardBg,
            color: danger,
            border: `1px solid ${subtleBorder}`,
          }}
          aria-label="Tempat Sampah"
        >
          <Trash2 size={14} />
          <span>Sampah</span>
        </button>
      </div>

      {/* Trash Modal */}
      {showTrashModal && renderPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowTrashModal(false)}
          />
          <div
            className="ui-motion-modal ui-modal-shell relative w-full max-w-3xl max-h-[80vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col"
            style={{ backgroundColor: cardBg, border: `1px solid ${border}` }}
          >
            <div
              className="p-6 flex justify-between items-center"
              style={{
                backgroundColor: bg,
                borderBottom: `1px solid ${border}`,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: dangerSoft, color: danger }}
                >
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-bold" style={{ color: text }}>
                    Tempat Sampah
                  </h3>
                  <p className="text-xs" style={{ color: sub }}>
                    Task yang dihapus dapat dikembalikan atau dihapus permanen
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTrashModal(false)}
                aria-label="Tutup sampah"
                className="ui-motion-button ui-focus-ring w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                style={{ color: text }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = surface)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {trashLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="animate-pulse h-20 rounded-2xl"
                      style={{ backgroundColor: surface }}
                    />
                  ))}
                </div>
              ) : trashTasks.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                    style={{ backgroundColor: surface, color: sub }}
                  >
                    <Trash2 size={32} />
                  </div>
                  <h4 className="font-bold" style={{ color: text }}>
                    Sampah Kosong
                  </h4>
                  <p
                    className="text-xs max-w-[200px] mt-1"
                    style={{ color: sub }}
                  >
                    Tidak ada task yang dihapus baru-baru ini.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {trashTasks.map((task) => (
                    <div
                      key={task.id}
                      className="ui-motion-card ui-hover-delight p-4 rounded-2xl flex items-center justify-between transition-all"
                      style={{
                        backgroundColor: bg,
                        border: `1px solid ${subtleBorder}`,
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="text-[10px] font-bold uppercase"
                            style={{ color: sub }}
                          >
                            {task.priority}
                          </span>
                          <span
                            className="w-1 h-1 rounded-full"
                            style={{ backgroundColor: sub, opacity: 0.5 }}
                          />
                          <span
                            className="text-[10px] font-bold"
                            style={{ color: sub }}
                          >
                            {task.status}
                          </span>
                        </div>
                        <h4
                          className="font-bold text-sm truncate"
                          style={{ color: text }}
                        >
                          {task.title}
                        </h4>
                        {task.description && (
                          <p
                            className="text-xs line-clamp-1 mt-0.5"
                            style={{ color: sub }}
                          >
                            {task.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => handleRestoreTask(task.id)}
                          className="btn-primary ui-motion-button ui-focus-ring flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all"
                          data-magnetic="true"
                          style={{
                            backgroundColor: cardBg,
                            color: text,
                            border: `1px solid ${subtleBorder}`,
                          }}
                        >
                          <RotateCcw size={14} />
                          <span>Pulihkan</span>
                        </button>
                        <TooltipButton
                          onClick={() => handlePermanentDelete(task.id)}
                          label="Hapus Permanen"
                          className="flex items-center justify-center w-8 h-8 rounded-xl transition-all"
                          style={{
                            backgroundColor: cardBg,
                            color: sub,
                            border: `1px solid ${subtleBorder}`,
                          }}
                        >
                          <Trash2 size={14} />
                        </TooltipButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              className="p-6 flex justify-end"
              style={{ backgroundColor: bg, borderTop: `1px solid ${border}` }}
            >
              <button
                onClick={() => setShowTrashModal(false)}
                className="ui-motion-button ui-focus-ring px-6 py-2 rounded-full text-xs font-bold transition-opacity"
                style={{ backgroundColor: text, color: cardBg }}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Board Content */}
      <div className="flex-1 flex gap-4 overflow-x-auto pb-2 custom-scrollbar p-1">
        {COLUMNS.map((column) => (
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
                <h3
                  className="font-bold text-sm tracking-tight"
                  style={{ color: text }}
                >
                  {column.label}
                </h3>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ backgroundColor: surface, color: sub }}
                >
                  {getTasksByStatus(column.id).length}
                </span>
              </div>
            </div>

            <div
              className="ui-motion-card rounded-2xl p-2 flex flex-col gap-2 overflow-y-auto custom-scrollbar h-[320px]"
              style={{
                backgroundColor: columnBg,
                border: `1px solid ${subtleBorder}`,
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
              }}
            >
              {loading ? (
                [1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="p-3 rounded-xl"
                    style={{
                      backgroundColor: cardBg,
                      border: `1px solid ${subtleBorder}`,
                    }}
                  >
                    <Skeleton
                      width="40px"
                      height="12px"
                      style={{ marginBottom: "8px" }}
                    />
                    <Skeleton
                      width="100%"
                      height="16px"
                      style={{ marginBottom: "8px" }}
                    />
                    <Skeleton width="80%" height="10px" />
                  </div>
                ))
              ) : (
                <>
                  {getTasksByStatus(column.id).map((task) => {
                    const pcfg =
                      PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
                    const pBg = isDarkMode ? pcfg.darkBg : pcfg.lightBg;
                    const pFg = isDarkMode ? pcfg.darkFg : pcfg.lightFg;
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, task.id)}
                        onClick={() => setEditingTask(task)}
                        className="ui-motion-card ui-hover-delight p-3 rounded-xl shadow-sm hover:shadow-md transition-all group cursor-pointer active:scale-95"
                        style={{
                          backgroundColor: cardBg,
                          border: `1px solid ${subtleBorder}`,
                          backdropFilter: "blur(10px)",
                          WebkitBackdropFilter: "blur(10px)",
                        }}
                      >
                        <div className="flex justify-between items-start mb-1.5">
                          <span
                            className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: pBg, color: pFg }}
                          >
                            {task.priority}
                          </span>
                        </div>
                        <h4
                          className="font-bold text-xs leading-snug mb-1.5 transition-colors"
                          style={{ color: text }}
                        >
                          {task.title}
                        </h4>
                        {task.description && (
                          <p
                            className="text-[10px] line-clamp-2 mb-2 leading-relaxed"
                            style={{ color: sub }}
                          >
                            {task.description}
                          </p>
                        )}
                        {task.due_date && (
                          <div
                            className="flex items-center gap-1 text-[9px] font-bold"
                            style={{ color: sub }}
                          >
                            <Calendar size={10} />
                            <span>
                              {new Date(task.due_date).toLocaleDateString(
                                "id-ID",
                                { day: "numeric", month: "short" },
                              )}
                            </span>
                          </div>
                        )}
                        {task.pic && (
                          <div
                            className="flex items-center gap-1 text-[9px] font-bold mt-1"
                            style={{ color: accent }}
                          >
                            <User size={10} />
                            <span>PIC: {task.pic}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {getTasksByStatus(column.id).length === 0 && (
                    <div
                      className="ui-motion-card ui-hover-delight flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl py-8"
                      style={{ borderColor: subtleBorder }}
                    >
                      <p
                        className="text-[10px] font-bold uppercase tracking-tighter"
                        style={{ color: sub, opacity: 0.5 }}
                      >
                        Empty
                      </p>
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
        onDrop={(e) => onDrop(e, "trash")}
        className="ui-motion-card mt-6 p-4 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all group"
        style={{ borderColor: subtleBorder, color: sub }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = danger;
          e.currentTarget.style.backgroundColor = dangerSoft;
          e.currentTarget.style.color = danger;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = subtleBorder;
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = sub;
        }}
      >
        <Trash2
          size={24}
          className="group-hover:scale-110 transition-transform"
        />
        <span className="text-[10px] font-bold uppercase tracking-wider">
          Drag here to delete
        </span>
      </div>

      {/* Add Modal */}
      {showAddModal && renderPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
          <div
            className="ui-motion-modal ui-modal-shell w-full max-w-lg rounded-[2.5rem] shadow-2xl p-8 transform transition-all"
            style={{
              backgroundColor: cardBg,
              color: text,
              border: `1px solid ${border}`,
            }}
          >
            <div className="flex justify-between items-center mb-6">
              <h2
                className="text-2xl font-extrabold tracking-tight"
                style={{ color: text }}
              >
                Buat Tugas Baru
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="ui-motion-button ui-focus-ring p-2 rounded-full transition-colors"
                style={{ color: sub }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = surface)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
                aria-label="Tutup"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleAddTask} className="space-y-5">
              <div className="space-y-2">
                <label style={labelStyle}>JUDUL TUGAS</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Audit Stok Gudang A"
                  style={inputStyle}
                  value={newTask.title}
                  onChange={(e) =>
                    setNewTask({ ...newTask, title: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <label style={labelStyle}>DESKRIPSI (OPSIONAL)</label>
                <textarea
                  rows="3"
                  placeholder="Detail tugas..."
                  style={{ ...inputStyle, resize: "none" }}
                  value={newTask.description}
                  onChange={(e) =>
                    setNewTask({ ...newTask, description: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label style={labelStyle}>PRIORITAS</label>
                  <select
                    style={{ ...inputStyle, appearance: "none" }}
                    value={newTask.priority}
                    onChange={(e) =>
                      setNewTask({ ...newTask, priority: e.target.value })
                    }
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label style={labelStyle}>DEADLINE</label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={newTask.due_date}
                    onChange={(e) =>
                      setNewTask({ ...newTask, due_date: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label style={labelStyle}>PENANGGUNG JAWAB (PIC)</label>
                <Select
                  options={[
                    { value: "Harun", label: "Harun" },
                    { value: "Fivin", label: "Fivin" },
                    { value: "Admin", label: "Admin" },
                  ]}
                  placeholder="Pilih PIC..."
                  classNamePrefix="react-select"
                  onChange={(opt) =>
                    setNewTask({ ...newTask, pic: opt ? opt.value : "" })
                  }
                  styles={reactSelectStyles}
                />
              </div>

              <div className="pt-4">
                <button
                  type="submit"
                  className="btn-primary ui-motion-button ui-focus-ring w-full py-4 rounded-2xl font-bold text-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.98]"
                  data-magnetic="true"
                  style={{ backgroundColor: accent, color: "#FFF" }}
                >
                  Simpan Tugas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingTask && renderPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-6">
          <div
            className="ui-motion-modal ui-modal-shell w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden transform transition-all"
            style={{
              backgroundColor: cardBg,
              color: text,
              border: `1px solid ${border}`,
            }}
          >
            <div className="flex justify-between items-center p-8 pb-4">
              <h2
                className="text-2xl font-extrabold tracking-tight"
                style={{ color: text }}
              >
                Detail Tugas
              </h2>
              <div className="flex gap-2">
                <TooltipButton
                  onClick={() => fetchHistory(editingTask.id)}
                  label="Lihat Riwayat"
                  className="p-2 rounded-full transition-colors"
                  style={{ color: sub }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = surface)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                >
                  <History size={20} />
                </TooltipButton>
                <button
                  onClick={() => setEditingTask(null)}
                  className="ui-motion-button ui-focus-ring p-2 rounded-full transition-colors"
                  style={{ color: sub }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = surface)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                  aria-label="Tutup"
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
                    className="ui-motion-button ui-focus-ring text-xs font-bold flex items-center gap-1 mb-2"
                    style={{ color: accent }}
                  >
                    <ChevronDown size={14} className="rotate-90" /> Kembali
                  </button>
                  <div className="space-y-3">
                    {taskHistory.length > 0 ? (
                      taskHistory.map((log, li) => (
                        <div
                          key={li}
                          className="p-3 rounded-xl"
                          style={{
                            backgroundColor: surface,
                            border: `1px solid ${subtleBorder}`,
                          }}
                        >
                          <div
                            className="flex justify-between text-[10px] font-bold mb-1"
                            style={{ color: sub }}
                          >
                            <span className="uppercase">
                              {log.action.replace("_", " ")}
                            </span>
                            <span>
                              {new Date(log.changed_at).toLocaleString("id-ID")}
                            </span>
                          </div>
                          <p className="text-xs" style={{ color: text }}>
                            {log.action === "status_change" ? (
                              <>
                                Status berubah:{" "}
                                <span className="font-bold">
                                  {log.old_value.status}
                                </span>{" "}
                                →{" "}
                                <span
                                  className="font-bold"
                                  style={{ color: accent }}
                                >
                                  {log.new_value.status}
                                </span>
                              </>
                            ) : log.action === "created" ? (
                              "Tugas dibuat"
                            ) : (
                              "Detail diperbarui"
                            )}
                          </p>
                        </div>
                      ))
                    ) : (
                      <EmptyState
                        compact
                        icon={EmptyStateIcons.checklist}
                        title="Belum ada riwayat"
                        description="Perubahan task akan muncul di sini setelah ada aktivitas."
                      />
                    )}
                  </div>
                </div>
              ) : (
                <form onSubmit={handleUpdateTask} className="space-y-5">
                  <div className="space-y-2">
                    <label style={labelStyle}>JUDUL TUGAS</label>
                    <input
                      type="text"
                      required
                      style={inputStyle}
                      value={editingTask.title}
                      onChange={(e) =>
                        setEditingTask({
                          ...editingTask,
                          title: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <label style={labelStyle}>DESKRIPSI</label>
                    <textarea
                      rows="3"
                      style={{ ...inputStyle, resize: "none" }}
                      value={editingTask.description || ""}
                      onChange={(e) =>
                        setEditingTask({
                          ...editingTask,
                          description: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label style={labelStyle}>PRIORITAS</label>
                      <select
                        style={{ ...inputStyle, appearance: "none" }}
                        value={editingTask.priority}
                        onChange={(e) =>
                          setEditingTask({
                            ...editingTask,
                            priority: e.target.value,
                          })
                        }
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label style={labelStyle}>DEADLINE</label>
                      <input
                        type="date"
                        style={inputStyle}
                        value={
                          editingTask.due_date
                            ? editingTask.due_date.split("T")[0]
                            : ""
                        }
                        onChange={(e) =>
                          setEditingTask({
                            ...editingTask,
                            due_date: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label style={labelStyle}>PENANGGUNG JAWAB (PIC)</label>
                    <Select
                      options={[
                        { value: "Harun", label: "Harun" },
                        { value: "Fivin", label: "Fivin" },
                        { value: "Admin", label: "Admin" },
                      ]}
                      defaultValue={
                        editingTask.pic
                          ? { value: editingTask.pic, label: editingTask.pic }
                          : null
                      }
                      placeholder="Pilih PIC..."
                      classNamePrefix="react-select"
                      onChange={(opt) =>
                        setEditingTask({
                          ...editingTask,
                          pic: opt ? opt.value : "",
                        })
                      }
                      styles={reactSelectStyles}
                    />
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        handleDeleteTask(editingTask.id).then(() =>
                          setEditingTask(null),
                        )
                      }
                      className="ui-motion-button ui-focus-ring flex-1 py-4 rounded-2xl font-bold text-sm transition-all"
                      style={{ backgroundColor: dangerSoft, color: danger }}
                    >
                      Hapus
                    </button>
                    <button
                      type="submit"
                      className="btn-primary ui-motion-button ui-focus-ring flex-[2] py-4 rounded-2xl font-bold text-sm shadow-lg hover:shadow-xl transition-all active:scale-[0.98]"
                      data-magnetic="true"
                      style={{ backgroundColor: accent, color: "#FFF" }}
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

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)"}; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: ${isDarkMode ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.1)"}; }
      `,
        }}
      />

      {toast && (
        <div
          className="ui-motion-toast"
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            backgroundColor: "var(--color-success)",
            color: "#FFF",
            padding: "12px 20px",
            borderRadius: "10px",
            fontWeight: "600",
            fontSize: "14px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            zIndex: 99999,
          }}
        >
          ✅ {toast}
        </div>
      )}
    </div>
  );
};

export default TasksKanban;
