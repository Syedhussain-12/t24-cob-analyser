import { useState, useRef, useEffect } from "react";

const THEME = {
  bg: "#111620", surface: "#181e2a", surfaceAlt: "#1e2638",
  border: "#2a3650", borderBright: "#3a4f70",
  accent: "#f0a500", green: "#00d48a", red: "#ff4d6d",
  blue: "#4da6ff", purple: "#c084fc",
  textPrimary: "#f0f4fa", textSecondary: "#a0b0c8", textMuted: "#6a80a0",
};

const SYSTEM_PROMPT = `You are a senior Temenos T24 Core Banking performance engineer. Analyze the provided log files and return ONLY a valid JSON object — no markdown, no backticks, no text before or after.

Rules:
- Identify ALL real issues found in the logs — do not limit to 2
- Each issue must reference actual log entries, error codes, or timestamps found
- Severity must reflect actual impact: CRITICAL=system failure/data loss risk, HIGH=major perf impact, MEDIUM=degraded perf, LOW=minor
- duration_risk is overall COB health: CRITICAL/HIGH/MEDIUM/LOW based on actual findings
- Fixes must be specific T24 actions with field names, commands, or config changes
- If KB documents are provided, use them to give more accurate and specific fixes
- Strings can be up to 120 characters
- Return between 2-6 issues, 2-4 optimizations, 2-4 cob_phases, 3-5 priority_actions based on what is actually found

JSON format:
{
  "summary": "Concise description of what was found in these specific logs",
  "duration_risk": "CRITICAL|HIGH|MEDIUM|LOW",
  "issues": [
    {
      "category": "Database Index|Batch Config|TSA Services|PGM File|OFS Logging|AA Architecture|WAS|JMS|IBM MQ|Runtime|Other",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "title": "Specific issue title referencing actual log entry",
      "detail": "What exactly was found in the log and why it is a problem",
      "fix": "Specific T24 fix with field names, commands or configuration changes"
    }
  ],
  "optimizations": [
    {
      "title": "Optimization title",
      "action": "Specific T24 action with field names",
      "expected_gain": "Estimated improvement e.g. 30% faster or 15min saved"
    }
  ],
  "cob_phases": [
    {
      "phase": "Phase name from logs",
      "status": "OK|WARNING|CRITICAL",
      "note": "What was observed for this phase"
    }
  ],
  "priority_actions": [
    "Specific action 1 with T24 field or command reference",
    "Specific action 2",
    "Specific action 3"
  ]
}`;

function safeParseJSON(text) {
  try { return JSON.parse(text); } catch {}
  const s = text.indexOf("{"); const e = text.lastIndexOf("}");
  if (s === -1 || e === -1) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch {}
  let partial = text.slice(s, e + 1);
  let opens = 0, inStr = false, escaped = false;
  for (let i = 0; i < partial.length; i++) {
    const c = partial[i];
    if (escaped) { escaped = false; continue; }
    if (c === "\\" && inStr) { escaped = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (!inStr) { if (c === "{" || c === "[") opens++; if (c === "}" || c === "]") opens--; }
  }
  try { return JSON.parse(partial + "]}}".slice(0, Math.max(0, opens))); } catch {}
  return null;
}

function computeScore(analysis) {
  if (!analysis) return 0;
  const riskMap = { LOW: 90, MEDIUM: 65, HIGH: 35, CRITICAL: 10 };
  let score = riskMap[analysis.duration_risk] || 50;
  (analysis.issues || []).forEach(i => { score -= { CRITICAL: 12, HIGH: 8, MEDIUM: 4, LOW: 1 }[i.severity] || 0; });
  return Math.max(0, Math.min(100, Math.round(score)));
}

function Gauge({ score }) {
  const color = score >= 75 ? THEME.green : score >= 45 ? THEME.accent : THEME.red;
  const label = score >= 75 ? "HEALTHY" : score >= 45 ? "DEGRADED" : "CRITICAL";
  const r = 54, cx = 70, cy = 70;
  const toRad = d => (d * Math.PI) / 180;
  const arcX = deg => cx + r * Math.cos(toRad(deg));
  const arcY = deg => cy + r * Math.sin(toRad(deg));
  const startAngle = -210, totalDeg = 240;
  const endDeg = startAngle + totalDeg * (score / 100);
  const largeArc = totalDeg * (score / 100) > 180 ? 1 : 0;
  const bgEndDeg = startAngle + totalDeg;
  return (
    <svg viewBox="0 0 140 110" style={{ width: "100%", maxWidth: 180 }}>
      <path d={`M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 1 1 ${arcX(bgEndDeg)} ${arcY(bgEndDeg)}`} fill="none" stroke={THEME.border} strokeWidth="10" strokeLinecap="round" />
      {score > 0 && <path d={`M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 ${largeArc} 1 ${arcX(endDeg)} ${arcY(endDeg)}`} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" />}
      <text x={cx} y={cy + 6} textAnchor="middle" fill={color} fontSize="22" fontWeight="700" fontFamily="monospace">{score}</text>
      <text x={cx} y={cy + 22} textAnchor="middle" fill={THEME.textMuted} fontSize="9" fontFamily="monospace" letterSpacing="1">{label}</text>
    </svg>
  );
}

function BarChart({ data }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const h = 28, gap = 10, labelW = 110, barW = 160;
  const total = data.length * (h + gap);
  return (
    <svg viewBox={`0 0 ${labelW + barW + 60} ${total}`} style={{ width: "100%", overflow: "visible" }}>
      {data.map((d, i) => {
        const y = i * (h + gap); const bw = Math.max(4, (d.value / max) * barW);
        return (
          <g key={i}>
            <text x={labelW - 8} y={y + h / 2 + 4} textAnchor="end" fill={THEME.textSecondary} fontSize="10" fontFamily="monospace">{d.label}</text>
            <rect x={labelW} y={y} width={barW} height={h} rx="4" fill={THEME.surfaceAlt} />
            <rect x={labelW} y={y} width={bw} height={h} rx="4" fill={d.color} opacity="0.85" />
            <text x={labelW + bw + 6} y={y + h / 2 + 4} fill={d.color} fontSize="11" fontWeight="700" fontFamily="monospace">{d.value}</text>
          </g>
        );
      })}
    </svg>
  );
}

function DonutChart({ segments, size = 110 }) {
  const cx = size / 2, cy = size / 2, r = size * 0.36, stroke = size * 0.14;
  const total = segments.reduce((s, d) => s + d.value, 0) || 1;
  let cumulative = 0;
  const toRad = d => (d * Math.PI) / 180;
  const slices = segments.map(seg => {
    const startDeg = (cumulative / total) * 360 - 90; cumulative += seg.value;
    const endDeg = (cumulative / total) * 360 - 90;
    const large = (endDeg - startDeg) > 180 ? 1 : 0;
    return { ...seg, x1: cx + r * Math.cos(toRad(startDeg)), y1: cy + r * Math.sin(toRad(startDeg)), x2: cx + r * Math.cos(toRad(endDeg)), y2: cy + r * Math.sin(toRad(endDeg)), large };
  });
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, flexShrink: 0 }}>
      {slices.map((s, i) => s.value === 0 ? null : s.value === total
        ? <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={stroke} opacity="0.85" />
        : <path key={i} d={`M ${s.x1} ${s.y1} A ${r} ${r} 0 ${s.large} 1 ${s.x2} ${s.y2}`} fill="none" stroke={s.color} strokeWidth={stroke} strokeLinecap="butt" opacity="0.85" />
      )}
      <text x={cx} y={cy + 4} textAnchor="middle" fill={THEME.textPrimary} fontSize="16" fontWeight="700" fontFamily="monospace">{total}</text>
      <text x={cx} y={cy + 16} textAnchor="middle" fill={THEME.textMuted} fontSize="8" fontFamily="monospace">TOTAL</text>
    </svg>
  );
}

function PhaseTimeline({ phases }) {
  const sc = s => ({ OK: THEME.green, WARNING: THEME.accent, CRITICAL: THEME.red }[s] || THEME.textMuted);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {phases.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: sc(p.status), flexShrink: 0, boxShadow: `0 0 8px ${sc(p.status)}88` }} />
          <div style={{ flex: 1, height: 30, borderRadius: 4, background: `${sc(p.status)}18`, border: `1px solid ${sc(p.status)}44`, display: "flex", alignItems: "center", padding: "0 12px", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: sc(p.status), minWidth: 64 }}>{p.status}</span>
            <span style={{ fontSize: 11, color: THEME.textPrimary }}>{p.phase}</span>
            <span style={{ fontSize: 10, color: THEME.textMuted, marginLeft: "auto" }}>{p.note || p.duration_note}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function T24COBAnalyser() {
  // Log files state — multiple files
  const [logFiles, setLogFiles] = useState([]); // [{name, content, size, type}]
  const [logError, setLogError] = useState("");
  const logInputRef = useRef(null);

  // Knowledge base state
  const [kbFiles, setKbFiles] = useState([]); // [{name, content, size}]
  const [kbDragging, setKbDragging] = useState(false);
  const kbInputRef = useRef(null);

  // Analysis state
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("input");

  // Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  // ── Read multiple uploaded log files ──
  function handleLogFiles(files) {
    setLogError("");
    Array.from(files).forEach(file => {
      if (logFiles.find(f => f.name === file.name)) return;
      const reader = new FileReader();
      reader.onload = e => {
        const content = e.target.result || "";
        // Detect log type from filename
        const n = file.name.toLowerCase();
        const type = n.includes("was") ? "WAS" : n.includes("edb") ? "EDB" : n.includes("mdb") ? "MDB"
          : n.includes("jms") ? "JMS" : n.includes("mq") ? "IBM MQ" : n.includes("database") || n.includes("db") ? "DATABASE"
          : n.includes("runtime") ? "Runtime" : "COB";
        setLogFiles(prev => [...prev, { name: file.name, content, size: file.size, type }]);
      };
      reader.readAsText(file);
    });
  }
  function removeLogFile(name) { setLogFiles(prev => prev.filter(f => f.name !== name)); }

  // ── Read knowledge base files (PDF text extraction via FileReader, txt direct) ──
  function handleKBFiles(files) {
    Array.from(files).forEach(file => {
      if (kbFiles.find(f => f.name === file.name)) return; // skip duplicates
      const reader = new FileReader();
      reader.onload = e => {
        let content = e.target.result;
        // For binary/PDF just grab readable ASCII text
        if (typeof content !== "string") content = "";
        // Limit per file to 2000 chars to stay within token budget
        const trimmed = content.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000);
        setKbFiles(prev => [...prev, { name: file.name, content: trimmed, size: file.size }]);
      };
      reader.readAsText(file);
    });
  }

  function removeKB(name) { setKbFiles(prev => prev.filter(f => f.name !== name)); }

  // ── Build knowledge base context string ──
  function buildKBContext() {
    if (kbFiles.length === 0) return "";
    return "\n\nKNOWLEDGE BASE (use this to improve analysis and fixes):\n" +
      kbFiles.map(f => `=== ${f.name} ===\n${f.content}`).join("\n\n");
  }

  // ── API proxy call ──
  async function callAPI(body) {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || data.error);
    return data;
  }

  // ── Analyse logs ──
  async function analyzeLogs() {
    if (logFiles.length === 0) return;
    setLoading(true); setError(""); setAnalysis(null);
    try {
      // Combine all log files, label each by filename, total 1500 chars
      const combined = logFiles.map(f => `=== ${f.name} (${f.type}) ===\n${f.content.slice(0, 1200)}`).join("\n\n").slice(0, 3500);
      const kbContext = buildKBContext();
      const data = await callAPI({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: SYSTEM_PROMPT + kbContext,
        messages: [{ role: "user", content: `Analyze these T24 log files:\n\n${combined}` }],
      });
      const raw = data.content?.map(b => b.text || "").join("") || "";
      const parsed = safeParseJSON(raw);
      if (!parsed) throw new Error("Could not parse response. Try a shorter log.");
      setAnalysis(parsed);
      setActiveTab("dashboard");
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  // ── Chat with full context ──
  async function sendChat() {
    if (!chatInput.trim()) return;
    const history = [...chatMessages, { role: "user", content: chatInput }];
    setChatMessages(history); setChatInput(""); setChatLoading(true);
    const kbContext = buildKBContext();
    const analysisContext = analysis ? [
      "CURRENT SESSION ANALYSIS:",
      `Files: ${logFiles.map(f => f.name).join(", ") || "sample"}`,
      `Summary: ${analysis.summary}`,
      `Risk: ${analysis.duration_risk} | Score: ${computeScore(analysis)}/100`,
      "Issues:", ...(analysis.issues || []).map(i => `  [${i.severity}] ${i.title} — Fix: ${i.fix}`),
      "Optimizations:", ...(analysis.optimizations || []).map(o => `  ${o.title}: ${o.action} (${o.expected_gain})`),
      `Priority Actions: ${(analysis.priority_actions || []).join(", ")}`,
      `Phases: ${(analysis.cob_phases || []).map(p => `${p.phase}=${p.status}`).join(", ")}`,
      "", "Answer referencing THIS specific analysis. Be direct and specific.",
    ].join("\n") : "No analysis run yet. Answer general T24 COB questions.";
    try {
      const data = await callAPI({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        system: `You are a T24 COB performance expert inside the T24 COB Analyser tool. Use specific T24 field names and fixes.\n\n${analysisContext}${kbContext}`,
        messages: history,
      });
      const text = data.content?.map(b => b.text || "").join("") || "Error — try again.";
      setChatMessages(prev => [...prev, { role: "assistant", content: text }]);
    } catch { setChatMessages(prev => [...prev, { role: "assistant", content: "Error — try again." }]); }
    finally { setChatLoading(false); }
  }

  const sev = s => ({ CRITICAL: THEME.red, HIGH: "#ff8c42", MEDIUM: THEME.accent, LOW: THEME.green }[s] || THEME.textSecondary);
  const sta = s => ({ OK: THEME.green, WARNING: THEME.accent, CRITICAL: THEME.red }[s] || THEME.textSecondary);
  const score = computeScore(analysis);

  const catCounts = {};
  (analysis?.issues || []).forEach(i => { catCounts[i.category] = (catCounts[i.category] || 0) + 1; });
  const catColors = { "Database Index": THEME.blue, "TSA Services": THEME.purple, "AA Architecture": "#ff8c42", "OFS Logging": THEME.green, "Batch Config": THEME.accent, "PGM File": "#ff6eb4", Other: THEME.textMuted };
  const barData = Object.entries(catCounts).map(([k, v]) => ({ label: k, value: v, color: catColors[k] || THEME.accent }));
  const sevCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  (analysis?.issues || []).forEach(i => { if (sevCounts[i.severity] !== undefined) sevCounts[i.severity]++; });
  const donutSegments = [
    { label: "CRITICAL", value: sevCounts.CRITICAL, color: THEME.red },
    { label: "HIGH", value: sevCounts.HIGH, color: "#ff8c42" },
    { label: "MEDIUM", value: sevCounts.MEDIUM, color: THEME.accent },
    { label: "LOW", value: sevCounts.LOW, color: THEME.green },
  ];
  const metricCards = analysis ? [
    { label: "COB HEALTH SCORE", value: `${score}/100`, color: score >= 75 ? THEME.green : score >= 45 ? THEME.accent : THEME.red },
    { label: "RISK LEVEL", value: analysis.duration_risk || "—", color: sev(analysis.duration_risk) },
    { label: "ISSUES FOUND", value: analysis.issues?.length || 0, color: THEME.blue },
    { label: "OPTIMIZATIONS", value: analysis.optimizations?.length || 0, color: THEME.purple },
  ] : [];

  const TABS = [
    ["input", "📋 LOG INPUT", false],
    ["kb", "📚 KNOWLEDGE BASE", false],
    ["dashboard", "📊 DASHBOARD", !analysis],
    ["analysis", "🔬 ANALYSIS", !analysis],
    ["chat", "💬 EXPERT CHAT", false],
  ];

  return (
    <div style={{ minHeight: "100vh", background: THEME.bg, color: THEME.textPrimary, fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#2a3545;border-radius:2px}
        textarea,input,select{outline:none;}
        .qbtn:hover{background:rgba(240,165,0,0.1)!important;border-color:#f0a500!important;}
        .abtn:hover:not(:disabled){background:#d49200!important;transform:translateY(-1px);}
        .dz:hover{border-color:#f0a500!important;background:rgba(240,165,0,0.05)!important;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes countUp{from{opacity:0;transform:scale(0.8)}to{opacity:1;transform:scale(1)}}
        .fade{animation:fadeIn 0.3s ease forwards}
        .countup{animation:countUp 0.5s ease forwards}
        .spin{animation:spin 0.8s linear infinite}
        .dot{animation:pulse 1.2s ease infinite}
        .card-hover:hover{border-color:#2a3545!important;transform:translateY(-1px);}
        .card-hover{transition:all 0.2s;}
      `}</style>

      {/* HEADER */}
      <div style={{ background: THEME.surface, borderBottom: `1px solid ${THEME.border}`, padding: "16px 24px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 38, height: 38, borderRadius: 8, background: `${THEME.accent}22`, border: `1px solid ${THEME.accent}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>⚡</div>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 17, fontWeight: 800, letterSpacing: "-0.3px" }}>
            T24 <span style={{ color: THEME.accent }}>OPERATIONAL AI TOOL</span> BANKALFALAH
          </div>
          <div style={{ fontSize: 10, color: THEME.textMuted, letterSpacing: "2px", marginTop: 1 }}>TEMENOS CORE BANKING · BANKALFALAH · EOD INTELLIGENCE</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {kbFiles.length > 0 && (
            <div style={{ padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: `${THEME.purple}18`, border: `1px solid ${THEME.purple}44`, color: THEME.purple }}>
              📚 {kbFiles.length} KB FILE{kbFiles.length > 1 ? "S" : ""}
            </div>
          )}
          {analysis && <>
            <div style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${sev(analysis.duration_risk)}18`, border: `1px solid ${sev(analysis.duration_risk)}44`, color: sev(analysis.duration_risk) }}>{analysis.duration_risk} RISK</div>
            <div style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${score >= 75 ? THEME.green : score >= 45 ? THEME.accent : THEME.red}18`, border: `1px solid ${score >= 75 ? THEME.green : score >= 45 ? THEME.accent : THEME.red}44`, color: score >= 75 ? THEME.green : score >= 45 ? THEME.accent : THEME.red }}>SCORE {score}/100</div>
          </>}
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", background: THEME.surface, borderBottom: `1px solid ${THEME.border}`, padding: "0 24px", overflowX: "auto" }}>
        {TABS.map(([id, label, disabled]) => (
          <button key={id} onClick={() => !disabled && setActiveTab(id)} style={{
            padding: "10px 16px", border: "none", background: "transparent", whiteSpace: "nowrap",
            cursor: disabled ? "default" : "pointer", fontSize: 10, fontWeight: 700, letterSpacing: "1.5px",
            fontFamily: "'JetBrains Mono',monospace",
            color: activeTab === id ? THEME.accent : disabled ? THEME.textMuted : THEME.textSecondary,
            borderBottom: activeTab === id ? `2px solid ${THEME.accent}` : "2px solid transparent",
            marginBottom: -1, opacity: disabled ? 0.35 : 1, transition: "all 0.2s"
          }}>{label}{id === "kb" && kbFiles.length > 0 ? ` (${kbFiles.length})` : ""}</button>
        ))}
      </div>

      <div style={{ padding: "20px 24px", maxWidth: 1050, margin: "0 auto" }}>

        {/* ── LOG INPUT TAB ── */}
        {activeTab === "input" && (
          <div className="fade">
            {/* Multi-file drop zone */}
            <div className="dz"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleLogFiles(e.dataTransfer.files); }}
              onClick={() => logInputRef.current?.click()}
              style={{
                border: `2px dashed ${logFiles.length > 0 ? THEME.green : THEME.border}`, borderRadius: 10,
                padding: "28px 24px", textAlign: "center", cursor: "pointer",
                background: logFiles.length > 0 ? `${THEME.green}06` : THEME.surfaceAlt,
                transition: "all 0.2s", marginBottom: 14
              }}>
              <input ref={logInputRef} type="file" accept=".log,.txt,.out,.err,.trace" multiple style={{ display: "none" }}
                onChange={e => handleLogFiles(e.target.files)} />
              <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textSecondary, marginBottom: 5 }}>
                Drop all your log files here or click to browse
              </div>
              <div style={{ fontSize: 10, color: THEME.textMuted, marginBottom: 10 }}>
                Multiple files supported · .log .txt .out .err .trace
              </div>
              <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                {["WAS", "EDB.log", "MDB.log", "JMS", "IBM MQ", "DATABASE.log", "Runtime.log", "COB"].map(t => (
                  <span key={t} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.textMuted }}>{t}</span>
                ))}
              </div>
            </div>

            {/* Uploaded log files list */}
            {logFiles.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: THEME.textMuted, letterSpacing: "2px", marginBottom: 8, fontWeight: 700 }}>
                  UPLOADED LOG FILES — {logFiles.length} FILE{logFiles.length > 1 ? "S" : ""}
                  {kbFiles.length > 0 && <span style={{ color: THEME.purple, marginLeft: 12 }}>· 📚 {kbFiles.length} KB FILE{kbFiles.length > 1 ? "S" : ""} ACTIVE</span>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
                  {logFiles.map((f, i) => (
                    <div key={i} style={{ padding: "10px 13px", borderRadius: 8, background: THEME.surfaceAlt, border: `1px solid ${THEME.green}33`, display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ fontSize: 18, flexShrink: 0 }}>📄</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: THEME.green, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                        <div style={{ fontSize: 10, color: THEME.textMuted, marginTop: 2 }}>
                          {(f.size / 1024).toFixed(1)} KB · {f.content.split("\n").length} lines · <span style={{ color: THEME.accent }}>{f.type}</span>
                        </div>
                        <div style={{ fontSize: 10, color: THEME.textSecondary, marginTop: 4, lineHeight: 1.5, whiteSpace: "pre-wrap", overflow: "hidden", maxHeight: 36 }}>
                          {f.content.split("\n").slice(0, 2).join("\n")}
                        </div>
                      </div>
                      <button onClick={() => removeLogFile(f.name)} style={{ padding: "3px 7px", background: `${THEME.red}15`, border: `1px solid ${THEME.red}33`, borderRadius: 4, color: THEME.red, fontSize: 10, cursor: "pointer", flexShrink: 0, fontFamily: "'JetBrains Mono',monospace" }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(error || logError) && (
              <div style={{ marginBottom: 10, padding: "10px 14px", borderRadius: 6, background: `${THEME.red}15`, border: `1px solid ${THEME.red}44`, color: THEME.red, fontSize: 12 }}>
                ⚠ {error || logError}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button className="abtn" onClick={analyzeLogs} disabled={loading || logFiles.length === 0} style={{
                flex: 1, padding: "13px", background: loading || logFiles.length === 0 ? THEME.surfaceAlt : THEME.accent,
                border: `1px solid ${loading || logFiles.length === 0 ? THEME.border : THEME.accent}`, borderRadius: 8,
                color: loading || logFiles.length === 0 ? THEME.textMuted : "#000", fontSize: 11, fontWeight: 700,
                cursor: loading || logFiles.length === 0 ? "not-allowed" : "pointer", letterSpacing: "1.5px",
                transition: "all 0.2s", fontFamily: "'JetBrains Mono',monospace",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8
              }}>
                {loading
                  ? <><div className="spin" style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid #555", borderTopColor: THEME.accent }} />ANALYSING {logFiles.length} LOG FILE{logFiles.length > 1 ? "S" : ""}...</>
                  : `⚡ ANALYSE ${logFiles.length > 0 ? logFiles.length + " LOG FILE" + (logFiles.length > 1 ? "S" : "") : "LOGS"}`}
              </button>
              {logFiles.length > 0 && (
                <button onClick={() => { setLogFiles([]); setAnalysis(null); setError(""); setLogError(""); }} style={{ padding: "13px 16px", background: "transparent", border: `1px solid ${THEME.border}`, borderRadius: 8, color: THEME.textMuted, fontSize: 11, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace" }}>
                  CLEAR ALL
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── KNOWLEDGE BASE TAB ── */}
        {activeTab === "kb" && (
          <div className="fade">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 18 }}>
              <div>
                <div style={{ fontSize: 10, color: THEME.textMuted, letterSpacing: "2px", marginBottom: 4, fontWeight: 700 }}>KNOWLEDGE BASE UPLOAD</div>
                <div style={{ fontSize: 11, color: THEME.textSecondary, marginBottom: 14, lineHeight: 1.6 }}>
                  Upload T24 guides, manuals, or best-practice documents. These will be injected into every AI analysis and chat response to give context-aware, documentation-backed answers.
                </div>

                {/* KB Drop Zone */}
                <div className="dz"
                  onDragOver={e => { e.preventDefault(); setKbDragging(true); }}
                  onDragLeave={() => setKbDragging(false)}
                  onDrop={e => { e.preventDefault(); setKbDragging(false); handleKBFiles(e.dataTransfer.files); }}
                  onClick={() => kbInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${kbDragging ? THEME.purple : THEME.border}`, borderRadius: 10,
                    padding: "36px 24px", textAlign: "center", cursor: "pointer",
                    background: kbDragging ? `${THEME.purple}08` : THEME.surfaceAlt,
                    transition: "all 0.2s", marginBottom: 16
                  }}>
                  <input ref={kbInputRef} type="file" accept=".txt,.pdf,.md,.log,.csv" multiple style={{ display: "none" }}
                    onChange={e => handleKBFiles(e.target.files)} />
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📚</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: THEME.textSecondary, marginBottom: 6 }}>
                    Drop knowledge files here or click to browse
                  </div>
                  <div style={{ fontSize: 10, color: THEME.textMuted, marginBottom: 10 }}>
                    Supports: .txt .pdf .md .log .csv · Multiple files allowed
                  </div>
                  <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                    {["T24 COB Guide", "Performance Manual", "AA Architecture", "Index Best Practices", "OFS Reference"].map(t => (
                      <span key={t} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.textMuted }}>{t}</span>
                    ))}
                  </div>
                </div>

                {/* Uploaded KB files list */}
                {kbFiles.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: THEME.textMuted, letterSpacing: "2px", marginBottom: 10, fontWeight: 700 }}>
                      LOADED FILES — {kbFiles.length} DOCUMENT{kbFiles.length > 1 ? "S" : ""}
                    </div>
                    {kbFiles.map((f, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 8, background: THEME.surfaceAlt, border: `1px solid ${THEME.border}`, marginBottom: 8 }}>
                        <div style={{ fontSize: 20, flexShrink: 0 }}>
                          {f.name.endsWith(".pdf") ? "📄" : f.name.endsWith(".md") ? "📝" : "📃"}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: THEME.textPrimary, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                          <div style={{ fontSize: 10, color: THEME.textMuted, marginBottom: 6 }}>
                            {(f.size / 1024).toFixed(1)} KB · {f.content.length} chars extracted · injected into AI context
                          </div>
                          <div style={{ fontSize: 10, color: THEME.textSecondary, lineHeight: 1.5, background: THEME.bg, padding: "6px 8px", borderRadius: 4, border: `1px solid ${THEME.border}`, whiteSpace: "pre-wrap", maxHeight: 60, overflow: "hidden" }}>
                            {f.content.slice(0, 200)}...
                          </div>
                        </div>
                        <button onClick={() => removeKB(f.name)} style={{ padding: "4px 8px", background: `${THEME.red}15`, border: `1px solid ${THEME.red}33`, borderRadius: 4, color: THEME.red, fontSize: 10, cursor: "pointer", flexShrink: 0, fontFamily: "'JetBrains Mono',monospace" }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {kbFiles.length === 0 && (
                  <div style={{ padding: 14, borderRadius: 8, background: `${THEME.accent}08`, border: `1px solid ${THEME.accent}22` }}>
                    <div style={{ fontSize: 10, color: THEME.accent, fontWeight: 700, marginBottom: 8, letterSpacing: "1px" }}>HOW IT WORKS</div>
                    {[
                      "Upload your T24 documentation, guides or manuals",
                      "Text is extracted and stored in browser memory",
                      "Every AI analysis call includes your KB as context",
                      "Expert Chat answers are grounded in your documents",
                      "Remove files anytime — changes apply immediately",
                    ].map((s, i) => (
                      <div key={i} style={{ fontSize: 11, color: THEME.textSecondary, marginBottom: 5, display: "flex", gap: 8 }}>
                        <span style={{ color: THEME.accent, fontWeight: 700 }}>{i + 1}.</span>{s}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right info panel */}
              <div>
                <div style={{ fontSize: 10, color: THEME.textMuted, letterSpacing: "2px", marginBottom: 8, fontWeight: 700 }}>RECOMMENDED DOCS</div>
                {[
                  { icon: "📘", title: "T24 COB Operations Guide", desc: "Batch sequencing, error handling" },
                  { icon: "📗", title: "Temenos AA Architecture", desc: "EOD/SOD process documentation" },
                  { icon: "📙", title: "T24 Index Strategy Guide", desc: "STANDARD.SELECTION best practices" },
                  { icon: "📕", title: "OFS Performance Manual", desc: "Logging and source configuration" },
                  { icon: "📒", title: "TSA.SERVICES Reference", desc: "Agent allocation and tuning" },
                  { icon: "📓", title: "Database Tuning Guide", desc: "Oracle/SQL Server for T24" },
                ].map((d, i) => (
                  <div key={i} style={{ padding: "10px 12px", borderRadius: 8, background: THEME.surfaceAlt, border: `1px solid ${THEME.border}`, marginBottom: 8, display: "flex", gap: 10 }}>
                    <span style={{ fontSize: 16 }}>{d.icon}</span>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: THEME.textPrimary, marginBottom: 2 }}>{d.title}</div>
                      <div style={{ fontSize: 10, color: THEME.textMuted }}>{d.desc}</div>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: `${THEME.blue}0a`, border: `1px solid ${THEME.blue}33` }}>
                  <div style={{ fontSize: 10, color: THEME.blue, fontWeight: 700, marginBottom: 4 }}>💡 TIP</div>
                  <div style={{ fontSize: 10, color: THEME.textMuted, lineHeight: 1.6 }}>
                    PDF content is extracted as plain text. For best results, use text-based PDFs rather than scanned images.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── DASHBOARD TAB ── */}
        {activeTab === "dashboard" && analysis && (
          <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {metricCards.map((m, i) => (
                <div key={i} className="card-hover" style={{ padding: "14px 16px", borderRadius: 10, background: THEME.surfaceAlt, border: `1px solid ${THEME.border}` }}>
                  <div style={{ fontSize: 9, color: THEME.textMuted, letterSpacing: "1.5px", marginBottom: 8, fontWeight: 700 }}>{m.label}</div>
                  <div className="countup" style={{ fontSize: 22, fontWeight: 700, color: m.color, fontFamily: "'Syne',sans-serif" }}>{m.value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 1fr", gap: 14 }}>
              <div style={{ padding: "16px 14px", borderRadius: 10, background: THEME.surfaceAlt, border: `1px solid ${THEME.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: 9, color: THEME.textMuted, letterSpacing: "1.5px", marginBottom: 10, fontWeight: 700, alignSelf: "flex-start" }}>COB HEALTH</div>
                <Gauge score={score} />
                <div style={{ fontSize: 10, color: THEME.textMuted, marginTop: 6, textAlign: "center", lineHeight: 1.5 }}>
                  {score >= 75 ? "COB running efficiently" : score >= 45 ? "Optimisation needed" : "Immediate action required"}
                </div>
              </div>
              <div style={{ padding: "16px 14px", borderRadius: 10, background: THEME.surfaceAlt, border: `1px solid ${THEME.border}` }}>
                <div style={{ fontSize: 9, color: THEME.textMuted, letterSpacing: "1.5px", marginBottom: 12, fontWeight: 700 }}>ISSUE SEVERITY</div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <DonutChart segments={donutSegments} size={100} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {donutSegments.map(s => (
                      <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 10, color: THEME.textSecondary, minWidth: 60 }}>{s.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: s.value > 0 ? s.color : THEME.textMuted }}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ padding: "16px 14px", borderRadius: 10, background: THEME.surfaceAlt, border: `1px solid ${THEME.border}` }}>
                <div style={{ fontSize: 9, color: THEME.textMuted, letterSpacing: "1.5px", marginBottom: 12, fontWeight: 700 }}>ISSUES BY CATEGORY</div>
                {barData.length > 0 ? <BarChart data={barData} /> : <div style={{ fontSize: 11, color: THEME.textMuted, paddingTop: 20 }}>No category data</div>}
              </div>
            </div>
            {analysis.cob_phases?.length > 0 && (
              <div style={{ padding: "16px 18px", borderRadius: 10, background: THEME.surfaceAlt, border: `1px solid ${THEME.border}` }}>
                <div style={{ fontSize: 9, color: THEME.textMuted, letterSpacing: "1.5px", marginBottom: 12, fontWeight: 700 }}>COB PHASE TIMELINE</div>
                <PhaseTimeline phases={analysis.cob_phases} />
              </div>
            )}
            {analysis.optimizations?.length > 0 && (
              <div style={{ padding: "16px 18px", borderRadius: 10, background: THEME.surfaceAlt, border: `1px solid ${THEME.border}` }}>
                <div style={{ fontSize: 9, color: THEME.textMuted, letterSpacing: "1.5px", marginBottom: 12, fontWeight: 700 }}>EXPECTED GAINS FROM OPTIMISATIONS</div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {analysis.optimizations.map((o, i) => (
                    <div key={i} style={{ flex: "1 1 200px", padding: "12px 14px", borderRadius: 8, background: THEME.bg, border: `1px solid ${THEME.green}33` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: THEME.textPrimary }}>{o.title}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: THEME.green, background: `${THEME.green}18`, border: `1px solid ${THEME.green}33`, padding: "2px 8px", borderRadius: 4 }}>{o.expected_gain}</span>
                      </div>
                      <div style={{ fontSize: 10, color: THEME.textSecondary }}>{o.action}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setActiveTab("analysis")} style={{ flex: 1, padding: "10px", background: "transparent", border: `1px dashed ${THEME.blue}55`, borderRadius: 8, color: THEME.blue, fontSize: 10, cursor: "pointer", letterSpacing: "1px", fontFamily: "'JetBrains Mono',monospace" }}>🔬 VIEW FULL ANALYSIS →</button>
              <button onClick={() => setActiveTab("chat")} style={{ flex: 1, padding: "10px", background: "transparent", border: `1px dashed ${THEME.accent}55`, borderRadius: 8, color: THEME.accent, fontSize: 10, cursor: "pointer", letterSpacing: "1px", fontFamily: "'JetBrains Mono',monospace" }}>💬 ASK EXPERT →</button>
            </div>
          </div>
        )}

        {/* ── ANALYSIS TAB ── */}
        {activeTab === "analysis" && analysis && (
          <div className="fade" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ padding: 15, borderRadius: 10, background: THEME.surfaceAlt, border: `1px solid ${THEME.borderBright}`, display: "flex", gap: 12 }}>
              <div style={{ fontSize: 24 }}>🔬</div>
              <div>
                <div style={{ fontSize: 10, color: THEME.textMuted, letterSpacing: "2px", fontWeight: 700, marginBottom: 4 }}>EXECUTIVE SUMMARY · {logFiles.length > 0 ? logFiles.map(f => f.name).join(", ") : "Sample Log"}</div>
                <div style={{ fontSize: 13, lineHeight: 1.7 }}>{analysis.summary}</div>
              </div>
            </div>
            {analysis.cob_phases?.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: THEME.textMuted, letterSpacing: "2px", fontWeight: 700, marginBottom: 8 }}>COB PHASE STATUS</div>
                <div style={{ display: "flex", gap: 10 }}>
                  {analysis.cob_phases.map((p, i) => (
                    <div key={i} style={{ flex: 1, padding: "11px 13px", borderRadius: 8, background: THEME.surfaceAlt, border: `1px solid ${sta(p.status)}44` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: sta(p.status), boxShadow: `0 0 5px ${sta(p.status)}` }} />
                        <span style={{ fontSize: 10, color: sta(p.status), fontWeight: 700 }}>{p.status}</span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{p.phase}</div>
                      <div style={{ fontSize: 10, color: THEME.textMuted }}>{p.note || p.duration_note}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {analysis.issues?.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: THEME.textMuted, letterSpacing: "2px", fontWeight: 700, marginBottom: 8 }}>DETECTED ISSUES</div>
                {analysis.issues.map((issue, i) => (
                  <div key={i} className="card-hover" style={{ borderRadius: 10, background: THEME.surfaceAlt, border: `1px solid ${sev(issue.severity)}33`, marginBottom: 10, overflow: "hidden" }}>
                    <div style={{ padding: "9px 13px", borderBottom: `1px solid ${THEME.border}`, display: "flex", gap: 7, alignItems: "center" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${sev(issue.severity)}18`, border: `1px solid ${sev(issue.severity)}44`, color: sev(issue.severity) }}>{issue.severity}</span>
                      <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, background: THEME.bg, border: `1px solid ${THEME.border}`, color: THEME.textMuted }}>{issue.category}</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{issue.title}</span>
                    </div>
                    <div style={{ padding: "11px 13px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      <div>
                        <div style={{ fontSize: 10, color: THEME.textMuted, letterSpacing: "1px", marginBottom: 4, fontWeight: 700 }}>DETAIL</div>
                        <div style={{ fontSize: 12, color: THEME.textSecondary, lineHeight: 1.6 }}>{issue.detail}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: THEME.textMuted, letterSpacing: "1px", marginBottom: 4, fontWeight: 700 }}>FIX</div>
                        <div style={{ fontSize: 12, color: THEME.green, lineHeight: 1.6 }}>{issue.fix}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {analysis.optimizations?.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: THEME.textMuted, letterSpacing: "2px", fontWeight: 700, marginBottom: 8 }}>OPTIMIZATIONS</div>
                  {analysis.optimizations.map((o, i) => (
                    <div key={i} style={{ padding: "11px 13px", borderRadius: 8, background: THEME.surfaceAlt, border: `1px solid ${THEME.border}`, marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{o.title}</span>
                        <span style={{ fontSize: 10, color: THEME.green, background: `${THEME.green}18`, border: `1px solid ${THEME.green}33`, padding: "2px 8px", borderRadius: 4 }}>{o.expected_gain}</span>
                      </div>
                      <div style={{ fontSize: 11, color: THEME.textSecondary }}>{o.action}</div>
                    </div>
                  ))}
                </div>
              )}
              {analysis.priority_actions?.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: THEME.textMuted, letterSpacing: "2px", fontWeight: 700, marginBottom: 8 }}>PRIORITY ACTIONS</div>
                  {analysis.priority_actions.map((a, i) => (
                    <div key={i} style={{ padding: "11px 13px", borderRadius: 8, background: THEME.surfaceAlt, border: `1px solid ${THEME.border}`, marginBottom: 8, display: "flex", gap: 10 }}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: `${THEME.accent}22`, border: `1px solid ${THEME.accent}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: THEME.accent, flexShrink: 0 }}>{i + 1}</div>
                      <div style={{ fontSize: 12, color: THEME.textSecondary, lineHeight: 1.5 }}>{a}</div>
                    </div>
                  ))}
                  <button onClick={() => setActiveTab("chat")} style={{ width: "100%", padding: 9, background: "transparent", border: `1px dashed ${THEME.accent}55`, borderRadius: 8, color: THEME.accent, fontSize: 10, cursor: "pointer", letterSpacing: "1px", fontFamily: "'JetBrains Mono',monospace" }}>💬 ASK EXPERT ABOUT THESE →</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CHAT TAB ── */}
        {activeTab === "chat" && (
          <div className="fade">
            {kbFiles.length > 0 && (
              <div style={{ marginBottom: 12, padding: "8px 14px", borderRadius: 8, background: `${THEME.purple}0a`, border: `1px solid ${THEME.purple}33`, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 14 }}>📚</span>
                <span style={{ fontSize: 10, color: THEME.purple }}>Knowledge base active — {kbFiles.length} document{kbFiles.length > 1 ? "s" : ""} ({kbFiles.map(f => f.name).join(", ")}) are informing responses</span>
              </div>
            )}
            <div style={{ height: 390, overflowY: "auto", background: THEME.surfaceAlt, borderRadius: 10, border: `1px solid ${THEME.border}`, padding: 13, marginBottom: 11 }}>
              {chatMessages.length === 0 && (
                <div style={{ padding: "28px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 26, marginBottom: 10 }}>🏦</div>
                  <div style={{ fontSize: 12, color: THEME.textSecondary, marginBottom: 14 }}>
                    {analysis ? `Analysis loaded — ask about your log findings, fixes, or optimizations.` : "Ask anything about T24 COB performance, AA Architecture, OFS tuning, indexes, or batch optimization."}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center" }}>
                    {["Give me fixes for my current logs", "Explain the critical issues found", "How to fix IC.COB timeouts?", "Best F.ACCOUNT index strategy?", "Tune TSA.SERVICES agents", "Reduce OFS logging overhead"].map(q => (
                      <button key={q} className="qbtn" onClick={() => setChatInput(q)} style={{ padding: "6px 10px", background: THEME.bg, border: `1px solid ${THEME.border}`, borderRadius: 6, color: THEME.textSecondary, fontSize: 10, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace", transition: "all 0.2s" }}>{q}</button>
                    ))}
                  </div>
                </div>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} style={{ marginBottom: 13, display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "80%", padding: "9px 12px", borderRadius: 8, background: m.role === "user" ? `${THEME.accent}18` : THEME.bg, border: `1px solid ${m.role === "user" ? THEME.accent + "44" : THEME.border}`, fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                    {m.role === "assistant" && <div style={{ fontSize: 9, color: THEME.accent, fontWeight: 700, marginBottom: 4, letterSpacing: "1px" }}>T24 EXPERT</div>}
                    {m.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div style={{ display: "flex", gap: 5, padding: "7px 11px" }}>
                  {[0, 1, 2].map(i => <div key={i} className="dot" style={{ width: 6, height: 6, borderRadius: "50%", background: THEME.accent, animationDelay: `${i * 0.2}s` }} />)}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendChat()}
                placeholder="Ask about your log analysis, T24 COB, AA, OFS, indexes..."
                style={{ flex: 1, padding: "11px 13px", background: THEME.surfaceAlt, border: `1px solid ${THEME.border}`, borderRadius: 8, color: THEME.textPrimary, fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }} />
              <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()} style={{ padding: "11px 17px", background: chatLoading || !chatInput.trim() ? THEME.surfaceAlt : THEME.accent, border: `1px solid ${chatLoading || !chatInput.trim() ? THEME.border : THEME.accent}`, borderRadius: 8, color: chatLoading || !chatInput.trim() ? THEME.textMuted : "#000", fontSize: 11, fontWeight: 700, cursor: chatLoading || !chatInput.trim() ? "not-allowed" : "pointer", letterSpacing: "1px", fontFamily: "'JetBrains Mono',monospace" }}>SEND</button>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div style={{ borderTop: `1px solid ${THEME.border}`, padding: "9px 24px", display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontSize: 10, color: THEME.textMuted, letterSpacing: "1px" }}>T24 OPERATIONAL AI TOOL · BANKALFALAH · POWERED BY CLAUDE AI</div>
        <div style={{ display: "flex", gap: 12, fontSize: 10, color: THEME.textMuted }}>
          {["T24 R22+", "TAFC/TAFJ", "AA ARCH", "OFS/BIAN"].map(t => <span key={t}>{t}</span>)}
        </div>
      </div>
    </div>
  );
}