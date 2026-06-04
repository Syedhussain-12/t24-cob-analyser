import { useState, useRef, useEffect } from "react";

const THEME = {
  bg: "#0a0c10", surface: "#0f1318", surfaceAlt: "#141921",
  border: "#1e2530", borderBright: "#2a3545",
  accent: "#f0a500", green: "#00e5a0", red: "#ff4d6d",
  blue: "#4da6ff", purple: "#b388ff",
  textPrimary: "#e8edf3", textSecondary: "#7a8fa8", textMuted: "#4a5a6a",
};

const QUICK_LOGS = {
  "COB Timeout": `[22:14:33] COB.START
[22:14:35] TSA.SERVICES agents: 48 started
[22:15:01] AA.EOD.PROCESS starting
[22:18:44] WARNING: F.ACCOUNT full table scan 2.3M records
[22:19:02] IC.COB batch started
[22:24:55] ERROR: IC.COB timeout 356s retrying
[22:25:01] OFS.SOURCE verbose logging ON
[22:31:17] RE.BUILD.SLC.WORK 890234 records
[22:45:00] WARNING: COB exceeded 30min threshold
[23:02:18] AA.SOD.PROCESS 12443 reverse-replay activities
[23:14:55] EOD.RE.PROFIT.LOSS started
[00:22:10] COB.END duration 128 minutes`,
  "Index Issues": `[23:00:00] COB START
[23:00:05] STANDARD.SELECTION EB.CUSTOMER.STATUS no index
[23:00:08] F.CUSTOMER full table scan 4.1M rows
[23:00:45] WARNING: missing index ACCOUNT.OFFICER field
[23:01:33] F.ACCT.ENTLMT outdated STANDARD.SELECTION
[23:03:12] IC.COB query optimizer fallback
[23:08:00] F.ACCOUNT SECTOR scan 2.8M rows no index
[23:22:45] EB.EOD.REPORT.PRINT long query 840s
[00:45:00] COB END duration 105 minutes`,
  "AA Data Quality": `[22:00:00] AA.EOD.PROCESS start
[22:00:12] WARNING: 3241 unauthorized AA records pre-COB
[22:05:44] PENDING.CLOSURE count 18922
[22:06:01] ERROR: expired arrangements not moved to PENDING.CLOSURE
[22:12:33] AA.SOD.PROCESS high reverse-replay load
[22:15:00] Product tracker NOT executed post publish
[22:18:44] AA.EOD.PROCESS stalled data quality failed
[22:45:00] WARNING: 924 PENDING.CLOSE still active
[23:30:00] AA.EOD.PROCESS retry 3 of 5
[01:15:00] COB END AA issues caused 75min delay`,
};

const SYSTEM_PROMPT = `T24 COB expert. Output ONLY a raw JSON object. No markdown, no backticks, no prose before or after. Keep every string under 55 characters. Return exactly 2 issues, 2 optimizations, 2 cob_phases, 2 priority_actions.

Format:
{"summary":"brief summary under 55 chars","duration_risk":"HIGH","issues":[{"category":"Database Index","severity":"HIGH","title":"short title","detail":"short detail","fix":"short fix"},{"category":"TSA Services","severity":"MEDIUM","title":"short title","detail":"short detail","fix":"short fix"}],"optimizations":[{"title":"short","action":"short action","expected_gain":"X% faster"},{"title":"short","action":"short action","expected_gain":"Y min saved"}],"cob_phases":[{"phase":"IC.COB","status":"CRITICAL","note":"timed out"},{"phase":"AA.EOD","status":"WARNING","note":"slow"}],"priority_actions":["action one","action two"]}`;

function safeParseJSON(text) {
  try { return JSON.parse(text); } catch {}
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch {}
  let partial = text.slice(s, e + 1);
  let opens = 0, inStr = false, escaped = false;
  for (let i = 0; i < partial.length; i++) {
    const c = partial[i];
    if (escaped) { escaped = false; continue; }
    if (c === "\\" && inStr) { escaped = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (!inStr) {
      if (c === "{" || c === "[") opens++;
      if (c === "}" || c === "]") opens--;
    }
  }
  try { return JSON.parse(partial + "]}}".slice(0, Math.max(0, opens))); } catch {}
  return null;
}

function computeScore(analysis) {
  if (!analysis) return 0;
  const riskMap = { LOW: 90, MEDIUM: 65, HIGH: 35, CRITICAL: 10 };
  let score = riskMap[analysis.duration_risk] || 50;
  (analysis.issues || []).forEach(i => {
    score -= { CRITICAL: 12, HIGH: 8, MEDIUM: 4, LOW: 1 }[i.severity] || 0;
  });
  return Math.max(0, Math.min(100, Math.round(score)));
}

function Gauge({ score }) {
  const color = score >= 75 ? THEME.green : score >= 45 ? THEME.accent : THEME.red;
  const label = score >= 75 ? "HEALTHY" : score >= 45 ? "DEGRADED" : "CRITICAL";
  const r = 54, cx = 70, cy = 70;
  const startAngle = -210, totalDeg = 240;
  const pct = score / 100;
  const toRad = d => (d * Math.PI) / 180;
  const arcX = deg => cx + r * Math.cos(toRad(deg));
  const arcY = deg => cy + r * Math.sin(toRad(deg));
  const endDeg = startAngle + totalDeg * pct;
  const largeArc = totalDeg * pct > 180 ? 1 : 0;
  const bgEndDeg = startAngle + totalDeg;
  return (
    <svg viewBox="0 0 140 110" style={{ width: "100%", maxWidth: 180 }}>
      <path d={`M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 1 1 ${arcX(bgEndDeg)} ${arcY(bgEndDeg)}`}
        fill="none" stroke={THEME.border} strokeWidth="10" strokeLinecap="round" />
      {score > 0 && (
        <path d={`M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 ${largeArc} 1 ${arcX(endDeg)} ${arcY(endDeg)}`}
          fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" />
      )}
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
        const y = i * (h + gap);
        const bw = Math.max(4, (d.value / max) * barW);
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
    const startDeg = (cumulative / total) * 360 - 90;
    cumulative += seg.value;
    const endDeg = (cumulative / total) * 360 - 90;
    const large = (endDeg - startDeg) > 180 ? 1 : 0;
    const x1 = cx + r * Math.cos(toRad(startDeg));
    const y1 = cy + r * Math.sin(toRad(startDeg));
    const x2 = cx + r * Math.cos(toRad(endDeg));
    const y2 = cy + r * Math.sin(toRad(endDeg));
    return { ...seg, x1, y1, x2, y2, large };
  });
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, flexShrink: 0 }}>
      {total === 0
        ? <circle cx={cx} cy={cy} r={r} fill="none" stroke={THEME.border} strokeWidth={stroke} />
        : slices.map((s, i) => (
          s.value === 0 ? null :
          s.value === total
            ? <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={stroke} opacity="0.85" />
            : <path key={i} d={`M ${s.x1} ${s.y1} A ${r} ${r} 0 ${s.large} 1 ${s.x2} ${s.y2}`}
                fill="none" stroke={s.color} strokeWidth={stroke} strokeLinecap="butt" opacity="0.85" />
        ))}
      <text x={cx} y={cy + 4} textAnchor="middle" fill={THEME.textPrimary} fontSize="16" fontWeight="700" fontFamily="monospace">{total}</text>
      <text x={cx} y={cy + 16} textAnchor="middle" fill={THEME.textMuted} fontSize="8" fontFamily="monospace">TOTAL</text>
    </svg>
  );
}

function PhaseTimeline({ phases }) {
  const statusColor = s => ({ OK: THEME.green, WARNING: THEME.accent, CRITICAL: THEME.red }[s] || THEME.textMuted);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {phases.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: statusColor(p.status), flexShrink: 0, boxShadow: `0 0 8px ${statusColor(p.status)}88` }} />
          <div style={{ flex: 1, height: 30, borderRadius: 4, background: `${statusColor(p.status)}18`, border: `1px solid ${statusColor(p.status)}44`, display: "flex", alignItems: "center", padding: "0 12px", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(p.status), minWidth: 64 }}>{p.status}</span>
            <span style={{ fontSize: 11, color: THEME.textPrimary }}>{p.phase}</span>
            <span style={{ fontSize: 10, color: THEME.textMuted, marginLeft: "auto" }}>{p.note || p.duration_note}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function T24COBAnalyser() {
  const [logs, setLogs] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("input");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  // ── API call goes to /api/analyze (Vercel proxy) ──
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

  async function analyzeLogs() {
    if (!logs.trim()) return;
    setLoading(true); setError(""); setAnalysis(null);
    try {
      const snippet = logs.slice(0, 1500);
      const data = await callAPI({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Analyze:\n${snippet}` }],
      });
      const raw = data.content?.map(b => b.text || "").join("") || "";
      const parsed = safeParseJSON(raw);
      if (!parsed) throw new Error("Could not parse response. Try a shorter log.");
      setAnalysis(parsed);
      setActiveTab("dashboard");
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  }

  async function sendChat() {
    if (!chatInput.trim()) return;
    const history = [...chatMessages, { role: "user", content: chatInput }];
    setChatMessages(history); setChatInput(""); setChatLoading(true);

    // Inject current analysis into system prompt so chat is fully synced
    const analysisContext = analysis ? [
      "CURRENT SESSION ANALYSIS:",
      `Summary: ${analysis.summary}`,
      `Risk: ${analysis.duration_risk} | Score: ${computeScore(analysis)}/100`,
      "Issues:",
      ...(analysis.issues || []).map(i => `  [${i.severity}] ${i.title} — Fix: ${i.fix}`),
      "Optimizations:",
      ...(analysis.optimizations || []).map(o => `  ${o.title}: ${o.action} (${o.expected_gain})`),
      `Priority Actions: ${(analysis.priority_actions || []).join(", ")}`,
      `Phases: ${(analysis.cob_phases || []).map(p => `${p.phase}=${p.status}`).join(", ")}`,
      "",
      "Answer questions referencing THIS specific analysis. Be direct and specific.",
    ].join("\n") : "No analysis run yet. Answer general T24 COB questions.";

    try {
      const data = await callAPI({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        system: `You are a T24 COB performance expert inside the T24 COB Analyser tool. Use specific T24 field names and fixes.\n\n${analysisContext}`,
        messages: history,
      });
      const text = data.content?.map(b => b.text || "").join("") || "Error — try again.";
      setChatMessages(prev => [...prev, { role: "assistant", content: text }]);
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Error — try again." }]);
    } finally { setChatLoading(false); }
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
    { label: "HIGH",     value: sevCounts.HIGH,     color: "#ff8c42" },
    { label: "MEDIUM",   value: sevCounts.MEDIUM,   color: THEME.accent },
    { label: "LOW",      value: sevCounts.LOW,       color: THEME.green },
  ];

  const metricCards = analysis ? [
    { label: "COB HEALTH SCORE", value: `${score}/100`, color: score >= 75 ? THEME.green : score >= 45 ? THEME.accent : THEME.red },
    { label: "RISK LEVEL",       value: analysis.duration_risk || "—", color: sev(analysis.duration_risk) },
    { label: "ISSUES FOUND",     value: analysis.issues?.length || 0,  color: THEME.blue },
    { label: "OPTIMIZATIONS",    value: analysis.optimizations?.length || 0, color: THEME.purple },
  ] : [];

  const TABS = [
    ["input",     "📋 LOG INPUT",    false],
    ["dashboard", "📊 DASHBOARD",    !analysis],
    ["analysis",  "🔬 ANALYSIS",     !analysis],
    ["chat",      "💬 EXPERT CHAT",  false],
  ];

  return (
    <div style={{ minHeight: "100vh", background: THEME.bg, color: THEME.textPrimary, fontFamily: "'JetBrains Mono','Fira Code','Courier New',monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#2a3545;border-radius:2px}
        textarea,input{outline:none;}
        .qbtn:hover{background:rgba(240,165,0,0.1)!important;border-color:#f0a500!important;}
        .abtn:hover:not(:disabled){background:#d49200!important;transform:translateY(-1px);}
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

      {/* ── HEADER ── */}
      <div style={{ background: THEME.surface, borderBottom: `1px solid ${THEME.border}`, padding: "16px 24px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 38, height: 38, borderRadius: 8, background: `${THEME.accent}22`, border: `1px solid ${THEME.accent}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>⚡</div>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 17, fontWeight: 800, letterSpacing: "-0.3px" }}>
            T24 COB <span style={{ color: THEME.accent }}>PERFORMANCE</span> ANALYSER
          </div>
          <div style={{ fontSize: 10, color: THEME.textMuted, letterSpacing: "2px", marginTop: 1 }}>TEMENOS CORE BANKING · EOD INTELLIGENCE</div>
        </div>
        {analysis && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${sev(analysis.duration_risk)}18`, border: `1px solid ${sev(analysis.duration_risk)}44`, color: sev(analysis.duration_risk) }}>
              {analysis.duration_risk} RISK
            </div>
            <div style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${score >= 75 ? THEME.green : score >= 45 ? THEME.accent : THEME.red}18`, border: `1px solid ${score >= 75 ? THEME.green : score >= 45 ? THEME.accent : THEME.red}44`, color: score >= 75 ? THEME.green : score >= 45 ? THEME.accent : THEME.red }}>
              SCORE {score}/100
            </div>
          </div>
        )}
      </div>

      {/* ── TABS ── */}
      <div style={{ display: "flex", background: THEME.surface, borderBottom: `1px solid ${THEME.border}`, padding: "0 24px" }}>
        {TABS.map(([id, label, disabled]) => (
          <button key={id} onClick={() => !disabled && setActiveTab(id)} style={{
            padding: "10px 16px", border: "none", background: "transparent",
            cursor: disabled ? "default" : "pointer",
            fontSize: 10, fontWeight: 700, letterSpacing: "1.5px", fontFamily: "'JetBrains Mono',monospace",
            color: activeTab === id ? THEME.accent : disabled ? THEME.textMuted : THEME.textSecondary,
            borderBottom: activeTab === id ? `2px solid ${THEME.accent}` : "2px solid transparent",
            marginBottom: -1, opacity: disabled ? 0.35 : 1, transition: "all 0.2s"
          }}>{label}</button>
        ))}
      </div>

      <div style={{ padding: "20px 24px", maxWidth: 1050, margin: "0 auto" }}>

        {/* ── INPUT TAB ── */}
        {activeTab === "input" && (
          <div className="fade" style={{ display: "grid", gridTemplateColumns: "1fr 290px", gap: 18 }}>
            <div>
              <div style={{ fontSize: 10, color: THEME.textMuted, letterSpacing: "2px", marginBottom: 8, fontWeight: 700 }}>PASTE COB LOGS</div>
              <div style={{ position: "relative" }}>
                <textarea value={logs} onChange={e => setLogs(e.target.value)}
                  placeholder={`[22:14:33] COB.START\n[22:18:44] WARNING: F.ACCOUNT full table scan\n[22:24:55] ERROR: IC.COB timeout 356s\n...paste your T24 COB logs here`}
                  style={{ width: "100%", height: 340, background: THEME.surfaceAlt, border: `1px solid ${logs ? THEME.borderBright : THEME.border}`, borderRadius: 8, color: THEME.textPrimary, fontSize: 12, padding: 14, resize: "vertical", fontFamily: "'JetBrains Mono',monospace", lineHeight: 1.7 }} />
                {logs && <div style={{ position: "absolute", bottom: 10, right: 12, fontSize: 10, color: THEME.textMuted }}>{logs.split("\n").length} LINES</div>}
              </div>
              {error && <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 6, background: `${THEME.red}15`, border: `1px solid ${THEME.red}44`, color: THEME.red, fontSize: 12 }}>⚠ {error}</div>}
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button className="abtn" onClick={analyzeLogs} disabled={loading || !logs.trim()} style={{
                  flex: 1, padding: "12px", background: loading || !logs.trim() ? THEME.surfaceAlt : THEME.accent,
                  border: `1px solid ${loading || !logs.trim() ? THEME.border : THEME.accent}`, borderRadius: 8,
                  color: loading || !logs.trim() ? THEME.textMuted : "#000", fontSize: 11, fontWeight: 700,
                  cursor: loading || !logs.trim() ? "not-allowed" : "pointer", letterSpacing: "1.5px",
                  transition: "all 0.2s", fontFamily: "'JetBrains Mono',monospace",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                }}>
                  {loading
                    ? <><div className="spin" style={{ width: 13, height: 13, borderRadius: "50%", border: `2px solid #555`, borderTopColor: THEME.accent }} />ANALYSING...</>
                    : "⚡ ANALYSE COB PERFORMANCE"}
                </button>
                {logs && (
                  <button onClick={() => { setLogs(""); setAnalysis(null); setError(""); }} style={{ padding: "12px 16px", background: "transparent", border: `1px solid ${THEME.border}`, borderRadius: 8, color: THEME.textMuted, fontSize: 11, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace" }}>
                    CLEAR
                  </button>
                )}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: THEME.textMuted, letterSpacing: "2px", marginBottom: 8, fontWeight: 700 }}>SAMPLE SCENARIOS</div>
              {Object.entries(QUICK_LOGS).map(([label, log]) => (
                <button key={label} className="qbtn" onClick={() => setLogs(log)} style={{ width: "100%", marginBottom: 9, padding: "12px 13px", background: THEME.surfaceAlt, border: `1px solid ${THEME.border}`, borderRadius: 8, color: THEME.textPrimary, cursor: "pointer", textAlign: "left", fontSize: 12, fontFamily: "'JetBrains Mono',monospace", transition: "all 0.2s" }}>
                  <div style={{ fontWeight: 700, color: THEME.accent, marginBottom: 3 }}>
                    {label === "COB Timeout" ? "⏱" : label === "Index Issues" ? "🗂" : "🏗"} {label}
                  </div>
                  <div style={{ fontSize: 10, color: THEME.textMuted }}>
                    {label === "COB Timeout" && "IC.COB timeout · 128min run"}
                    {label === "Index Issues" && "Missing indexes · full table scans"}
                    {label === "AA Data Quality" && "Unauthorized records · 75min delay"}
                  </div>
                </button>
              ))}
              <div style={{ marginTop: 4, padding: 11, borderRadius: 8, background: `${THEME.accent}08`, border: `1px solid ${THEME.accent}22` }}>
                <div style={{ fontSize: 10, color: THEME.accent, fontWeight: 700, marginBottom: 5, letterSpacing: "1px" }}>DETECTS</div>
                {["DB index gaps", "Batch sequencing", "TSA agents", "AA data quality", "OFS verbosity", "PGM.FILE config"].map(i => (
                  <div key={i} style={{ fontSize: 10, color: THEME.textSecondary, marginBottom: 2 }}><span style={{ color: THEME.green }}>▸</span> {i}</div>
                ))}
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
                {barData.length > 0
                  ? <BarChart data={barData} />
                  : <div style={{ fontSize: 11, color: THEME.textMuted, paddingTop: 20 }}>No category data</div>}
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
                <div style={{ fontSize: 10, color: THEME.textMuted, letterSpacing: "2px", fontWeight: 700, marginBottom: 4 }}>EXECUTIVE SUMMARY</div>
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
                  <button onClick={() => setActiveTab("chat")} style={{ width: "100%", padding: 9, background: "transparent", border: `1px dashed ${THEME.accent}55`, borderRadius: 8, color: THEME.accent, fontSize: 10, cursor: "pointer", letterSpacing: "1px", fontFamily: "'JetBrains Mono',monospace" }}>
                    💬 ASK EXPERT ABOUT THESE →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CHAT TAB ── */}
        {activeTab === "chat" && (
          <div className="fade">
            <div style={{ height: 400, overflowY: "auto", background: THEME.surfaceAlt, borderRadius: 10, border: `1px solid ${THEME.border}`, padding: 13, marginBottom: 11 }}>
              {chatMessages.length === 0 && (
                <div style={{ padding: "28px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 26, marginBottom: 10 }}>🏦</div>
                  <div style={{ fontSize: 12, color: THEME.textSecondary, marginBottom: 14 }}>Ask anything about T24 COB performance, AA Architecture, OFS tuning, indexes, or batch optimization.</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center" }}>
                    {["How to fix IC.COB timeouts?", "Best F.ACCOUNT index strategy?", "Tune TSA.SERVICES agents", "AA EOD best practices", "Reduce OFS logging", "STANDARD.SELECTION tips"].map(q => (
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
                placeholder="Ask about T24 COB, AA, OFS, indexes, batch tuning..."
                style={{ flex: 1, padding: "11px 13px", background: THEME.surfaceAlt, border: `1px solid ${THEME.border}`, borderRadius: 8, color: THEME.textPrimary, fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }} />
              <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()} style={{ padding: "11px 17px", background: chatLoading || !chatInput.trim() ? THEME.surfaceAlt : THEME.accent, border: `1px solid ${chatLoading || !chatInput.trim() ? THEME.border : THEME.accent}`, borderRadius: 8, color: chatLoading || !chatInput.trim() ? THEME.textMuted : "#000", fontSize: 11, fontWeight: 700, cursor: chatLoading || !chatInput.trim() ? "not-allowed" : "pointer", letterSpacing: "1px", fontFamily: "'JetBrains Mono',monospace" }}>SEND</button>
            </div>
          </div>
        )}
      </div>

      {/* ── FOOTER ── */}
      <div style={{ borderTop: `1px solid ${THEME.border}`, padding: "9px 24px", display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontSize: 10, color: THEME.textMuted, letterSpacing: "1px" }}>POWERED BY CLAUDE AI · TEMENOS T24 · VEXORA AI</div>
        <div style={{ display: "flex", gap: 12, fontSize: 10, color: THEME.textMuted }}>
          {["T24 R22+", "TAFC/TAFJ", "AA ARCH", "OFS/BIAN"].map(t => <span key={t}>{t}</span>)}
        </div>
      </div>
    </div>
  );
}