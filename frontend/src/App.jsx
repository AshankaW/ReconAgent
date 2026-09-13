import { useState, useRef, useEffect } from "react";

// ─────────────────────────────────────────────
// HTB Recon Agent - Frontend
//
// This UI talks to the Python backend running
// on your Kali machine at localhost:5000.
// In this artifact preview, it simulates a run
// so you can see the interface before deploying.
// ─────────────────────────────────────────────

const TOOL_ICONS = {
  run_nmap: "⬛",
  run_gobuster: "🌐",
  run_enum4linux: "🗂️",
  run_ffuf: "⚡",
  run_custom: "⚙️",
  finish: "✅",
};

const TOOL_COLORS = {
  run_nmap: "#00ff88",
  run_gobuster: "#00cfff",
  run_enum4linux: "#ffaa00",
  run_ffuf: "#ff66cc",
  run_custom: "#aaaaaa",
  finish: "#00ff88",
};

// Simulate a recon run for the artifact preview
const MOCK_STEPS = [
  {
    type: "tool",
    tool: "run_nmap",
    input: { target: "10.10.10.100", flags: "-sV -sC --open" },
    agent_reasoning:
      "Starting with a service version scan to identify open ports and running services. Using -sC for default scripts and -sV for version detection.",
    output: `Starting Nmap 7.94 ( https://nmap.org )
Nmap scan report for 10.10.10.100
Host is up (0.045s latency).

PORT    STATE SERVICE      VERSION
22/tcp  open  ssh          OpenSSH 7.9p1 Debian 10+deb10u2
80/tcp  open  http         Apache httpd 2.4.38
139/tcp open  netbios-ssn Samba smbd 3.X - 4.X
445/tcp open  netbios-ssn Samba smbd 4.9.5-Debian

Service detection performed.`,
    iteration: 1,
  },
  {
    type: "tool",
    tool: "run_gobuster",
    input: {
      target: "http://10.10.10.100",
      wordlist: "/usr/share/wordlists/dirb/common.txt",
      extensions: "php,html,txt",
    },
    agent_reasoning:
      "Port 80 is open running Apache. Running gobuster to enumerate directories and files. Also spinning up enum4linux for the SMB service on 445.",
    output: `Gobuster v3.6
[+] Url: http://10.10.10.100
[+] Threads: 10

/admin             (Status: 301)
/index.html            (Status: 200)
/login.php             (Status: 200)
/uploads             (Status: 301)
/config.php            (Status: 403)
/.htaccess             (Status: 403)

Finished.`,
    iteration: 2,
  },
  {
    type: "tool",
    tool: "run_enum4linux",
    input: { target: "10.10.10.100", flags: "-a" },
    agent_reasoning:
      "SMB is open on 445. Running enum4linux to pull users, shares, and OS info.",
    output: `Starting enum4linux v0.9.1

[*] Getting OS information
OS: Windows 6.1 (Samba 4.9.5-Debian)
OS Release: 6.1
OS Build: 0

[+] Got domain/workgroup name: WORKGROUP

[*] Enumerating users
user:[ash] rid:[0x3e8]
user:[admin] rid:[0x3e9]

[+] Share Enumeration
  Sharename    Type    Comment
  ---------    ----    -------
  print$        Disk    Printer Drivers
  backup        Disk    
  IPC$          IPC     IPC Service

Finished.`,
    iteration: 2,
  },
  {
    type: "finish",
    agent_reasoning:
      "I have enough information to provide a solid attack surface summary.",
    summary:
      "Target is a Debian box running Apache 2.4.38, OpenSSH 7.9, and Samba 4.9.5. Web enumeration found /admin, /login.php, and /uploads directories. SMB enumeration revealed two users (ash, admin) and an accessible 'backup' share. The /uploads directory combined with /login.php suggests a file upload vulnerability may be present after authentication.",
    attack_vectors: [
      { service: "SMB", description: "1. Check SMB 'backup' share for credentials or sensitive files: smbclient //10.10.10.100/backup -N" },
      { service: "HTTP", description: "2. Brute force /login.php with discovered usernames (ash, admin) using hydra" },
      { service: "HTTP", description: "3. If login succeeds, test /uploads for unrestricted file upload → PHP webshell" },
      { service: "HTTP", description: "4. Check Apache version for known CVEs (2.4.38 has several)" },
      { service: "SSH", description: "5. Try SSH with discovered usernames and common passwords as fallback" },
    ],
    iteration: 3,
  },
];

function TerminalBlock({ text, maxHeight = "200px" }) {
  return (
    <pre
      style={{
        background: "#0a0a0a",
        color: "#00ff88",
        fontFamily: "'Courier New', monospace",
        fontSize: "11px",
        padding: "12px",
        borderRadius: "4px",
        overflowY: "auto",
        maxHeight,
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        border: "1px solid #1a2a1a",
      }}
    >
      {text}
    </pre>
  );
}

function AgentThought({ text }) {
  if (!text) return null;
  return (
    <div
      style={{
        background: "#0d1117",
        border: "1px solid #30363d",
        borderLeft: "3px solid #58a6ff",
        borderRadius: "4px",
        padding: "10px 14px",
        marginBottom: "10px",
        color: "#8b949e",
        fontSize: "13px",
        fontStyle: "italic",
        lineHeight: "1.5",
      }}
    >
      💭 {text}
    </div>
  );
}

function ToolStep({ step, index }) {
  const [expanded, setExpanded] = useState(true);
  const color = TOOL_COLORS[step.tool] || "#aaaaaa";
  const icon = TOOL_ICONS[step.tool] || "⚙️";

  const cmdStr =
    step.tool === "run_nmap"
      ? `nmap ${step.input.flags} ${step.input.target}`
      : step.tool === "run_gobuster"
      ? `gobuster dir -u ${step.input.target} -w ${step.input.wordlist}${step.input.extensions ? " -x " + step.input.extensions : ""}`
      : step.tool === "run_enum4linux"
      ? `enum4linux ${step.input.flags || "-a"} ${step.input.target}`
      : step.tool === "run_ffuf"
      ? `ffuf -u ${step.input.url} -w ${step.input.wordlist}`
      : step.input.command || JSON.stringify(step.input);

  return (
    <div
      style={{
        marginBottom: "16px",
        border: `1px solid ${color}22`,
        borderRadius: "6px",
        overflow: "hidden",
      }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          background: "#0d1117",
          padding: "10px 14px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: "14px" }}>{icon}</span>
        <span
          style={{
            color,
            fontFamily: "monospace",
            fontSize: "12px",
            fontWeight: "bold",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {step.tool.replace("run_", "")}
        </span>
        <span
          style={{
            color: "#484f58",
            fontFamily: "monospace",
            fontSize: "11px",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {cmdStr}
        </span>
        <span style={{ color: "#484f58", fontSize: "11px" }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: "12px", background: "#010409" }}>
          {step.agent_reasoning && (
            <AgentThought text={step.agent_reasoning} />
          )}
          <div
            style={{
              marginBottom: "6px",
              color: "#484f58",
              fontSize: "11px",
              fontFamily: "monospace",
            }}
          >
            $ {cmdStr}
          </div>
          <TerminalBlock text={step.output} />
        </div>
      )}
    </div>
  );
}

function FinishStep({ step, onDownloadReport }) {
  return (
    <div
      style={{
        border: "1px solid #00ff8844",
        borderRadius: "6px",
        overflow: "hidden",
        marginBottom: "16px",
      }}
    >
      <div
        style={{
          background: "#001a0d",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <span>✅</span>
        <span
          style={{
            color: "#00ff88",
            fontFamily: "monospace",
            fontSize: "12px",
            fontWeight: "bold",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Recon Complete
        </span>
      </div>
      <div style={{ padding: "16px", background: "#010409" }}>
        {step.agent_reasoning && (
          <AgentThought text={step.agent_reasoning} />
        )}
        <div style={{ marginBottom: "16px" }}>
          <div
            style={{
              color: "#58a6ff",
              fontSize: "12px",
              fontWeight: "bold",
              marginBottom: "8px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Summary
          </div>
          <p
            style={{
              color: "#c9d1d9",
              fontSize: "13px",
              lineHeight: "1.6",
              margin: 0,
            }}
          >
            {step.summary}
          </p>
        </div>
        <div style={{ marginBottom: "20px" }}>
          <div
            style={{
              color: "#ff6e40",
              fontSize: "12px",
              fontWeight: "bold",
              marginBottom: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Attack Vectors
          </div>
          {step.attack_vectors.map((v, i) => (
            <div
              key={i}
              style={{
                background: "#0d1117",
                border: "1px solid #30363d",
                borderRadius: "4px",
                padding: "10px 14px",
                marginBottom: "8px",
                color: "#c9d1d9",
                fontSize: "13px",
                fontFamily: "monospace",
                lineHeight: "1.5",
              }}
            >
              {typeof v === 'object' ? (
                <>
                  {v.service && <strong style={{ color: "#58a6ff" }}>[{v.service}] </strong>}
                  {v.description}
                </>
              ) : (
                v
              )}
            </div>
          ))}
        </div>
        <button
          onClick={onDownloadReport}
          style={{
            background: "#238636",
            color: "#fff",
            padding: "8px 16px",
            borderRadius: "4px",
            border: "none",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: "600",
            fontFamily: "monospace",
          }}
        >
          📥 Download JSON Report
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [target, setTarget] = useState("");
  const [scopeNotes, setScopeNotes] = useState("");
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState([]);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("live"); // 'live' or 'demo'
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [steps]);

  const runDemo = async () => {
    setSteps([]);
    setError("");
    setRunning(true);

    for (const step of MOCK_STEPS) {
      await new Promise((r) => setTimeout(r, 1200));
      setSteps((prev) => [...prev, step]);
    }
    setRunning(false);
  };

  const runLive = async () => {
    if (!target.match(/^10\.\d+\.\d+\.\d+$/)) {
      setError("Target must be a 10.x.x.x HTB IP address");
      return;
    }
    setSteps([]);
    setError("");
    setRunning(true);

    try {
      const res = await fetch("http://localhost:5000/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, scope_notes: scopeNotes }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setSteps(data.steps || []);
      }
    } catch (e) {
      setError(
        "Cannot reach backend. Make sure htb_agent_backend.py is running on localhost:5000"
      );
    }
    setRunning(false);
  };

  const downloadReport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(steps, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "htb_recon_report.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div
      style={{
        background: "#010409",
        minHeight: "100vh",
        color: "#c9d1d9",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        padding: "24px",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: running ? "#ff6e40" : "#00ff88",
              boxShadow: running
                ? "0 0 8px #ff6e40"
                : "0 0 8px #00ff88",
              animation: running ? "pulse 1s infinite" : "none",
            }}
          />
          <h1
            style={{
              margin: 0,
              fontSize: "18px",
              fontWeight: "700",
              color: "#e6edf3",
              letterSpacing: "-0.02em",
            }}
          >
            HTB Recon Agent
          </h1>
        </div>
        <p style={{ margin: 0, fontSize: "13px", color: "#484f58" }}>
          AI-driven autonomous recon for HackTheBox lab machines
        </p>
      </div>

      {/* Mode toggle */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "20px",
          background: "#0d1117",
          border: "1px solid #30363d",
          borderRadius: "6px",
          padding: "4px",
          width: "fit-content",
        }}
      >
        {["live", "demo"].map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              background: mode === m ? "#21262d" : "transparent",
              color: mode === m ? "#e6edf3" : "#484f58",
              border: "none",
              borderRadius: "4px",
              padding: "6px 16px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: mode === m ? "600" : "400",
              textTransform: "capitalize",
            }}
          >
            {m === "live" ? "🔴 Live" : "▶ Demo"}
          </button>
        ))}
      </div>

      {/* Input panel */}
      <div
        style={{
          background: "#0d1117",
          border: "1px solid #30363d",
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "24px",
        }}
      >
        {mode === "live" ? (
          <>
            <div style={{ marginBottom: "14px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  color: "#8b949e",
                  marginBottom: "6px",
                  fontFamily: "monospace",
                }}
              >
                TARGET IP (HTB only — 10.x.x.x)
              </label>
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="10.10.10.100"
                style={{
                  width: "100%",
                  background: "#010409",
                  border: "1px solid #30363d",
                  borderRadius: "4px",
                  padding: "10px 12px",
                  color: "#00ff88",
                  fontFamily: "monospace",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  color: "#8b949e",
                  marginBottom: "6px",
                  fontFamily: "monospace",
                }}
              >
                SCOPE NOTES (optional)
              </label>
              <input
                value={scopeNotes}
                onChange={(e) => setScopeNotes(e.target.value)}
                placeholder="e.g. Linux box, focus on web, ignore rabbit holes"
                style={{
                  width: "100%",
                  background: "#010409",
                  border: "1px solid #30363d",
                  borderRadius: "4px",
                  padding: "10px 12px",
                  color: "#c9d1d9",
                  fontFamily: "monospace",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div
              style={{
                background: "#161b22",
                border: "1px solid #21262d",
                borderRadius: "4px",
                padding: "10px 14px",
                marginBottom: "16px",
                fontSize: "12px",
                color: "#8b949e",
                lineHeight: "1.6",
              }}
            >
              ⚠️ Requires <code style={{ color: "#58a6ff" }}>htb_agent_backend.py</code> running on your Kali machine at{" "}
              <code style={{ color: "#58a6ff" }}>localhost:5000</code>. Set{" "}
              <code style={{ color: "#58a6ff" }}>ANTHROPIC_API_KEY</code> in your environment first.
            </div>
            <button
              onClick={runLive}
              disabled={running || !target}
              style={{
                background: running ? "#1a2a1a" : "#00ff8822",
                color: running ? "#484f58" : "#00ff88",
                border: `1px solid ${running ? "#30363d" : "#00ff8866"}`,
                borderRadius: "6px",
                padding: "10px 24px",
                cursor: running || !target ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: "600",
                fontFamily: "monospace",
              }}
            >
              {running ? "Running..." : "▶ Start Recon"}
            </button>
          </>
        ) : (
          <>
            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "#8b949e", lineHeight: "1.6" }}>
              Simulates a recon run against a fictional target (10.10.10.100) so you can see how the agent works before deploying the real backend.
            </p>
            <button
              onClick={runDemo}
              disabled={running}
              style={{
                background: running ? "#1a1a2a" : "#00cfff22",
                color: running ? "#484f58" : "#00cfff",
                border: `1px solid ${running ? "#30363d" : "#00cfff66"}`,
                borderRadius: "6px",
                padding: "10px 24px",
                cursor: running ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: "600",
                fontFamily: "monospace",
              }}
            >
              {running ? "Running demo..." : "▶ Run Demo"}
            </button>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            background: "#2d1b1b",
            border: "1px solid #ff000044",
            borderRadius: "6px",
            padding: "12px 16px",
            marginBottom: "16px",
            color: "#ff6b6b",
            fontSize: "13px",
            fontFamily: "monospace",
          }}
        >
          ❌ {error}
        </div>
      )}

      {/* Steps */}
      {steps.length > 0 && (
        <div>
          <div
            style={{
              fontSize: "12px",
              color: "#484f58",
              fontFamily: "monospace",
              marginBottom: "14px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            — Agent Output ({steps.length} step{steps.length !== 1 ? "s" : ""}) —
          </div>
          {steps.map((step, i) =>
            step.type === "finish" ? (
              <FinishStep key={i} step={step} onDownloadReport={downloadReport} />
            ) : (
              <ToolStep key={i} step={step} index={i} />
            )
          )}
        </div>
      )}

      {/* Running indicator */}
      {running && steps.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            color: "#484f58",
            fontSize: "13px",
            fontFamily: "monospace",
            padding: "12px 0",
          }}
        >
          <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⠋</span>
          Agent working...
        </div>
      )}

      <div ref={bottomRef} />

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input::placeholder { color: #30363d; }
      `}</style>
    </div>
  );
}