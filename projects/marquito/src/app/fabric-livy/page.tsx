"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useThemeContext } from "@/components/ThemeProvider";
import LivyConnectionStatus from "@/components/LivyConnectionStatus";
import LivyDashboard from "@/components/LivyDashboard";
import {
  PlugConnected20Regular,
  Database20Regular,
  Key20Regular,
  ArrowRight20Regular,
} from "@fluentui/react-icons";
import {
  ConnectionPhase,
  LivyConfig,
  KpiResult,
  DeltaCommitEntry,
  UberLineage,
} from "@/lib/livy/types";

interface DashboardData {
  tables: { database: string; table: string; fqn: string }[];
  kpis: KpiResult[];
  commits: Map<string, DeltaCommitEntry[]>;
  lineage: UberLineage;
}

export default function FabricLivyPage() {
  const { isDark } = useThemeContext();
  const [mode, setMode] = useState<"choose" | "connect" | "dashboard">(
    "choose",
  );
  const [jwt, setJwt] = useState("");
  const [workspaceId, setWorkspaceId] = useState(
    "3ea60ae5-e979-4d31-a317-66491ab497fb",
  );
  const [lakehouseId, setLakehouseId] = useState(
    "4d8783be-e822-46d0-82e4-9b77c7f33992",
  );
  const [userSessionId, setUserSessionId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectionPhase, setConnectionPhase] =
    useState<ConnectionPhase>("idle");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [sessionWarning, setSessionWarning] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);

  // Restore session from sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem("marquito-livy-session");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.sessionId) setSessionId(parsed.sessionId);
        if (parsed.workspaceId) setWorkspaceId(parsed.workspaceId);
        if (parsed.lakehouseId) setLakehouseId(parsed.lakehouseId);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const config: LivyConfig | null =
    jwt && workspaceId && lakehouseId
      ? { jwt, workspaceId, lakehouseId }
      : null;

  const handleConnect = useCallback(async () => {
    if (!config) return;

    abortRef.current = new AbortController();
    setConnectionPhase("creating_session");
    setConnectionMessage("Creating new Spark session...");
    setConnectionError(null);

    try {
      // Import dynamically to avoid SSR issues
      const { connectWithRetry } = await import("@/lib/livy/client");
      const { fetchAllKpis } = await import("@/lib/livy/deltalog");
      const { buildUberLineage } = await import("@/lib/livy/lineage");

      // Only reuse a session if the user explicitly provided one
      const cachedSession = userSessionId.trim() ? userSessionId.trim() : null;
      const result = await connectWithRetry(config, cachedSession, (msg) => {
        setConnectionMessage(msg);
        if (msg.includes("Waiting")) setConnectionPhase("polling_session");
        if (msg.includes("reused")) setConnectionPhase("session_ready");
      });

      const sid = typeof result === "string" ? result : result.sessionId;
      const warning = typeof result === "object" ? result.warning : undefined;
      if (warning) setSessionWarning(warning);

      setSessionId(sid);
      sessionStorage.setItem(
        "marquito-livy-session",
        JSON.stringify({
          sessionId: sid,
          workspaceId: config.workspaceId,
          lakehouseId: config.lakehouseId,
        }),
      );

      setConnectionPhase("session_ready");
      setConnectionMessage("Session ready. Loading data...");

      // Load KPIs and lineage
      setConnectionPhase("loading_data");
      const [kpiData, lineageData] = await Promise.all([
        fetchAllKpis(config, sid, (msg) => setConnectionMessage(msg)),
        buildUberLineage(config, sid, (msg) => setConnectionMessage(msg)),
      ]);

      setDashboardData({
        tables: kpiData.tables,
        kpis: kpiData.kpis,
        commits: kpiData.commits,
        lineage: lineageData,
      });

      setConnectionPhase("connected");
      setConnectionMessage("Connected");
      setMode("dashboard");
    } catch (err) {
      setConnectionPhase("error");
      setConnectionError(err instanceof Error ? err.message : String(err));
      setConnectionMessage("Connection failed");
    }
  }, [config, sessionId]);

  const cardBase: React.CSSProperties = {
    backgroundColor: isDark ? "#252423" : "#FFFFFF",
    border: `1px solid ${isDark ? "#323130" : "#EDEBE9"}`,
    borderRadius: "8px",
    padding: "24px",
    cursor: "pointer",
    transition: "border-color 0.15s, box-shadow 0.15s",
    fontFamily: "'Segoe UI', sans-serif",
  };

  const cardHover = (e: React.MouseEvent, enter: boolean) => {
    const el = e.currentTarget as HTMLElement;
    if (enter) {
      el.style.borderColor = "#0078D4";
      el.style.boxShadow = "0 0 0 1px #0078D4";
    } else {
      el.style.borderColor = isDark ? "#323130" : "#EDEBE9";
      el.style.boxShadow = "none";
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    fontSize: "13px",
    fontFamily: "'Cascadia Code', 'Consolas', monospace",
    backgroundColor: isDark ? "#1B1A19" : "#FAF9F8",
    color: isDark ? "#FAF9F8" : "#323130",
    border: `1px solid ${isDark ? "#484644" : "#C8C6C4"}`,
    borderRadius: "4px",
    outline: "none",
  };

  // Mode: Choose
  if (mode === "choose") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "calc(100vh - 96px)",
          padding: "48px 24px",
          fontFamily: "'Segoe UI', sans-serif",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/fabric.svg"
          alt="Microsoft Fabric"
          width={48}
          height={48}
          style={{ marginBottom: "16px" }}
        />
        <h1
          style={{
            fontSize: "28px",
            fontWeight: 600,
            color: isDark ? "#FAF9F8" : "#323130",
            marginBottom: "8px",
          }}
        >
          Fabric Livy
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: isDark ? "#A19F9D" : "#605E5C",
            marginBottom: "32px",
            textAlign: "center",
            maxWidth: "560px",
            lineHeight: "1.5",
          }}
        >
          Connect to a Microsoft Fabric Lakehouse via the Livy API to monitor
          Delta table health and visualize data lineage.
        </p>

        <div
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: isDark ? "#A19F9D" : "#605E5C",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: "12px",
            maxWidth: "600px",
            width: "100%",
          }}
        >
          Choose an option
        </div>

        <div
          style={{
            display: "grid",
            gap: "16px",
            maxWidth: "600px",
            width: "100%",
          }}
        >
          {/* Option 1: Query Livy */}
          <div
            style={{ ...cardBase, borderLeft: "3px solid #0078D4" }}
            onClick={() => setMode("connect")}
            onMouseEnter={(e) => cardHover(e, true)}
            onMouseLeave={(e) => cardHover(e, false)}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "10px",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "8px",
                  backgroundColor: isDark
                    ? "rgba(0,120,212,0.15)"
                    : "rgba(0,120,212,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <PlugConnected20Regular style={{ color: "#0078D4" }} />
              </div>
              <div>
                <span
                  style={{
                    fontSize: "15px",
                    fontWeight: 600,
                    color: isDark ? "#FAF9F8" : "#323130",
                    display: "block",
                  }}
                >
                  Query Livy
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    color: isDark ? "#A19F9D" : "#605E5C",
                  }}
                >
                  Connect to your Fabric Lakehouse and run live queries
                </span>
              </div>
            </div>

            {/* Pre-requisites */}
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: isDark ? "#1B1A19" : "#FAF9F8",
                border: `1px solid ${isDark ? "#3D3B39" : "#E1DFDD"}`,
                borderRadius: "6px",
                padding: "14px 16px",
                marginTop: "4px",
                cursor: "default",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: isDark ? "#A19F9D" : "#605E5C",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: "10px",
                }}
              >
                Pre-requisites
              </div>
              <ol
                style={{
                  fontSize: "12px",
                  color: isDark ? "#D2D0CE" : "#323130",
                  lineHeight: "1.7",
                  paddingLeft: "18px",
                  margin: 0,
                }}
              >
                <li style={{ marginBottom: "8px" }}>
                  Setup a Fabric Lakehouse called{" "}
                  <code
                    style={{
                      fontSize: "11px",
                      backgroundColor: isDark ? "#323130" : "#F3F2F1",
                      padding: "1px 4px",
                      borderRadius: "3px",
                    }}
                  >
                    data_ops_inventory_db
                  </code>
                  {" — "}
                  <a
                    href="https://github.com/mdrakiburrahman/spark-sandbox/tree/main/projects/fabric/template/sandbox/data_ops_inventory_db.Lakehouse"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "#0078D4",
                      textDecoration: "none",
                      fontSize: "11px",
                    }}
                  >
                    view template
                  </a>
                </li>
                <li>
                  <span>Hydrate 4 tables: </span>
                  {[
                    "commit_history",
                    "kpi_results",
                    "openlineage",
                    "table_snapshots",
                  ].map((t, i) => (
                    <span key={t}>
                      <code
                        style={{
                          fontSize: "11px",
                          backgroundColor: isDark ? "#323130" : "#F3F2F1",
                          padding: "1px 4px",
                          borderRadius: "3px",
                        }}
                      >
                        {t}
                      </code>
                      {i < 3 ? ", " : ""}
                    </span>
                  ))}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/fabric-marquito-pre-reqs.png"
                    alt="Fabric Lakehouse tables"
                    style={{
                      display: "block",
                      marginTop: "8px",
                      marginBottom: "8px",
                      maxWidth: "280px",
                      borderRadius: "4px",
                      border: `1px solid ${isDark ? "#3D3B39" : "#E1DFDD"}`,
                    }}
                  />
                  <span
                    style={{
                      fontSize: "11px",
                      color: isDark ? "#A19F9D" : "#605E5C",
                    }}
                  >
                    See{" "}
                    <a
                      href="https://github.com/mdrakiburrahman/spark-sandbox/blob/main/projects/spark-scala/spark-demo/src/main/scala/me/rakirahman/sparkdemo/etl/drivers/demos/DemoLineageExtractor.scala"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#0078D4", textDecoration: "none" }}
                    >
                      DemoLineageExtractor
                    </a>
                    {" and "}
                    <a
                      href="https://github.com/mdrakiburrahman/spark-sandbox/blob/main/projects/spark-scala/spark-demo/src/main/scala/me/rakirahman/sparkdemo/etl/drivers/demos/DemoDeltaLogMonitor.scala"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#0078D4", textDecoration: "none" }}
                    >
                      DemoDeltaLogMonitor
                    </a>
                    {" to hydrate these tables."}
                  </span>
                </li>
              </ol>
            </div>
          </div>

          {/* Option 2: Demo Dataset */}
          <div
            style={{ ...cardBase, borderLeft: "3px solid #107C10" }}
            onClick={async () => {
              try {
                const [tablesRes, lineageRes, kpisRes, commitsRes] =
                  await Promise.all([
                    fetch("/livy-tables.json"),
                    fetch("/livy-uber-lineage.json"),
                    fetch("/livy-kpis.json"),
                    fetch("/livy-commits.json"),
                  ]);
                const tables = await tablesRes.json();
                const lineage = await lineageRes.json();
                const kpis = await kpisRes.json();
                const commitsObj = await commitsRes.json();
                const commits = new Map<string, DeltaCommitEntry[]>();
                for (const [fqn, entries] of Object.entries(commitsObj)) {
                  commits.set(fqn, entries as DeltaCommitEntry[]);
                }
                setDashboardData({ tables, kpis, commits, lineage });
                setMode("dashboard");
              } catch (err) {
                setConnectionError(
                  err instanceof Error ? err.message : String(err),
                );
              }
            }}
            onMouseEnter={(e) => cardHover(e, true)}
            onMouseLeave={(e) => cardHover(e, false)}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "10px",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "8px",
                  backgroundColor: isDark
                    ? "rgba(16,124,16,0.15)"
                    : "rgba(16,124,16,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Database20Regular style={{ color: "#107C10" }} />
              </div>
              <div>
                <span
                  style={{
                    fontSize: "15px",
                    fontWeight: 600,
                    color: isDark ? "#FAF9F8" : "#323130",
                    display: "block",
                  }}
                >
                  Sample data snapshot
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    color: isDark ? "#A19F9D" : "#605E5C",
                  }}
                >
                  Don&apos;t want to setup the infra above right now? Use this
                  pre-captured snapshot to explore the dashboard — 44 tables, 71
                  lineage edges, 248 column edges
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Mode: Connect
  if (mode === "connect" && connectionPhase === "idle") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "calc(100vh - 96px)",
          padding: "48px 24px",
          fontFamily: "'Segoe UI', sans-serif",
        }}
      >
        <h1
          style={{
            fontSize: "24px",
            fontWeight: 600,
            color: isDark ? "#FAF9F8" : "#323130",
            marginBottom: "8px",
          }}
        >
          Connect to Fabric Livy
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: isDark ? "#A19F9D" : "#605E5C",
            marginBottom: "24px",
            textAlign: "center",
            maxWidth: "520px",
            lineHeight: "1.5",
          }}
        >
          Provide your Azure credentials to connect to a Fabric Lakehouse via
          the Livy API.
        </p>

        <div
          style={{
            maxWidth: "520px",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          {/* JWT */}
          <div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "13px",
                fontWeight: 600,
                color: isDark ? "#D2D0CE" : "#323130",
                marginBottom: "6px",
              }}
            >
              <Key20Regular style={{ color: "#0078D4" }} />
              JWT Token
            </label>
            <div
              style={{
                backgroundColor: isDark ? "#252423" : "#FFFFFF",
                border: `1px solid ${isDark ? "#323130" : "#EDEBE9"}`,
                borderRadius: "6px",
                padding: "10px 12px",
                marginBottom: "8px",
                fontSize: "11px",
                color: isDark ? "#A19F9D" : "#605E5C",
                fontFamily: "'Cascadia Code', 'Consolas', monospace",
                lineHeight: "1.6",
              }}
            >
              Run this to get your token:
              <br />
              <code style={{ color: "#0078D4" }}>
                az account get-access-token --resource
                &quot;https://analysis.windows.net/powerbi/api&quot; --query
                accessToken -o tsv
              </code>
            </div>
            <input
              type="password"
              placeholder="eyJ0eX..."
              value={jwt}
              onChange={(e) => setJwt(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Workspace ID */}
          <div>
            <label
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: isDark ? "#D2D0CE" : "#323130",
                marginBottom: "6px",
                display: "block",
              }}
            >
              Workspace ID
            </label>
            <p
              style={{
                fontSize: "11px",
                color: isDark ? "#605E5C" : "#A19F9D",
                marginBottom: "6px",
              }}
            >
              GUID from your Fabric workspace URL
            </p>
            <input
              type="text"
              placeholder="58374f03-58b3-48f8-ae96-758f86aed72d"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Lakehouse ID */}
          <div>
            <label
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: isDark ? "#D2D0CE" : "#323130",
                marginBottom: "6px",
                display: "block",
              }}
            >
              Lakehouse ID
            </label>
            <p
              style={{
                fontSize: "11px",
                color: isDark ? "#605E5C" : "#A19F9D",
                marginBottom: "6px",
              }}
            >
              GUID from your Fabric lakehouse URL
            </p>
            <input
              type="text"
              placeholder="0a12ccdc-ed45-478d-9c1b-1497b2bf2bfd"
              value={lakehouseId}
              onChange={(e) => setLakehouseId(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Session ID (optional) */}
          <div>
            <label
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: isDark ? "#D2D0CE" : "#323130",
                marginBottom: "6px",
                display: "block",
              }}
            >
              Session ID{" "}
              <span
                style={{
                  fontWeight: 400,
                  fontSize: "11px",
                  color: isDark ? "#605E5C" : "#A19F9D",
                }}
              >
                (optional)
              </span>
            </label>
            <p
              style={{
                fontSize: "11px",
                color: isDark ? "#605E5C" : "#A19F9D",
                marginBottom: "6px",
              }}
            >
              Reuse an existing Livy session. If invalid, a new session will be
              created.
            </p>
            <input
              type="text"
              placeholder="9257840e-21df-4e70-a740-089df6264492"
              value={userSessionId}
              onChange={(e) => setUserSessionId(e.target.value)}
              style={inputStyle}
            />
          </div>

          <button
            onClick={handleConnect}
            disabled={!jwt || !workspaceId || !lakehouseId}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "10px 20px",
              backgroundColor:
                jwt && workspaceId && lakehouseId
                  ? "#0078D4"
                  : isDark
                    ? "#484644"
                    : "#C8C6C4",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: 600,
              fontFamily: "'Segoe UI', sans-serif",
              cursor:
                jwt && workspaceId && lakehouseId ? "pointer" : "not-allowed",
              transition: "background-color 0.15s",
              marginTop: "8px",
            }}
          >
            <ArrowRight20Regular />
            Connect
          </button>

          <button
            onClick={() => {
              setMode("choose");
              setConnectionPhase("idle");
            }}
            style={{
              padding: "8px 16px",
              backgroundColor: "transparent",
              color: isDark ? "#A19F9D" : "#605E5C",
              border: `1px solid ${isDark ? "#484644" : "#EDEBE9"}`,
              borderRadius: "6px",
              fontSize: "13px",
              fontFamily: "'Segoe UI', sans-serif",
              cursor: "pointer",
            }}
          >
            ← Back to options
          </button>
        </div>
      </div>
    );
  }

  // Mode: Connecting (status animation)
  if (mode === "connect" && connectionPhase !== "idle") {
    return (
      <LivyConnectionStatus
        phase={connectionPhase}
        message={connectionMessage}
        error={connectionError}
        sessionWarning={sessionWarning}
        onRetry={() => {
          setConnectionPhase("idle");
          setConnectionError(null);
          setSessionWarning(null);
        }}
        onBack={() => {
          abortRef.current?.abort();
          setMode("choose");
          setConnectionPhase("idle");
          setConnectionError(null);
          setSessionWarning(null);
        }}
      />
    );
  }

  // Mode: Dashboard
  if (mode === "dashboard" && dashboardData) {
    return (
      <LivyDashboard
        data={dashboardData}
        onDisconnect={() => {
          setMode("choose");
          setConnectionPhase("idle");
          setDashboardData(null);
        }}
      />
    );
  }

  return null;
}
