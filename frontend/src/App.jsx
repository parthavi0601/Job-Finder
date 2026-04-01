import { useState, useEffect, useCallback } from "react";

const API_BASE = "http://localhost:5000/api";

async function searchJobs(query, location, sources = "linkedin,remotive,himalayas,arbeitnow") {
  try {
    const params = new URLSearchParams({ q: query, location, sources, limit: "30" });
    const resp = await fetch(`${API_BASE}/search?${params}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    return data.jobs || [];
  } catch (err) {
    console.error("API Error:", err);
    return null;
  }
}

async function fetchJobDetails(source, jobId) {
  try {
    const resp = await fetch(`${API_BASE}/job/${source}/${jobId}`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch { return null; }
}

// ─── Design tokens ───
const T = {
  // backgrounds
  bg0: "#080a0f",
  bg1: "#0e1117",
  bg2: "#141820",
  bg3: "#1a2030",
  // borders
  br0: "rgba(255,255,255,0.04)",
  br1: "rgba(255,255,255,0.08)",
  br2: "rgba(255,255,255,0.14)",
  // text
  tx1: "#f0f2f7",
  tx2: "#8c93a8",
  tx3: "#4a5068",
  // accents
  indigo: "#6366f1",
  indigoMid: "rgba(99,102,241,0.15)",
  indigoDim: "rgba(99,102,241,0.08)",
  cyan: "#22d3ee",
  cyanMid: "rgba(34,211,238,0.12)",
  emerald: "#10b981",
  emeraldMid: "rgba(16,185,129,0.12)",
  amber: "#f59e0b",
  amberMid: "rgba(245,158,11,0.12)",
  rose: "#f43f5e",
  roseMid: "rgba(244,63,94,0.12)",
  // source colors
  srcLinkedIn: "#0a66c2",
  srcRemotive: "#00c896",
  srcHimalayas: "#818cf8",
  srcArbeitnow: "#fb923c",
};

const font = `'Syne', sans-serif`;
const mono = `'IBM Plex Mono', monospace`;

// ─── Shared micro-components ───

const StatusBadge = ({ status }) => {
  const map = {
    saved: { bg: T.indigoDim, fg: "#a5b4fc", label: "Saved" },
    applied: { bg: T.cyanMid, fg: T.cyan, label: "Applied" },
    interview: { bg: T.amberMid, fg: T.amber, label: "Interview" },
    offered: { bg: T.emeraldMid, fg: T.emerald, label: "Offered" },
    rejected: { bg: T.roseMid, fg: T.rose, label: "Rejected" },
  };
  const { bg, fg, label } = map[status] || map.saved;
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 4,
      fontSize: 10, fontWeight: 600, letterSpacing: 0.6,
      textTransform: "uppercase", fontFamily: mono,
      background: bg, color: fg,
    }}>{label}</span>
  );
};

const Tag = ({ children, color, bg }) => (
  <span style={{
    padding: "3px 8px", borderRadius: 4,
    fontSize: 10, fontWeight: 500, letterSpacing: 0.3,
    fontFamily: mono, background: bg || T.indigoDim,
    color: color || "#a5b4fc",
  }}>{children}</span>
);

const SourcePip = ({ source }) => {
  const colors = {
    LinkedIn: T.srcLinkedIn,
    Remotive: T.srcRemotive,
    Himalayas: T.srcHimalayas,
    Arbeitnow: T.srcArbeitnow,
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: T.tx3, fontFamily: mono }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: colors[source] || T.tx3, flexShrink: 0 }} />
      {source}
    </span>
  );
};

const StatCard = ({ icon, label, value, accent }) => (
  <div style={{
    background: T.bg1, border: `1px solid ${T.br1}`,
    borderRadius: 12, padding: "18px 20px", flex: 1, minWidth: 120,
  }}>
    <div style={{ fontSize: 18, marginBottom: 10 }}>{icon}</div>
    <div style={{ fontSize: 24, fontWeight: 700, color: accent || T.tx1, fontFamily: font, lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: 10, color: T.tx3, fontFamily: mono, letterSpacing: 0.8, textTransform: "uppercase", marginTop: 6 }}>{label}</div>
  </div>
);

const Divider = () => <div style={{ height: 1, background: T.br1, margin: "0 0 16px" }} />;

// ─── Glassmorphic logo ───
const Logo = () => (
  <div style={{
    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 13, fontWeight: 800, color: "#fff", fontFamily: font, letterSpacing: -0.5,
  }}>JP</div>
);

// ─── Input styles ───
const inputStyle = {
  flex: 1, minWidth: 140, padding: "10px 14px",
  borderRadius: 8, border: `1px solid ${T.br1}`,
  background: T.bg0, color: T.tx1,
  fontSize: 13, fontFamily: font, outline: "none",
  transition: "border-color .15s",
};

const btnPrimary = {
  padding: "10px 22px", borderRadius: 8, border: "none", cursor: "pointer",
  background: T.indigo, color: "#fff",
  fontSize: 13, fontWeight: 700, fontFamily: font,
  transition: "opacity .15s",
  whiteSpace: "nowrap",
};

// ─── Company avatar ───
const CompanyAvatar = ({ logo, name, size = 40 }) => {
  const [broken, setBroken] = useState(false);
  if (logo && !broken) {
    return (
      <img
        src={logo} alt="" onError={() => setBroken(true)}
        style={{ width: size, height: size, borderRadius: 8, objectFit: "contain", background: "#fff", padding: 3, flexShrink: 0, border: `1px solid ${T.br1}` }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: 8, flexShrink: 0,
      background: T.bg3, border: `1px solid ${T.br1}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 700, color: T.tx3, fontFamily: font,
    }}>{(name || "?")[0].toUpperCase()}</div>
  );
};

// ─── Job card ───
const JobCard = ({ job, isTracked, status, onClick }) => (
  <div
    onClick={onClick}
    style={{
      background: T.bg1, border: `1px solid ${T.br1}`,
      borderRadius: 12, padding: "14px 18px",
      cursor: "pointer", transition: "border-color .15s, background .15s",
      display: "flex", alignItems: "center", gap: 14,
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = T.br2; e.currentTarget.style.background = T.bg2; }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = T.br1; e.currentTarget.style.background = T.bg1; }}
  >
    <CompanyAvatar logo={job.company_logo} name={job.company} size={42} />

    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: T.tx1, fontFamily: font }}>{job.title}</span>
        {isTracked && <StatusBadge status={status} />}
      </div>
      <div style={{ fontSize: 12, color: T.tx2, marginBottom: 8, fontFamily: font }}>
        {job.company}{job.location ? ` · ${job.location}` : ""}{job.job_type ? ` · ${job.job_type}` : ""}
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
        <SourcePip source={job.source} />
        {job.auto_category && <Tag>{job.auto_category}</Tag>}
        {job.level && <Tag bg={T.emeraldMid} color={T.emerald}>{job.level}</Tag>}
        {job.contact_email && <Tag bg={T.amberMid} color={T.amber}>Has email</Tag>}
      </div>
    </div>

    <div style={{ textAlign: "right", flexShrink: 0 }}>
      {job.salary && (
        <div style={{ fontSize: 12, fontWeight: 600, color: T.emerald, fontFamily: mono, marginBottom: 4 }}>
          {job.salary}
        </div>
      )}
      <div style={{ fontSize: 10, color: T.tx3, fontFamily: mono }}>{job.posted_text}</div>
    </div>
  </div>
);

// ─── Filter pill row ───
const FilterRow = ({ options, active, onChange, label }) => (
  <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
    {label && <span style={{ fontSize: 10, color: T.tx3, fontFamily: mono, letterSpacing: 0.8, marginRight: 2 }}>{label}</span>}
    {options.map(({ k, l }) => (
      <button key={k} onClick={() => onChange(k)} style={{
        padding: "4px 11px", borderRadius: 20,
        border: `1px solid ${active === k ? T.indigo : T.br1}`,
        background: active === k ? T.indigoDim : "transparent",
        color: active === k ? "#a5b4fc" : T.tx3,
        fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: font,
        transition: "all .15s",
      }}>{l}</button>
    ))}
  </div>
);

// ─── Source toggle ───
const SourceToggle = ({ k, active, onClick }) => {
  const labels = { linkedin: "LinkedIn", remotive: "Remotive", himalayas: "Himalayas", arbeitnow: "Arbeitnow" };
  const dotColors = { linkedin: T.srcLinkedIn, remotive: T.srcRemotive, himalayas: T.srcHimalayas, arbeitnow: T.srcArbeitnow };
  return (
    <button onClick={onClick} style={{
      padding: "4px 10px", borderRadius: 6,
      border: `1px solid ${active ? T.br2 : T.br0}`,
      background: active ? T.bg3 : "transparent",
      color: active ? T.tx1 : T.tx3,
      fontSize: 10, fontWeight: 500, cursor: "pointer",
      fontFamily: mono, display: "inline-flex", alignItems: "center", gap: 5,
      transition: "all .15s",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: active ? dotColors[k] : T.tx3 }} />
      {labels[k]}
    </button>
  );
};

// ─── Inline link ───
const A = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "#a5b4fc", textDecoration: "none", wordBreak: "break-all" }}>
    {children}
  </a>
);

// ─── Section label ───
const SectionLabel = ({ children }) => (
  <div style={{ fontSize: 10, color: T.tx3, fontFamily: mono, letterSpacing: 0.9, textTransform: "uppercase", marginBottom: 10, fontWeight: 600 }}>
    {children}
  </div>
);

// ─────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────
export default function JobPulse() {
  const [view, setView] = useState("search");
  const [jobs, setJobs] = useState([]);
  const [tracked, setTracked] = useState([]);
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState("");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [filter, setFilter] = useState("all");
  const [tFilter, setTFilter] = useState("all");
  const [sources, setSources] = useState({ linkedin: true, remotive: true, himalayas: true, arbeitnow: true });
  const [backendUp, setBackendUp] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [jobDetail, setJobDetail] = useState(null);

  useEffect(() => {
    try {
      const item = localStorage.getItem("jp-tracked");
      if (item) setTracked(JSON.parse(item));
    } catch { }
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/health`);
        setBackendUp(r.ok);
      } catch { setBackendUp(false); }
    })();
  }, []);

  const saveTracked = useCallback((t) => {
    setTracked(t);
    try { localStorage.setItem("jp-tracked", JSON.stringify(t)); } catch { }
  }, []);

  const doSearch = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    const activeSources = Object.entries(sources).filter(([, v]) => v).map(([k]) => k).join(",");
    const results = await searchJobs(q || "software engineer", loc, activeSources);
    if (results !== null) { setJobs(results); setBackendUp(true); }
    else { setBackendUp(false); setJobs([]); }
    setLoading(false);
  }, [q, loc, sources]);

  const openDetail = useCallback(async (job) => {
    setSelected(job);
    setJobDetail(null);
    if (job.source === "LinkedIn" && job.source_id) {
      setDetailLoading(true);
      const d = await fetchJobDetails("linkedin", job.source_id);
      if (d?.details) setJobDetail(d.details);
      setDetailLoading(false);
    }
  }, []);

  const track = useCallback((job, status = "saved") => {
    if (tracked.find(t => t.url === job.url)) return;
    saveTracked([{ ...job, status, trackedAt: new Date().toISOString() }, ...tracked]);
  }, [tracked, saveTracked]);

  const updateStatus = useCallback((url, s) => {
    saveTracked(tracked.map(t => t.url === url ? { ...t, status: s } : t));
  }, [tracked, saveTracked]);

  const remove = useCallback((url) => {
    saveTracked(tracked.filter(t => t.url !== url));
  }, [tracked, saveTracked]);

  const isTracked = (url) => tracked.some(t => t.url === url);
  const getStatus = (url) => tracked.find(t => t.url === url)?.status;

  const filtered = filter === "all" ? jobs : jobs.filter(j => {
    if (filter === "intern") return j.level === "Intern";
    if (filter === "remote") return ["remote", "worldwide"].some(w => (j.location || "").toLowerCase().includes(w));
    if (filter === "india") return (j.location || "").toLowerCase().includes("india");
    if (filter === "ai") return j.auto_category === "AI/ML";
    return true;
  });
  const filteredT = tFilter === "all" ? tracked : tracked.filter(t => t.status === tFilter);

  const stats = {
    total: tracked.length,
    applied: tracked.filter(t => t.status === "applied").length,
    interview: tracked.filter(t => t.status === "interview").length,
    offered: tracked.filter(t => t.status === "offered").length,
  };

  // ── Nav tabs ──
  const NavTab = ({ id, label, count }) => (
    <button onClick={() => { setView(id); setSelected(null); }} style={{
      padding: "7px 16px", borderRadius: 7, border: "none", cursor: "pointer",
      fontSize: 12, fontWeight: 600, fontFamily: font, transition: "all .15s",
      background: view === id ? T.bg3 : "transparent",
      color: view === id ? T.tx1 : T.tx3,
    }}>
      {label}{count > 0 && (
        <span style={{
          marginLeft: 6, padding: "1px 6px", borderRadius: 10,
          fontSize: 10, background: T.indigoDim, color: "#a5b4fc", fontFamily: mono,
        }}>{count}</span>
      )}
    </button>
  );

  return (
    <div style={{ fontFamily: font, background: T.bg0, color: T.tx1, minHeight: "100vh", width: "100%" }}>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; }
        input:focus { border-color: ${T.indigo} !important; }
        ::-webkit-scrollbar { width: 4px; } 
        ::-webkit-scrollbar-track { background: ${T.bg0}; }
        ::-webkit-scrollbar-thumb { background: ${T.bg3}; border-radius: 4px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
      `}</style>

      {/* ── Header ── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(8,10,15,0.92)", backdropFilter: "blur(16px)",
        borderBottom: `1px solid ${T.br1}`,
        padding: "12px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Logo />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.4, lineHeight: 1 }}>JobPulse</div>
            <div style={{ fontSize: 9, color: T.tx3, fontFamily: mono, letterSpacing: 1, marginTop: 2 }}>
              LIVE AGGREGATOR
              {backendUp !== null && (
                <span style={{ marginLeft: 8, color: backendUp ? T.emerald : T.rose, animation: backendUp ? "pulse 2s infinite" : "none" }}>
                  ● {backendUp ? "API online" : "API offline"}
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 2, background: T.bg1, borderRadius: 10, padding: "3px", border: `1px solid ${T.br1}` }}>
          <NavTab id="search" label="Discover" count={0} />
          <NavTab id="tracker" label="Tracker" count={tracked.length} />
        </div>
      </header>

      <main style={{ maxWidth: 1040, margin: "0 auto", padding: "20px 16px" }}>

        {/* ════════════════ SEARCH VIEW ════════════════ */}
        {view === "search" && !selected && (
          <>
            {/* Search panel */}
            <div style={{
              background: T.bg1, border: `1px solid ${T.br1}`,
              borderRadius: 14, padding: "18px 20px", marginBottom: 14,
            }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                <input
                  value={q} onChange={e => setQ(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && doSearch()}
                  placeholder="Role, skill, or company…"
                  style={{ ...inputStyle, flex: 2, minWidth: 180 }}
                />
                <input
                  value={loc} onChange={e => setLoc(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && doSearch()}
                  placeholder="Location…"
                  style={{ ...inputStyle, flex: 1, minWidth: 120 }}
                />
                <button onClick={doSearch} style={btnPrimary}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
                  onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                >
                  {loading
                    ? <span style={{ display: "inline-block", animation: "spin 0.8s linear infinite" }}>↻</span>
                    : "Search"}
                </button>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: T.tx3, fontFamily: mono, letterSpacing: 0.8 }}>SOURCES</span>
                  {Object.entries(sources).map(([k, v]) => (
                    <SourceToggle key={k} k={k} active={v} onClick={() => setSources(p => ({ ...p, [k]: !p[k] }))} />
                  ))}
                </div>

                <div style={{ width: 1, height: 16, background: T.br1, flexShrink: 0 }} />

                <FilterRow
                  options={[
                    { k: "all", l: "All" },
                    { k: "intern", l: "Internships" },
                    { k: "remote", l: "Remote" },
                    { k: "india", l: "India" },
                    { k: "ai", l: "AI / ML" },
                  ]}
                  active={filter}
                  onChange={setFilter}
                />
              </div>
            </div>

            {/* Offline notice */}
            {backendUp === false && searched && (
              <div style={{
                background: T.roseMid, border: `1px solid rgba(244,63,94,0.2)`,
                borderRadius: 10, padding: "14px 18px", marginBottom: 14,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.rose, marginBottom: 6 }}>Backend not running</div>
                <div style={{ fontSize: 12, color: T.tx2, lineHeight: 1.7 }}>
                  Start the Python server:<br />
                  <code style={{ fontFamily: mono, background: T.bg0, padding: "2px 7px", borderRadius: 4, fontSize: 11, color: "#a5b4fc" }}>
                    cd backend && pip install -r requirements.txt && python server.py
                  </code>
                </div>
              </div>
            )}

            {/* Landing */}
            {!searched && (
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 56, height: 56, borderRadius: 16, marginBottom: 20,
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                }}>
                  <span style={{ fontSize: 26 }}>🔍</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, letterSpacing: -0.5 }}>Real jobs. Live data.</div>
                <div style={{ fontSize: 13, color: T.tx2, maxWidth: 380, margin: "0 auto 28px", lineHeight: 1.7 }}>
                  Aggregates listings from LinkedIn, Remotive, Himalayas &amp; Arbeitnow — with apply links, contact emails, and salary info.
                </div>
                <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                  {["Python Developer", "React Intern", "AI Engineer", "Data Analyst", "DevOps"].map(s => (
                    <button key={s} onClick={() => { setQ(s); setTimeout(doSearch, 50); }} style={{
                      padding: "6px 14px", borderRadius: 20,
                      border: `1px solid ${T.br1}`, background: T.bg1,
                      color: T.tx2, fontSize: 12, cursor: "pointer",
                      fontFamily: font, fontWeight: 500, transition: "all .15s",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = T.br2; e.currentTarget.style.color = T.tx1; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = T.br1; e.currentTarget.style.color = T.tx2; }}
                    >{s}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Spinner */}
            {loading && (
              <div style={{ textAlign: "center", padding: "48px 16px" }}>
                <div style={{ width: 28, height: 28, border: `2px solid ${T.br2}`, borderTopColor: T.indigo, borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 14px" }} />
                <div style={{ fontSize: 12, color: T.tx3, fontFamily: mono }}>
                  Fetching from {Object.entries(sources).filter(([, v]) => v).length} sources…
                </div>
              </div>
            )}

            {/* Results */}
            {!loading && searched && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 11, color: T.tx3, fontFamily: mono }}>{filtered.length} results</span>
                  <button onClick={doSearch} style={{
                    padding: "5px 11px", borderRadius: 7,
                    border: `1px solid ${T.br1}`, background: "transparent",
                    color: T.tx3, fontSize: 11, cursor: "pointer", fontFamily: mono,
                    transition: "color .15s",
                  }}
                    onMouseEnter={e => e.currentTarget.style.color = T.tx1}
                    onMouseLeave={e => e.currentTarget.style.color = T.tx3}
                  >↻ refresh</button>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  {filtered.map((job, i) => (
                    <JobCard
                      key={`${job.source}-${job.source_id || i}`}
                      job={job}
                      isTracked={isTracked(job.url)}
                      status={getStatus(job.url)}
                      onClick={() => openDetail(job)}
                    />
                  ))}
                </div>

                {filtered.length === 0 && backendUp && (
                  <div style={{ textAlign: "center", padding: "48px 16px" }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                    <div style={{ fontSize: 14, color: T.tx2 }}>No jobs found — try a different query or enable more sources.</div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ════════════════ DETAIL VIEW ════════════════ */}
        {selected && (
          <div>
            <button
              onClick={() => { setSelected(null); setJobDetail(null); }}
              style={{
                padding: "6px 12px", borderRadius: 7,
                border: `1px solid ${T.br1}`, background: "transparent",
                color: T.tx3, fontSize: 11, cursor: "pointer", fontFamily: mono, marginBottom: 18,
                transition: "color .15s",
              }}
              onMouseEnter={e => e.currentTarget.style.color = T.tx1}
              onMouseLeave={e => e.currentTarget.style.color = T.tx3}
            >← back</button>

            <div style={{
              background: T.bg1, border: `1px solid ${T.br1}`,
              borderRadius: 16, padding: "24px 26px",
            }}>
              {/* Header */}
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 22 }}>
                <CompanyAvatar logo={selected.company_logo} name={selected.company} size={52} />
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800, letterSpacing: -0.4 }}>{selected.title}</h2>
                  <div style={{ fontSize: 13, color: T.tx2 }}>{selected.company}</div>
                </div>
                <SourcePip source={selected.source} />
              </div>

              {/* Meta chips */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 22 }}>
                {[
                  selected.location && { icon: "📍", text: selected.location },
                  selected.job_type && { icon: "💼", text: selected.job_type },
                  selected.level && { icon: "📊", text: selected.level },
                  selected.salary && { icon: "💰", text: selected.salary, accent: true },
                  selected.posted_text && { icon: "🕐", text: selected.posted_text },
                ].filter(Boolean).map((item, i) => (
                  <span key={i} style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "5px 10px", borderRadius: 6,
                    background: item.accent ? T.emeraldMid : T.bg3,
                    border: `1px solid ${item.accent ? "rgba(16,185,129,0.2)" : T.br1}`,
                    fontSize: 12, color: item.accent ? T.emerald : T.tx2, fontFamily: font,
                  }}>
                    <span style={{ fontSize: 12 }}>{item.icon}</span> {item.text}
                  </span>
                ))}
              </div>

              <Divider />

              {/* Application details */}
              {(selected.contact_email || selected.apply_url || selected.url) && (
                <>
                  <SectionLabel>Application details</SectionLabel>
                  <div style={{
                    background: T.bg0, border: `1px solid ${T.br1}`,
                    borderRadius: 10, padding: "14px 16px", marginBottom: 22,
                  }}>
                    {selected.contact_email && (
                      <div style={{ fontSize: 12, color: T.tx2, marginBottom: 8 }}>
                        <span style={{ color: T.amber, fontFamily: mono, fontSize: 10, fontWeight: 600, marginRight: 8 }}>EMAIL</span>
                        <A href={`mailto:${selected.contact_email}`}>{selected.contact_email}</A>
                      </div>
                    )}
                    {selected.apply_url && (
                      <div style={{ fontSize: 12, color: T.tx2, marginBottom: 8 }}>
                        <span style={{ color: T.emerald, fontFamily: mono, fontSize: 10, fontWeight: 600, marginRight: 8 }}>APPLY</span>
                        <A href={selected.apply_url}>{selected.apply_url.length > 65 ? selected.apply_url.slice(0, 65) + "…" : selected.apply_url}</A>
                      </div>
                    )}
                    {selected.url && selected.url !== selected.apply_url && (
                      <div style={{ fontSize: 12, color: T.tx2 }}>
                        <span style={{ color: "#a5b4fc", fontFamily: mono, fontSize: 10, fontWeight: 600, marginRight: 8 }}>POSTING</span>
                        <A href={selected.url}>{selected.url.length > 65 ? selected.url.slice(0, 65) + "…" : selected.url}</A>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Description */}
              <SectionLabel>Description</SectionLabel>
              {detailLoading
                ? <div style={{ fontSize: 12, color: T.tx3, fontFamily: mono, marginBottom: 22, animation: "pulse 1.5s infinite" }}>Loading full description…</div>
                : jobDetail?.description
                  ? <div style={{ fontSize: 13, color: T.tx2, lineHeight: 1.9, whiteSpace: "pre-wrap", marginBottom: 22 }}>{jobDetail.description}</div>
                  : selected.description_html
                    ? <div style={{ fontSize: 13, color: T.tx2, lineHeight: 1.9, marginBottom: 22 }} dangerouslySetInnerHTML={{ __html: selected.description_html }} />
                    : selected.description_snippet
                      ? <div style={{ fontSize: 13, color: T.tx2, lineHeight: 1.9, marginBottom: 22 }}>{selected.description_snippet}</div>
                      : <div style={{ fontSize: 12, color: T.tx3, marginBottom: 22, fontFamily: mono }}>No description — check the original posting.</div>
              }

              {/* LinkedIn extra */}
              {jobDetail && (jobDetail.seniority_level || jobDetail.employment_type || jobDetail.job_function || jobDetail.industries) && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 22 }}>
                  {jobDetail.seniority_level && <Tag bg={T.emeraldMid} color={T.emerald}>{jobDetail.seniority_level}</Tag>}
                  {jobDetail.employment_type && <Tag>{jobDetail.employment_type}</Tag>}
                  {jobDetail.job_function && <Tag bg={T.amberMid} color={T.amber}>{jobDetail.job_function}</Tag>}
                  {jobDetail.industries && <Tag bg={T.cyanMid} color={T.cyan}>{jobDetail.industries}</Tag>}
                </div>
              )}

              {/* Tags */}
              {selected.tags?.length > 0 && (
                <>
                  <SectionLabel>Tags</SectionLabel>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 22 }}>
                    {selected.tags.map(t => <Tag key={t}>{t}</Tag>)}
                  </div>
                </>
              )}

              <Divider />

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {selected.apply_url && (
                  <a href={selected.apply_url} target="_blank" rel="noopener noreferrer" style={{
                    ...btnPrimary, textDecoration: "none", display: "inline-block",
                  }}>Apply now ↗</a>
                )}

                {!isTracked(selected.url) ? (
                  <>
                    <button onClick={() => track(selected, "saved")} style={{
                      padding: "10px 18px", borderRadius: 8,
                      border: `1px solid ${T.br2}`, background: "transparent",
                      color: T.tx1, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font,
                      transition: "all .15s",
                    }}>Save</button>
                    <button onClick={() => track(selected, "applied")} style={{
                      padding: "10px 18px", borderRadius: 8,
                      border: `1px solid rgba(16,185,129,0.3)`, background: T.emeraldMid,
                      color: T.emerald, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: font,
                      transition: "all .15s",
                    }}>Mark as applied</button>
                  </>
                ) : (
                  <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, color: T.tx3, fontFamily: mono, marginRight: 2 }}>STATUS</span>
                    {["saved", "applied", "interview", "offered", "rejected"].map(s => (
                      <button key={s} onClick={() => updateStatus(selected.url, s)} style={{
                        padding: "6px 12px", borderRadius: 7,
                        border: `1px solid ${getStatus(selected.url) === s ? T.indigo : T.br1}`,
                        background: getStatus(selected.url) === s ? T.indigoDim : "transparent",
                        color: getStatus(selected.url) === s ? "#a5b4fc" : T.tx3,
                        fontSize: 11, fontWeight: 500, cursor: "pointer",
                        fontFamily: font, textTransform: "capitalize", transition: "all .15s",
                      }}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════ TRACKER VIEW ════════════════ */}
        {view === "tracker" && !selected && (
          <>
            {/* Stat row */}
            <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
              <StatCard icon="📋" label="Total tracked" value={stats.total} />
              <StatCard icon="🚀" label="Applied" value={stats.applied} accent="#a5b4fc" />
              <StatCard icon="🎯" label="Interviews" value={stats.interview} accent={T.amber} />
              <StatCard icon="🏆" label="Offers" value={stats.offered} accent={T.emerald} />
            </div>

            <FilterRow
              options={[
                { k: "all", l: "All" },
                { k: "saved", l: "Saved" },
                { k: "applied", l: "Applied" },
                { k: "interview", l: "Interview" },
                { k: "offered", l: "Offered" },
                { k: "rejected", l: "Rejected" },
              ]}
              active={tFilter}
              onChange={setTFilter}
            />

            <div style={{ height: 14 }} />

            {filteredT.length === 0 ? (
              <div style={{ textAlign: "center", padding: "56px 20px" }}>
                <div style={{ fontSize: 36, marginBottom: 14 }}>📋</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
                  {tracked.length === 0 ? "Nothing tracked yet" : "No matches"}
                </div>
                <div style={{ fontSize: 13, color: T.tx3 }}>
                  {tracked.length === 0 ? "Discover jobs and save them to start tracking your applications." : "Try a different filter."}
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {filteredT.map((job, i) => (
                  <div key={`t-${i}`} style={{
                    background: T.bg1, border: `1px solid ${T.br1}`,
                    borderRadius: 12, padding: "12px 18px",
                    display: "flex", alignItems: "center", gap: 12,
                  }}>
                    <CompanyAvatar logo={null} name={job.company} size={36} />

                    <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => openDetail(job)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.tx1 }}>{job.title}</span>
                        <StatusBadge status={job.status} />
                        <SourcePip source={job.source} />
                      </div>
                      <div style={{ fontSize: 11, color: T.tx3, fontFamily: mono }}>
                        {job.company}{job.location ? ` · ${job.location}` : ""}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 5, flexShrink: 0, alignItems: "center" }}>
                      <select value={job.status} onChange={e => updateStatus(job.url, e.target.value)} style={{
                        padding: "4px 8px", borderRadius: 6,
                        border: `1px solid ${T.br1}`, background: T.bg0,
                        color: T.tx2, fontSize: 10, fontFamily: mono,
                        cursor: "pointer", outline: "none",
                      }}>
                        {["saved", "applied", "interview", "offered", "rejected"].map(s => (
                          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                        ))}
                      </select>

                      {job.apply_url && (
                        <a href={job.apply_url} target="_blank" rel="noopener noreferrer" style={{
                          padding: "4px 8px", borderRadius: 6,
                          border: `1px solid ${T.br1}`, background: "transparent",
                          color: "#a5b4fc", fontSize: 11, textDecoration: "none",
                          display: "flex", alignItems: "center",
                        }}>↗</a>
                      )}

                      <button onClick={() => remove(job.url)} style={{
                        padding: "4px 8px", borderRadius: 6,
                        border: `1px solid ${T.br1}`, background: "transparent",
                        color: T.rose, fontSize: 12, cursor: "pointer", lineHeight: 1,
                      }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}