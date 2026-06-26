"use client"

import { useState, useRef, useEffect, createContext, useContext } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "../../lib/theme"
import { supabase } from "../../lib/supabase"
import { API } from "../../lib/api"

// ── Color tokens ──────────────────────────────────────────────
const C_DARK = {
  bg:        "#0D0D0F",
  card:      "rgba(20,20,22,0.88)",
  surface:   "rgba(255,255,255,0.05)",
  border:    "rgba(16,207,168,0.34)",
  text:      "#EEEEF2",
  muted:     "#8A8A9A",
  hint:      "#6B6B80",
  violet:    "#7B61FF",
  teal:      "#10CFA8",
  amber:     "#F59E0B",
  red:       "#EF4444",
}

const C_LIGHT = {
  bg:        "#F8FAFC",
  card:      "rgba(255,255,255,0.88)",
  surface:   "rgba(255,255,255,0.78)",
  border:    "rgba(123,97,255,0.20)",
  text:      "#18181B",
  muted:     "#71717A",
  hint:      "#A1A1AA",
  violet:    "#7B61FF",
  teal:      "#0E9E81",
  amber:     "#D97706",
  red:       "#DC2626",
}

type ColorScheme = typeof C_DARK
const ThemeColors = createContext<ColorScheme>(C_DARK)
function useColors() { return useContext(ThemeColors) }

// ── Types ─────────────────────────────────────────────────────
type Step = 1 | 2 | 3
type Feasibility = "tight" | "manageable" | "comfortable" | null

interface Topic {
  id:             string
  name:           string
  estimatedHours: number
}


// ── Helpers ───────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 8)
}

function computeFeasibility(topics: Topic[], deadline: string): Feasibility {
  if (!deadline || topics.length === 0) return null
  const daysLeft   = (new Date(deadline).getTime() - Date.now()) / 86_400_000
  const totalHours = topics.reduce((a, t) => a + t.estimatedHours, 0)
  const available  = daysLeft * 6
  const ratio      = available / totalHours
  if (ratio < 0.85) return "tight"
  if (ratio < 1.5)  return "manageable"
  return "comfortable"
}

// ── Sub-components ────────────────────────────────────────────
function StepIndicator({ current }: { current: Step }) {
  const C = useColors()
  const steps = [
    { n: 1 as Step, label: "Name" },
    { n: 2 as Step, label: "Topics" },
    { n: 3 as Step, label: "Deadline" },
  ]
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: "2rem" }}>
      {steps.map((s, i) => (
        <div key={s.n} style={{ display: "flex", alignItems: "center" }}>
          {i > 0 && (
            <div style={{
              width: 40, height: 1,
              background: current > s.n - 1 ? C.violet : C.border,
              transition: "background 0.2s",
            }} />
          )}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", display: "flex",
              alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 600,
              background: current === s.n
                ? C.violet
                : current > s.n
                  ? C.violet + "40"
                  : C.surface,
              color: current >= s.n ? "#fff" : C.hint,
              border: `1px solid ${current >= s.n ? C.violet : C.border}`,
              transition: "all 0.2s",
            }}>
              {current > s.n ? "✓" : s.n}
            </div>
            <span style={{
              fontSize: 10, color: current >= s.n ? C.muted : C.hint,
              textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              {s.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  const C = useColors()
  return (
    <label style={{
      fontSize: 11, color: C.muted, display: "block", marginBottom: 7,
      textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 500,
    }}>
      {children}
    </label>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const C = useColors()
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 16, padding: "1.25rem",
      boxShadow: `0 0 0 1px ${C.violet}14, 0 0 24px ${C.teal}22`,
      backdropFilter: "blur(18px)",
      position: "relative",
      overflow: "hidden",
      ...style,
    }}>
      <div style={{
        position: "absolute",
        top: 0,
        left: 16,
        right: 16,
        height: 1,
        background: `linear-gradient(90deg, transparent, ${C.teal}, transparent)`,
        opacity: 0.8,
        pointerEvents: "none",
      }} />
      {children}
    </div>
  )
}

// ── Step 1: Name ──────────────────────────────────────────────
function Step1({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const C = useColors()
  return (
    <Card>
      <FieldLabel>Session name</FieldLabel>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="e.g. DSA Exam, OS Mid Sem, GATE 2027 …"
        autoFocus
        style={{
          width: "100%", background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "10px 14px", fontSize: 14,
          color: C.text, outline: "none", boxSizing: "border-box",
        }}
        onFocus={e => (e.target.style.borderColor = C.violet)}
        onBlur={e  => (e.target.style.borderColor = C.border)}
      />
      <p style={{ fontSize: 11, color: C.hint, margin: "10px 0 0" }}>
        This is just a label — you can rename it later.
      </p>
    </Card>
  )
}

// ── Step 2: Topics ────────────────────────────────────────────
function Step2({
  topics, setTopics, uploading, fileName, setFileName, setPdfFile,
}: {
  topics:       Topic[]
  setTopics:    (t: Topic[]) => void
  uploading:    boolean
  fileName:     string | null
  setFileName:  (v: string | null) => void
  setPdfFile:   (f: File | null) => void
}) {
  const C = useColors()
  const [manualText, setManualText] = useState("")
  const [dragOver,   setDragOver]   = useState(false)
  const [dragIndex,  setDragIndex]  = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (file: File) => {
    if (file.type !== "application/pdf") return
    setFileName(file.name)
    setPdfFile(file)
    setTopics([])
  }

  const parseManual = () => {
    const lines = manualText.split("\n").map(l => l.trim()).filter(Boolean)
    setTopics(lines.map(name => ({ id: uid(), name, estimatedHours: 1.5 })))
  }

  const onDragStart = (i: number) => setDragIndex(i)
  const onDragOver  = (e: React.DragEvent, i: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === i) return
    const arr = [...topics]
    const [item] = arr.splice(dragIndex, 1)
    arr.splice(i, 0, item)
    setTopics(arr)
    setDragIndex(i)
  }
  const onDragEnd = () => setDragIndex(null)

  const updateName  = (id: string, name: string) =>
    setTopics(topics.map(t => t.id === id ? { ...t, name } : t))
  const updateHours = (id: string, h: number) =>
    setTopics(topics.map(t => t.id === id ? { ...t, estimatedHours: h } : t))
  const remove      = (id: string) => setTopics(topics.filter(t => t.id !== id))
  const addEmpty    = () => setTopics([...topics, { id: uid(), name: "", estimatedHours: 1.5 }])

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

        {/* PDF upload */}
        <Card>
          <FieldLabel>Upload syllabus PDF</FieldLabel>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            style={{
              border: `1.5px dashed ${dragOver ? C.violet : C.border}`,
              borderRadius: 9, padding: "1.5rem 1rem",
              textAlign: "center", cursor: "pointer",
              background: dragOver ? C.violet + "08" : C.surface,
              transition: "all 0.15s",
            }}
          >
            <div style={{ fontSize: 22, marginBottom: 6 }}>📄</div>
            <p style={{ fontSize: 12, color: C.muted, margin: "0 0 4px" }}>
              {fileName ? fileName : "Drop PDF here or click to browse"}
            </p>
            <p style={{ fontSize: 10, color: C.hint, margin: 0 }}>Syllabus, notes, or any PDF</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
          {fileName && (
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13 }}>✓</span>
              <span style={{ fontSize: 11, color: C.teal }}>PDF ready — topics will be extracted by AI when you submit</span>
            </div>
          )}
        </Card>

        {/* Manual paste */}
        <Card>
          <FieldLabel>Paste topics manually</FieldLabel>
          <textarea
            value={manualText}
            onChange={e => setManualText(e.target.value)}
            placeholder={"Arrays & Strings\nLinked Lists\nTrees & BST\nDynamic Programming\n…"}
            rows={5}
            style={{
              width: "100%", background: C.surface,
              border: `1px solid ${C.border}`, borderRadius: 8,
              padding: "10px 12px", fontSize: 12, color: C.text,
              resize: "none", outline: "none", boxSizing: "border-box",
              fontFamily: "monospace", lineHeight: 1.7,
            }}
            onFocus={e => (e.target.style.borderColor = C.violet)}
            onBlur={e  => (e.target.style.borderColor = C.border)}
          />
          <button
            onClick={parseManual}
            disabled={!manualText.trim()}
            style={{
              marginTop: 10, width: "100%", padding: "8px",
              fontSize: 12, fontWeight: 500, cursor: "pointer",
              borderRadius: 7, border: `1px solid ${C.border}`,
              background: manualText.trim() ? C.violet + "20" : "transparent",
              color: manualText.trim() ? C.violet : C.hint,
              transition: "all 0.15s",
            }}
          >
            Parse topics →
          </button>
        </Card>
      </div>

      {/* Topic list */}
      {topics.length > 0 && !uploading && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <FieldLabel>{topics.length} topics — drag to reorder</FieldLabel>
            <button
              onClick={addEmpty}
              style={{ fontSize: 11, color: C.violet, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              + Add topic
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {topics.map((t, i) => (
              <div
                key={t.id}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragOver={e => onDragOver(e, i)}
                onDragEnd={onDragEnd}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 8,
                  background: dragIndex === i ? C.violet + "12" : C.surface,
                  border: `1px solid ${dragIndex === i ? C.violet + "44" : C.border}`,
                  cursor: "grab", transition: "all 0.1s",
                }}
              >
                <span style={{ color: C.hint, fontSize: 12, cursor: "grab", flexShrink: 0 }}>⋮⋮</span>
                <span style={{ fontSize: 10, color: C.hint, fontFamily: "monospace", width: 18, flexShrink: 0 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <input
                  value={t.name}
                  onChange={e => updateName(t.id, e.target.value)}
                  style={{
                    flex: 1, background: "transparent", border: "none",
                    color: C.text, fontSize: 13, outline: "none", minWidth: 0,
                  }}
                  placeholder="Topic name"
                />
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <input
                    type="number"
                    value={t.estimatedHours}
                    onChange={e => updateHours(t.id, parseFloat(e.target.value) || 0)}
                    min={0.5} max={20} step={0.5}
                    style={{
                      width: 40, background: "transparent", border: `1px solid ${C.border}`,
                      borderRadius: 5, padding: "2px 6px", fontSize: 11,
                      color: C.muted, textAlign: "center", outline: "none",
                    }}
                  />
                  <span style={{ fontSize: 10, color: C.hint }}>h</span>
                </div>
                <button
                  onClick={() => remove(t.id)}
                  style={{ color: C.hint, background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "0 2px", flexShrink: 0 }}
                  onMouseEnter={e => (e.currentTarget.style.color = C.red)}
                  onMouseLeave={e => (e.currentTarget.style.color = C.hint)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 10, color: C.hint, margin: "10px 0 0" }}>
            Total estimated: {topics.reduce((a, t) => a + t.estimatedHours, 0).toFixed(1)} hours
          </p>
        </Card>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── DateTimePicker ────────────────────────────────────────────
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const DAYS_SHORT = ["Su","Mo","Tu","We","Th","Fr","Sa"]

function DateTimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const C = useColors()
  const [calOpen, setCalOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const parsed  = value ? new Date(value) : null
  const initH24 = parsed?.getHours() ?? 9
  const init12  = initH24 === 0 ? 12 : initH24 > 12 ? initH24 - 12 : initH24

  const fmtDDMMYY = (y: number, mo: number, d: number) =>
    `${String(d).padStart(2,"0")}/${String(mo+1).padStart(2,"0")}/${String(y).slice(-2)}`

  const [viewYear,  setViewYear]  = useState(parsed?.getFullYear() ?? new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth()    ?? new Date().getMonth())
  const [selDate, setSelDate] = useState<{ y: number; m: number; d: number } | null>(
    parsed ? { y: parsed.getFullYear(), m: parsed.getMonth(), d: parsed.getDate() } : null,
  )
  const [dateText, setDateText] = useState(
    parsed ? fmtDDMMYY(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) : ""
  )
  const [hour12, setHour12] = useState(init12)
  const [minute, setMinute] = useState(
    parsed ? Math.round(parsed.getMinutes() / 5) * 5 % 60 : 0
  )
  const [ampm, setAmpm] = useState<"AM"|"PM">(initH24 >= 12 ? "PM" : "AM")

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setCalOpen(false)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [])

  const to24 = (h12: number, ap: "AM"|"PM") =>
    ap === "AM" ? (h12 === 12 ? 0 : h12) : (h12 === 12 ? 12 : h12 + 12)

  const emit = (y: number, mo: number, d: number, h12: number, mi: number, ap: "AM"|"PM") => {
    const pad = (n: number) => String(n).padStart(2, "0")
    onChange(`${y}-${pad(mo + 1)}-${pad(d)}T${pad(to24(h12, ap))}:${pad(mi)}`)
  }

  const applyDate = (y: number, mo: number, d: number) => {
    setSelDate({ y, m: mo, d })
    setViewYear(y); setViewMonth(mo)
    setDateText(fmtDDMMYY(y, mo, d))
    emit(y, mo, d, hour12, minute, ampm)
  }

  // Parse DD/MM/YY typed directly into the date field
  const handleDateText = (v: string) => {
    setDateText(v)
    const p = v.split("/")
    if (p.length === 3) {
      const d  = parseInt(p[0])
      const mo = parseInt(p[1]) - 1
      let   y  = parseInt(p[2])
      if (!isNaN(d) && !isNaN(mo) && !isNaN(y) && d >= 1 && d <= 31 && mo >= 0 && mo <= 11) {
        if (y >= 0 && y < 100) y += 2000
        if (y >= 2000) {
          setSelDate({ y, m: mo, d })
          setViewYear(y); setViewMonth(mo)
          emit(y, mo, d, hour12, minute, ampm)
        }
      }
    }
  }

  const handleHour = (h: number) => {
    setHour12(h)
    if (selDate) emit(selDate.y, selDate.m, selDate.d, h, minute, ampm)
  }
  const handleMinute = (mi: number) => {
    setMinute(mi)
    if (selDate) emit(selDate.y, selDate.m, selDate.d, hour12, mi, ampm)
  }
  const toggleAmpm = () => {
    const ap = ampm === "AM" ? "PM" : "AM"
    setAmpm(ap)
    if (selDate) emit(selDate.y, selDate.m, selDate.d, hour12, minute, ap)
  }

  // Always 42 cells = fixed 6 rows regardless of month
  const firstDay = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMo = new Date(viewYear, viewMonth + 1, 0).getDate()
  const today    = new Date()
  const cells: Array<number | null> = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMo; d++) cells.push(d)
  while (cells.length < 42) cells.push(null)

  const yearOpts   = Array.from({ length: 8 },  (_, i) => new Date().getFullYear() - 1 + i)
  const hourOpts   = Array.from({ length: 12 }, (_, i) => i + 1)
  const minuteOpts = Array.from({ length: 12 }, (_, i) => i * 5)

  const sel: React.CSSProperties = {
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 6, padding: "3px 4px", fontSize: 12, color: C.text,
    outline: "none", cursor: "pointer",
  }

  return (
    <div ref={wrapRef}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>

        {/* ── Date: text input + calendar icon ── */}
        <div style={{ position: "relative", flex: 3 }}>
          <div style={{
            display: "flex", alignItems: "center", overflow: "hidden",
            background: C.surface,
            border: `1px solid ${calOpen ? C.violet : C.border}`,
            borderRadius: 8, transition: "border-color 0.15s",
          }}>
            <input
              value={dateText}
              onChange={e => handleDateText(e.target.value)}
              placeholder="DD/MM/YY"
              maxLength={8}
              style={{
                flex: 1, background: "transparent", border: "none",
                padding: "10px 12px", fontSize: 13, color: C.text,
                outline: "none", minWidth: 0,
              }}
              onFocus={() => setCalOpen(true)}
            />
            <button
              type="button"
              onClick={() => setCalOpen(o => !o)}
              title="Open calendar"
              style={{
                background: calOpen ? C.violet + "18" : "transparent",
                border: "none", borderLeft: `1px solid ${C.border}`,
                padding: "0 12px", alignSelf: "stretch", cursor: "pointer",
                display: "flex", alignItems: "center",
                color: calOpen ? C.violet : C.muted,
                transition: "all 0.15s", flexShrink: 0,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8"  y1="2" x2="8"  y2="6"/>
                <line x1="3"  y1="10" x2="21" y2="10"/>
              </svg>
            </button>
          </div>
          <p style={{ fontSize: 10, color: C.hint, margin: "4px 0 0 2px" }}>
            Type DD/MM/YY or click 📅
          </p>

          {/* Calendar dropdown */}
          {calOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 2px)", left: 0, zIndex: 200,
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: "12px 14px 14px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.28)",
              width: 270,
            }}>
              {/* Month + Year selects */}
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                <select value={viewMonth} onChange={e => setViewMonth(Number(e.target.value))} style={{ ...sel, flex: 1 }}>
                  {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                </select>
                <select value={viewYear} onChange={e => setViewYear(Number(e.target.value))} style={{ ...sel, width: 68 }}>
                  {yearOpts.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              {/* Weekday headers */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 3 }}>
                {DAYS_SHORT.map(d => (
                  <div key={d} style={{ textAlign: "center", fontSize: 10, color: C.hint, fontWeight: 600, padding: "2px 0" }}>{d}</div>
                ))}
              </div>

              {/* 42-cell grid — always 6 rows */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                {cells.map((d, i) => {
                  if (d === null) return <div key={`e${i}`} style={{ aspectRatio: "1" }} />
                  const isSel   = !!(selDate && selDate.y === viewYear && selDate.m === viewMonth && selDate.d === d)
                  const isToday = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === d
                  return (
                    <button
                      key={d} type="button"
                      onClick={() => { applyDate(viewYear, viewMonth, d); setCalOpen(false) }}
                      style={{
                        width: "100%", aspectRatio: "1", borderRadius: 6, border: "none",
                        cursor: "pointer", fontSize: 11,
                        fontWeight: isSel || isToday ? 700 : 400,
                        background: isSel ? C.violet : isToday ? C.violet + "22" : "transparent",
                        color: isSel ? "#fff" : isToday ? C.violet : C.text,
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = C.violet + "28" }}
                      onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isToday ? C.violet + "22" : "transparent" }}
                    >{d}</button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Time: always-visible selects + AM/PM ── */}
        <div style={{ flex: 2 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "0 10px", height: 42, boxSizing: "border-box",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.65 }}>
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <select value={hour12} onChange={e => handleHour(Number(e.target.value))} style={{ ...sel, minWidth: 44 }}>
              {hourOpts.map(h => <option key={h} value={h}>{String(h).padStart(2,"0")}</option>)}
            </select>
            <span style={{ color: C.hint, fontWeight: 700, fontSize: 15, flexShrink: 0 }}>:</span>
            <select value={minute} onChange={e => handleMinute(Number(e.target.value))} style={{ ...sel, minWidth: 44 }}>
              {minuteOpts.map(m => <option key={m} value={m}>{String(m).padStart(2,"0")}</option>)}
            </select>
            <button type="button" onClick={toggleAmpm} style={{
              background: C.violet + "20", border: `1px solid ${C.violet}55`,
              borderRadius: 5, padding: "2px 6px", fontSize: 11, fontWeight: 700,
              color: C.violet, cursor: "pointer", flexShrink: 0,
            }}>{ampm}</button>
          </div>
          <p style={{ fontSize: 10, color: C.hint, margin: "4px 0 0 2px" }}>Time</p>
        </div>

      </div>
    </div>
  )
}

// ── Step 3: Deadline ──────────────────────────────────────────
function Step3({
  topics, deadline, setDeadline, feasibility, setFeasibility, now,
}: {
  topics:         Topic[]
  deadline:       string
  setDeadline:    (v: string) => void
  feasibility:    Feasibility
  setFeasibility: (v: Feasibility) => void
  now:            number
}) {
  const C = useColors()
  const totalHours = topics.reduce((a, t) => a + t.estimatedHours, 0)
  const daysLeft   = deadline
    ? Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 86_400_000))
    : null

  const feasibilityConfig: Record<NonNullable<Feasibility>, { label: string; color: string; bg: string; icon: string }> = {
    tight:       { label: "Tight",       color: C.red,   bg: C.red   + "18", icon: "⚠" },
    manageable:  { label: "Manageable",  color: C.amber, bg: C.amber + "18", icon: "⚡" },
    comfortable: { label: "Comfortable", color: C.teal,  bg: C.teal  + "18", icon: "✓" },
  }

  const onDeadlineChange = (v: string) => {
    setDeadline(v)
    setFeasibility(computeFeasibility(topics, v))
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card>
        <FieldLabel>Exam or submission deadline</FieldLabel>
        <DateTimePicker value={deadline} onChange={onDeadlineChange} />
      </Card>

      {feasibility && deadline && (
        <div style={{
          background: feasibilityConfig[feasibility].bg,
          border: `1px solid ${feasibilityConfig[feasibility].color}44`,
          borderRadius: 10, padding: "1rem 1.125rem",
        }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: feasibilityConfig[feasibility].color, marginBottom: 5 }}>
            {feasibilityConfig[feasibility].icon} {feasibilityConfig[feasibility].label} timeline
          </div>
          <p style={{ fontSize: 12, color: C.text, margin: 0, lineHeight: 1.65 }}>
            You have <strong style={{ color: C.text }}>{topics.length} topics</strong> ({totalHours.toFixed(1)}h estimated)
            and <strong style={{ color: C.text }}>{daysLeft} day{daysLeft !== 1 ? "s" : ""}</strong> until your deadline.
            {feasibility === "tight" && " This is very tight — you'll need to prioritise ruthlessly or defer some topics."}
            {feasibility === "manageable" && " This is achievable if you're consistent. Stick to the suggested order below."}
            {feasibility === "comfortable" && " You have enough time. Use it for depth — don't just rush through topics."}
          </p>
        </div>
      )}

      {topics.length > 0 && deadline && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <FieldLabel>Suggested priority order</FieldLabel>
            <span style={{ fontSize: 10, color: C.hint }}>by estimated complexity</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[...topics]
              .sort((a, b) => b.estimatedHours - a.estimatedHours)
              .map((t, i) => (
                <div
                  key={t.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "9px 4px",
                    borderBottom: i < topics.length - 1 ? `1px solid ${C.border}` : "none",
                  }}
                >
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: C.hint, width: 20, flexShrink: 0 }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span style={{ flex: 1, fontSize: 13, color: C.text }}>{t.name}</span>
                  <span style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>
                    ~{t.estimatedHours}h
                  </span>
                  <div style={{ width: 50, height: 3, background: C.border, borderRadius: 99 }}>
                    <div style={{
                      height: "100%",
                      width: `${(t.estimatedHours / Math.max(...topics.map(x => x.estimatedHours))) * 100}%`,
                      background: C.violet, borderRadius: 99,
                    }} />
                  </div>
                </div>
              ))}
          </div>
          <p style={{ fontSize: 10, color: C.hint, margin: "10px 0 0" }}>
            Ormify sorts by estimated time. You can reorder these in Step 2 before starting.
          </p>
        </Card>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function NewSessionPage() {
  const router = useRouter()
  const { theme } = useTheme()
  const C = theme === "dark" ? C_DARK : C_LIGHT

  const [step,        setStep]        = useState<Step>(1)
  const [sessionName, setSessionName] = useState("")
  const [topics,      setTopics]      = useState<Topic[]>([])
  const [uploading] = useState(false)
  const [fileName,    setFileName]    = useState<string | null>(null)
  const [pdfFile,     setPdfFile]     = useState<File | null>(null)
  const [deadline,    setDeadline]    = useState("")
  const [feasibility, setFeasibility] = useState<Feasibility>(null)
  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  const canProceed =
    step === 1 ? sessionName.trim().length > 0 :
    step === 2 ? (topics.length > 0 || pdfFile !== null) && !uploading :
    deadline.length > 0

  const handleBack = () => setStep(s => Math.max(1, s - 1) as Step)

  const handleNext = async () => {
    if (step < 3) {
      setStep(s => (s + 1) as Step)
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }

      const res = await fetch(`${API}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:    sessionName,
          deadline: new Date(deadline).toISOString(),
          user_id:  user.id,
        }),
      })
      if (!res.ok) throw new Error("Failed to create session")
      const { session_id } = await res.json()

      if (pdfFile) {
        const form = new FormData()
        form.append("file", pdfFile)
        const pr = await fetch(`${API}/sessions/${session_id}/parse-syllabus`, {
          method: "POST",
          body: form,
        })
        if (!pr.ok) {
          const detail = await pr.json().catch(() => ({ detail: pr.statusText }))
          throw new Error(detail.detail ?? "Failed to extract topics from PDF")
        }
      } else {
        const tr = await fetch(`${API}/sessions/${session_id}/topics`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topics: topics.map(t => ({
              name:            t.name,
              estimated_hours: t.estimatedHours,
            })),
          }),
        })
        if (!tr.ok) {
          const detail = await tr.json().catch(() => ({ detail: tr.statusText }))
          throw new Error(detail.detail ?? "Failed to save topics")
        }
      }

      router.push(`/study/${session_id}`)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  const stepLabels: Record<Step, string> = {
    1: "Name your session",
    2: "Add topics",
    3: "Set your deadline",
  }

  return (
    <ThemeColors.Provider value={C}>
      <div className="orm-bg" style={{ minHeight: "100vh", color: C.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>

        {/* ── Top bar ── */}
        <header style={{
          borderBottom: `1px solid ${C.border}`, padding: "0 2rem",
          height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "sticky", top: 0, background: theme === "dark" ? "rgba(15,15,15,0.82)" : "rgba(255,255,255,0.78)",
          zIndex: 50, backdropFilter: "blur(18px)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 999, background: C.violet,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700, color: "#fff",
              boxShadow: `0 0 22px ${C.violet}aa`,
            }}>O</div>
            <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.02em", color: C.text }}>Ormify</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => router.push("/dashboard")}
              style={{
                fontSize: 12, color: C.violet, background: C.violet + "12",
                border: `1px solid ${C.violet}55`, borderRadius: 10,
                padding: "7px 14px", cursor: "pointer", fontWeight: 600,
              }}
            >
              ← Back to dashboard
            </button>
          </div>
        </header>

        {/* ── Main ── */}
        <main style={{ maxWidth: 720, margin: "0 auto", padding: "2.5rem 1.5rem" }}>

          <div style={{ marginBottom: "2rem" }}>
            <h1 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.025em", color: C.text }}>
              New session
            </h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              {stepLabels[step]}
            </p>
          </div>

          <StepIndicator current={step} />

          {step === 1 && <Step1 value={sessionName} onChange={setSessionName} />}
          {step === 2 && (
            <Step2
              topics={topics}
              setTopics={setTopics}
              uploading={uploading}
              fileName={fileName}
              setFileName={setFileName}
              setPdfFile={setPdfFile}
            />
          )}
          {step === 3 && (
            <Step3
              topics={topics}
              deadline={deadline}
              setDeadline={setDeadline}
              feasibility={feasibility}
              setFeasibility={setFeasibility}
              now={now}
            />
          )}

          {/* ── Navigation ── */}
          <div style={{ display: "flex", gap: 10, marginTop: "1.5rem" }}>
            {step > 1 && (
              <button
                onClick={handleBack}
                style={{
                  flex: 1, padding: "11px", fontSize: 13,
                  cursor: "pointer", borderRadius: 9,
                  border: `1px solid ${C.violet}55`,
                  background: C.violet + "10", color: C.violet,
                  fontWeight: 600,
                }}
              >
                ← Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={!canProceed || submitting}
              style={{
                flex: 2, padding: "11px", fontSize: 13, fontWeight: 600,
                cursor: canProceed ? "pointer" : "not-allowed",
                borderRadius: 9, border: "none",
                background: canProceed ? C.violet : C.hint,
                color: "#fff", letterSpacing: "-0.01em",
                opacity: submitting ? 0.7 : 1,
                transition: "all 0.15s",
                boxShadow: canProceed ? `0 0 22px ${C.violet}77` : "none",
              }}
            >
              {submitting ? "Creating session…" : step === 3 ? "Start session →" : "Continue →"}
            </button>
          </div>

          {step === 2 && topics.length === 0 && !pdfFile && !uploading && (
            <p style={{ fontSize: 11, color: C.hint, textAlign: "center", marginTop: 12 }}>
              Upload a PDF or paste topics manually to continue
            </p>
          )}
          {submitError && (
            <p style={{ fontSize: 12, color: C.red, textAlign: "center", marginTop: 10 }}>
              {submitError}
            </p>
          )}
        </main>
      </div>
    </ThemeColors.Provider>
  )
}