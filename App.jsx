import { useState, useEffect, useRef } from "react";

// ─── constants ───────────────────────────────────────────────────────────────

const API_BASE = "http://localhost:8000/api";

const SAMPLES = {
  nric:     "S9812345Z",
  passport: "A1234567Z",
  dob:      "1978-08-30",
  name:     "John Smith",
};

const FIELD_META = {
  nric:     { label: "NRIC / FIN",      method: "FPE",    reversible: true,  icon: "🪪" },
  passport: { label: "Passport No.",    method: "FPE",    reversible: true,  icon: "📘" },
  dob:      { label: "Date of Birth",   method: "HMAC",   reversible: false, icon: "📅", hint: "YYYY-MM-DD · YYYYMMDD · DD-MMM-YYYY HH:MM:SS.fff" },
  name:     { label: "Full Name",       method: "SHA-256",reversible: false, icon: "👤" },
};

const TECH_CARDS = [
  {
    icon: "🔁",
    title: "Format-Preserving Encryption",
    subtitle: "FF1 algorithm via pyffx",
    body: "Encrypted values retain the original structure — an NRIC stays NRIC-shaped, a passport number stays passport-shaped. Downstream systems that validate format continue to work without modification.",
  },
  {
    icon: "📅",
    title: "DOB Masking",
    subtitle: "HMAC-SHA256, year + format preserved",
    body: "Month and day are pseudorandomised using a keyed HMAC digest. The birth year is preserved for age-band analytics, and the output mirrors the input format — YYYYMMDD in, YYYYMMDD out. Deterministic: same input always produces the same masked output.",
  },
  {
    icon: "#️⃣",
    title: "Name Hashing",
    subtitle: "Salted SHA-256",
    body: "Full names are reduced to a 64-character hex digest. Records can still be joined on the hash without exposing the name. One-way: no decryption path exists.",
  },
  {
    icon: "⚙️",
    title: "FastAPI Backend",
    subtitle: "Pydantic · OpenAPI · CORS",
    body: "Every endpoint is typed end-to-end. Auto-generated Swagger docs at /docs. Batch endpoint handles up to 1 000 records per call. Secret key loaded from environment variable.",
  },
];

const COMPLIANCE_ITEMS = [
  { law: "PDPA (Singapore)", note: "Anonymisation safe harbour — pseudonymised data with no re-identification path qualifies for reduced obligations under the PDPA." },
  { law: "GDPR (EU)",        note: "Properly pseudonymised data falls outside GDPR scope where re-identification without the key is not reasonably possible." },
  { law: "MAS TRM",          note: "MAS Technology Risk Management guidelines require sensitive customer data to be encrypted at rest and in transit." },
  { law: "ISO 27001",        note: "FPE supports data minimisation controls under Annex A.8 (Asset Management) and A.14 (System Acquisition)." },
];

// ─── tiny helpers ────────────────────────────────────────────────────────────

function Badge({ children, type = "neutral" }) {
  const colors = {
    neutral:  { bg: "#1e2530", text: "#8fa3bf", border: "#2d3748" },
    fpe:      { bg: "#0d2137", text: "#4aa8ff", border: "#1a3a5c" },
    hmac:     { bg: "#1a1a0d", text: "#d4a017", border: "#3a3010" },
    hash:     { bg: "#1a0d1a", text: "#c084fc", border: "#3a1a4a" },
    success:  { bg: "#0d1f12", text: "#4ade80", border: "#1a3d24" },
    warning:  { bg: "#1f1200", text: "#fb923c", border: "#3d2400" },
  };
  const c = colors[type] || colors.neutral;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: c.bg, color: c.text,
      border: `1px solid ${c.border}`,
      borderRadius: 4, padding: "2px 8px",
      fontSize: 11, fontFamily: "monospace", letterSpacing: "0.04em",
      whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

function Tag({ children }) {
  return (
    <span style={{
      display: "inline-block", background: "#111827", color: "#60a5fa",
      border: "1px solid #1e3a5f", borderRadius: 3,
      padding: "1px 6px", fontSize: 11, fontFamily: "monospace",
    }}>{children}</span>
  );
}

function Pill({ reversible }) {
  return reversible
    ? <Badge type="success">↺ reversible</Badge>
    : <Badge type="warning">⊘ one-way</Badge>;
}

function FieldRow({ field, original, encrypted, decrypted, loading, mode }) {
  const meta = FIELD_META[field];
  const displayed = mode === "encrypt" ? encrypted : decrypted;
  const methodType = { FPE: "fpe", HMAC: "hmac", "SHA-256": "hash" }[meta.method] || "neutral";

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 32px 1fr",
      alignItems: "center", gap: 12,
      padding: "14px 0",
      borderBottom: "1px solid #1a2035",
    }}>
      {/* label + original */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 13 }}>{meta.icon}</span>
          <span style={{ fontSize: 12, color: "#64748b", fontFamily: "monospace", letterSpacing: "0.05em" }}>
            {meta.label.toUpperCase()}
          </span>
          <Badge type={methodType}>{meta.method}</Badge>
          <Pill reversible={meta.reversible} />
        </div>
        <div style={{
          fontFamily: "monospace", fontSize: 14, color: "#e2e8f0",
          background: "#0d1117", border: "1px solid #1e2535",
          borderRadius: 6, padding: "8px 12px", minHeight: 38,
          display: "flex", alignItems: "center",
        }}>
          {original || <span style={{ color: "#334155" }}>—</span>}
        </div>
      </div>

      {/* arrow */}
      <div style={{ textAlign: "center", color: "#334155", fontSize: 18, paddingTop: 22 }}>
        {mode === "encrypt" ? "→" : "←"}
      </div>

      {/* result */}
      <div>
        <div style={{ height: 26, marginBottom: 6 }} />
        <div style={{
          fontFamily: "monospace", fontSize: 14,
          color: loading ? "#334155" : (displayed ? "#4ade80" : "#334155"),
          background: "#0d1117", border: `1px solid ${displayed && !loading ? "#1a3d24" : "#1e2535"}`,
          borderRadius: 6, padding: "8px 12px", minHeight: 38,
          display: "flex", alignItems: "center",
          transition: "all 0.3s ease",
          wordBreak: "break-all",
        }}>
          {loading ? "processing…" : (displayed || <span style={{ color: "#334155" }}>—</span>)}
        </div>
      </div>
    </div>
  );
}

// ─── sections ────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section style={{
      padding: "80px 0 60px",
      borderBottom: "1px solid #1a2035",
    }}>
      <div style={{ maxWidth: 760 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "#0d1f2d", border: "1px solid #1a3a5c",
          borderRadius: 20, padding: "4px 14px", marginBottom: 28,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
          <span style={{ fontSize: 12, color: "#60a5fa", fontFamily: "monospace", letterSpacing: "0.06em" }}>
            PDPA · GDPR · MAS TRM compliant
          </span>
        </div>

        <h1 style={{
          fontFamily: "'DM Serif Display', Georgia, serif",
          fontSize: "clamp(36px, 5vw, 58px)",
          fontWeight: 400, color: "#f1f5f9",
          lineHeight: 1.15, margin: "0 0 20px",
          letterSpacing: "-0.02em",
        }}>
          PII Anonymisation<br />
          <span style={{ color: "#3b82f6" }}>without breaking</span><br />
          your data pipelines.
        </h1>

        <p style={{
          fontSize: 17, color: "#64748b", lineHeight: 1.7,
          maxWidth: 580, margin: "0 0 32px",
        }}>
          Format-preserving encryption keeps NRIC numbers, passport numbers,
          and dates structurally valid after anonymisation — no schema changes,
          no downstream breakage.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {["Python 3.11+", "FastAPI", "pyffx / FF1", "Pydantic v2", "React 18"].map(t => (
            <Tag key={t}>{t}</Tag>
          ))}
        </div>
      </div>
    </section>
  );
}

function TechSection() {
  return (
    <section style={{ padding: "60px 0", borderBottom: "1px solid #1a2035" }}>
      <SectionLabel>How it works</SectionLabel>
      <h2 style={sectionHeading}>Four protection methods, one API.</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginTop: 32 }}>
        {TECH_CARDS.map(c => (
          <div key={c.title} style={{
            background: "#0a0f1a", border: "1px solid #1a2035",
            borderRadius: 10, padding: "20px 22px",
          }}>
            <div style={{ fontSize: 22, marginBottom: 10 }}>{c.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0", marginBottom: 4 }}>{c.title}</div>
            <div style={{ fontSize: 11, color: "#3b82f6", fontFamily: "monospace", marginBottom: 12 }}>{c.subtitle}</div>
            <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.65 }}>{c.body}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ComplianceSection() {
  return (
    <section style={{ padding: "60px 0", borderBottom: "1px solid #1a2035" }}>
      <SectionLabel>Compliance</SectionLabel>
      <h2 style={sectionHeading}>Built for regulated industries.</h2>
      <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 0 }}>
        {COMPLIANCE_ITEMS.map((item, i) => (
          <div key={item.law} style={{
            display: "grid", gridTemplateColumns: "160px 1fr",
            gap: 24, padding: "16px 0",
            borderBottom: i < COMPLIANCE_ITEMS.length - 1 ? "1px solid #1a2035" : "none",
          }}>
            <div style={{
              fontFamily: "monospace", fontSize: 12, color: "#4aa8ff",
              letterSpacing: "0.04em", paddingTop: 2,
            }}>{item.law}</div>
            <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.65 }}>{item.note}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function APISection() {
  const snippet = `# Encrypt a record
curl -X POST http://localhost:8000/api/encrypt \\
  -H "Content-Type: application/json" \\
  -d '{
    "nric":     "S9812345Z",
    "passport": "A1234567Z",
    "dob":      "1978-08-30",
    "name":     "John Smith"
  }'

# Response
{
  "nric":     "S3571092G",   // FPE — format preserved
  "passport": "A7829341Z",   // FPE — format preserved
  "dob":      "1978-03-14",  // Year intact, month/day masked
  "name":     "a3f8c2d1...", // SHA-256 hex digest
  "name_reversible": false,
  "dob_reversible":  false
}`;

  return (
    <section style={{ padding: "60px 0", borderBottom: "1px solid #1a2035" }}>
      <SectionLabel>API reference</SectionLabel>
      <h2 style={sectionHeading}>Clean endpoints. Auto-generated docs.</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginTop: 28, marginBottom: 28 }}>
        {[
          { method: "POST", path: "/api/encrypt",        desc: "Encrypt a single record" },
          { method: "POST", path: "/api/decrypt",        desc: "Decrypt (FPE fields only)" },
          { method: "POST", path: "/api/batch/encrypt",  desc: "Batch encrypt, up to 1 000" },
          { method: "POST", path: "/api/batch/decrypt",  desc: "Batch decrypt, up to 1 000" },
          { method: "GET",  path: "/api/health",         desc: "Liveness probe" },
        ].map(e => (
          <div key={e.path} style={{
            background: "#0a0f1a", border: "1px solid #1a2035", borderRadius: 8, padding: "12px 14px",
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <Badge type={e.method === "GET" ? "success" : "fpe"}>{e.method}</Badge>
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 12, color: "#e2e8f0", marginBottom: 4 }}>{e.path}</div>
            <div style={{ fontSize: 12, color: "#475569" }}>{e.desc}</div>
          </div>
        ))}
      </div>

      <pre style={{
        background: "#0a0f1a", border: "1px solid #1a2035",
        borderRadius: 10, padding: "20px 22px",
        fontFamily: "monospace", fontSize: 12.5,
        color: "#94a3b8", lineHeight: 1.75,
        overflowX: "auto", whiteSpace: "pre",
        margin: 0,
      }}>{snippet}</pre>
    </section>
  );
}

function Playground() {
  const [inputs, setInputs]       = useState({ ...SAMPLES });
  const [results, setResults]     = useState({});
  const [loading, setLoading]     = useState(false);
  const [mode, setMode]           = useState("encrypt"); // "encrypt" | "decrypt"
  const [error, setError]         = useState(null);
  const [useMock, setUseMock]     = useState(false);

  // Mock FPE for demo when backend is offline
  function mockEncrypt(vals) {
    const rot = s => s ? s.split("").map(c => {
      if (/[A-Z]/.test(c)) return String.fromCharCode(((c.charCodeAt(0) - 65 + 7) % 26) + 65);
      if (/[0-9]/.test(c)) return String.fromCharCode(((c.charCodeAt(0) - 48 + 3) % 10) + 48);
      return c;
    }).join("") : null;
    return {
      nric:     vals.nric     ? rot(vals.nric)     : null,
      passport: vals.passport ? rot(vals.passport) : null,
      dob:      vals.dob      ? (() => {
        const v = vals.dob.trim();
        if (/^\d{8}$/.test(v)) return v.slice(0,4) + "0314";
        if (/^\d{2}-[A-Za-z]{3}-\d{4}/.test(v)) return "14-MAR-" + v.slice(7,11) + " 00:00:00.000";
        return v.slice(0,4) + "-03-14";
      })() : null,
      name:     vals.name     ? "a3f8c2d1e5b9f2a7d4c8e1b3f6a2d9c5e8b1f4a7d2c5e9b3f6a1d8c4e7b2f5a9" : null,
    };
  }

  async function run() {
    setLoading(true);
    setError(null);

    if (useMock) {
      await new Promise(r => setTimeout(r, 600));
      setResults(mockEncrypt(inputs));
      setLoading(false);
      return;
    }

    const endpoint = mode === "encrypt" ? "/encrypt" : "/decrypt";
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nric:     inputs.nric     || null,
          passport: inputs.passport || null,
          dob:      inputs.dob      || null,
          name:     inputs.name     || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Request failed");
      }
      setResults(await res.json());
    } catch (e) {
      if (e.message.includes("fetch") || e.message.includes("network")) {
        setError("Backend offline — enable demo mode to try the playground without a running server.");
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setInputs({ ...SAMPLES });
    setResults({});
    setError(null);
  }

  return (
    <section style={{ padding: "60px 0" }}>
      <SectionLabel>Live playground</SectionLabel>
      <h2 style={sectionHeading}>Try it now.</h2>
      <p style={{ fontSize: 14, color: "#475569", marginBottom: 28 }}>
        Calls the FastAPI backend at <code style={{ color: "#60a5fa", fontSize: 12 }}>{API_BASE}</code>.
        Enable demo mode to run fully in-browser without a server.
      </p>

      {/* Controls bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        marginBottom: 24,
      }}>
        {/* Mode toggle */}
        <div style={{
          display: "flex", background: "#0a0f1a",
          border: "1px solid #1a2035", borderRadius: 8, padding: 3, gap: 3,
        }}>
          {["encrypt", "decrypt"].map(m => (
            <button key={m} onClick={() => { setMode(m); setResults({}); }}
              style={{
                padding: "6px 18px", borderRadius: 6, border: "none", cursor: "pointer",
                fontSize: 12, fontFamily: "monospace", letterSpacing: "0.05em",
                background: mode === m ? "#1e3a5c" : "transparent",
                color: mode === m ? "#60a5fa" : "#475569",
                transition: "all 0.15s",
              }}>{m.toUpperCase()}</button>
          ))}
        </div>

        {/* Demo mode toggle */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <div onClick={() => setUseMock(p => !p)} style={{
            width: 36, height: 20, borderRadius: 10, position: "relative",
            background: useMock ? "#1d4ed8" : "#1a2035",
            border: "1px solid " + (useMock ? "#3b82f6" : "#2d3748"),
            transition: "background 0.2s",
          }}>
            <div style={{
              position: "absolute", top: 2, left: useMock ? 16 : 2,
              width: 14, height: 14, borderRadius: "50%",
              background: useMock ? "#60a5fa" : "#475569",
              transition: "left 0.2s",
            }} />
          </div>
          <span style={{ fontSize: 12, color: useMock ? "#60a5fa" : "#475569", fontFamily: "monospace" }}>
            Demo mode
          </span>
        </label>

        <div style={{ flex: 1 }} />

        <button onClick={reset} style={{
          background: "transparent", border: "1px solid #1a2035",
          color: "#475569", borderRadius: 6, padding: "6px 14px",
          fontSize: 12, fontFamily: "monospace", cursor: "pointer",
        }}>Reset</button>

        <button onClick={run} disabled={loading} style={{
          background: loading ? "#0d1f37" : "#1d4ed8",
          border: "1px solid " + (loading ? "#1a3a5c" : "#3b82f6"),
          color: loading ? "#334155" : "#e0f2fe",
          borderRadius: 6, padding: "6px 20px",
          fontSize: 12, fontFamily: "monospace", letterSpacing: "0.05em",
          cursor: loading ? "default" : "pointer",
          transition: "all 0.15s",
        }}>{loading ? "running…" : `▶ RUN ${mode.toUpperCase()}`}</button>
      </div>

      {/* Input fields */}
      <div style={{
        background: "#0a0f1a", border: "1px solid #1a2035",
        borderRadius: 10, padding: "16px 20px", marginBottom: 20,
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
        }}>
          {Object.keys(FIELD_META).map(field => (
            <div key={field}>
              <label style={{
                fontSize: 11, color: "#475569", fontFamily: "monospace",
                letterSpacing: "0.06em", display: "block", marginBottom: 5,
              }}>
                {FIELD_META[field].icon} {FIELD_META[field].label.toUpperCase()}
              </label>
              <input
                value={inputs[field] || ""}
                onChange={e => setInputs(p => ({ ...p, [field]: e.target.value }))}
                placeholder={SAMPLES[field]}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "#0d1117", border: "1px solid #1e2535",
                  borderRadius: 6, padding: "7px 10px",
                  fontFamily: "monospace", fontSize: 13, color: "#e2e8f0",
                  outline: "none",
                }}
              />
              {FIELD_META[field].hint && (
                <div style={{ fontSize: 10, color: "#334155", marginTop: 4, fontFamily: "monospace" }}>
                  {FIELD_META[field].hint}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: "#1f0d0d", border: "1px solid #5c1a1a",
          borderRadius: 8, padding: "10px 14px", marginBottom: 16,
          fontSize: 13, color: "#f87171", fontFamily: "monospace",
        }}>⚠ {error}</div>
      )}

      {/* Results */}
      <div style={{
        background: "#0a0f1a", border: "1px solid #1a2035",
        borderRadius: 10, padding: "4px 20px",
      }}>
        {Object.keys(FIELD_META).map(field => (
          <FieldRow
            key={field}
            field={field}
            original={inputs[field]}
            encrypted={mode === "encrypt" ? results[field] : null}
            decrypted={mode === "decrypt" ? results[field] : null}
            loading={loading}
            mode={mode}
          />
        ))}
      </div>

      {Object.keys(results).length > 0 && (
        <div style={{
          marginTop: 14, fontSize: 12, color: "#334155",
          fontFamily: "monospace", textAlign: "right",
        }}>
          {mode === "encrypt"
            ? "↺ NRIC and Passport can be decrypted with the same key · 📅 DOB output mirrors input format"
            : "DOB and Name are one-way transforms — original values are unchanged above"}
        </div>
      )}
    </section>
  );
}

function Footer() {
  return (
    <footer style={{
      borderTop: "1px solid #1a2035", padding: "32px 0",
      display: "flex", justifyContent: "space-between", alignItems: "center",
      flexWrap: "wrap", gap: 12,
    }}>
      <div style={{ fontFamily: "monospace", fontSize: 12, color: "#334155" }}>
        PII Anonymisation Engine · v1.0.0 · MIT License
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        {[
          { label: "Swagger docs",    href: "http://localhost:8000/docs" },
          { label: "GitHub",          href: "#" },
        ].map(l => (
          <a key={l.label} href={l.href}
            style={{ fontSize: 12, color: "#334155", fontFamily: "monospace", textDecoration: "none" }}
          >{l.label} →</a>
        ))}
      </div>
    </footer>
  );
}

// ─── layout helpers ──────────────────────────────────────────────────────────

const sectionHeading = {
  fontFamily: "'DM Serif Display', Georgia, serif",
  fontSize: "clamp(22px, 3vw, 32px)",
  fontWeight: 400, color: "#f1f5f9",
  margin: "8px 0 0", letterSpacing: "-0.01em",
};

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: "monospace", fontSize: 11, letterSpacing: "0.1em",
      color: "#3b82f6", marginBottom: 4,
    }}>{children.toUpperCase()}</div>
  );
}

// ─── nav ─────────────────────────────────────────────────────────────────────

function Nav() {
  const links = ["How it works", "Compliance", "API", "Playground"];

  function scrollTo(label) {
    const ids = {
      "How it works": "how-it-works",
      "Compliance":   "compliance",
      "API":          "api-ref",
      "Playground":   "playground",
    };
    document.getElementById(ids[label])?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 100,
      background: "rgba(7, 10, 18, 0.9)",
      backdropFilter: "blur(12px)",
      borderBottom: "1px solid #1a2035",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 40px", height: 56,
    }}>
      <div style={{
        fontFamily: "monospace", fontSize: 13, color: "#e2e8f0",
        letterSpacing: "0.04em",
      }}>
        <span style={{ color: "#3b82f6" }}>◈</span> pii-anon
      </div>
      <div style={{ display: "flex", gap: 24 }}>
        {links.map(l => (
          <button key={l} onClick={() => scrollTo(l)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 13, color: "#475569", fontFamily: "monospace",
            letterSpacing: "0.03em",
          }}>{l}</button>
        ))}
      </div>
    </nav>
  );
}

// ─── root ────────────────────────────────────────────────────────────────────

export default function App() {
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  return (
    <div style={{ background: "#070a12", minHeight: "100vh", color: "#e2e8f0" }}>
      <Nav />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 32px" }}>
        <Hero />
        <span id="how-it-works" /><TechSection />
        <span id="compliance"   /><ComplianceSection />
        <span id="api-ref"      /><APISection />
        <span id="playground"   /><Playground />
        <Footer />
      </div>
    </div>
  );
}
