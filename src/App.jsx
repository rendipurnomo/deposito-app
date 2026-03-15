import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/* ═══════════════════════════════════════════════════════════════════
   CONFIG — Update this URL after pushing to your GitHub repo
   Format: https://raw.githubusercontent.com/USERNAME/REPO/main/scraper/bank_rates.json
═══════════════════════════════════════════════════════════════════ */
const RATES_JSON_URL = "/bank_rates.json"; // relative path when hosted on same repo via Pages

const BANK_LINKS = {
  bri: {
    web: "https://bri.co.id",
    ios: "https://apps.apple.com/id/app/brimo/id1169536375",
    android: "https://play.google.com/store/apps/details?id=com.bri.brimo",
  },
  bca: {
    web: "https://mybca.bca.co.id",
    ios: "https://apps.apple.com/id/app/mybca/id1439966261",
    android: "https://play.google.com/store/apps/details?id=com.bca",
  },
  mandiri: {
    web: "https://livin.mandiri",
    ios: "https://apps.apple.com/id/app/livin-by-mandiri/id1570884921",
    android:
      "https://play.google.com/store/apps/details?id=com.bankmandiri.livin",
  },
  bni: {
    web: "https://www.bni.co.id",
    ios: "https://apps.apple.com/id/app/bni-mobile-banking/id568062340",
    android: "https://play.google.com/store/apps/details?id=src.com.bni",
  },
  seabank: {
    web: "https://www.seabank.co.id",
    ios: "https://apps.apple.com/id/app/seabank/id1559447666",
    android:
      "https://play.google.com/store/apps/details?id=com.seamoney.seabank",
  },
  bankjago: {
    web: "https://www.jago.com",
    ios: "https://apps.apple.com/id/app/bank-jago/id1493180931",
    android: "https://play.google.com/store/apps/details?id=com.jagomobile",
  },
  blu: {
    web: "https://blubybcadigital.id",
    ios: "https://apps.apple.com/id/app/blu-by-bca-digital/id1557049665",
    android:
      "https://play.google.com/store/apps/details?id=id.co.bcadigital.blu",
  },
  neobank: {
    web: "https://www.neobank.id",
    ios: "https://apps.apple.com/id/app/neobank/id1542859048",
    android: "https://play.google.com/store/apps/details?id=id.co.neo.mobile",
  },
  krom: {
    web: "https://www.krombank.id",
    ios: "https://apps.apple.com/id/app/krom-bank/id6444120082",
    android: "https://play.google.com/store/apps/details?id=id.krom.mobile",
  },
  allo: {
    web: "https://www.allobank.com",
    ios: "https://apps.apple.com/id/app/allo-bank/id1581696274",
    android: "https://play.google.com/store/apps/details?id=com.allo.allobank",
  },
  amar: {
    web: "https://www.amarbank.co.id",
    ios: "https://apps.apple.com/id/app/senyumku/id1439934139",
    android:
      "https://play.google.com/store/apps/details?id=id.co.amarbank.senyumku",
  },
  superbank: {
    web: "https://www.superbank.id",
    ios: "https://apps.apple.com/id/app/superbank/id6450899626",
    android: "https://play.google.com/store/apps/details?id=id.co.superbank",
  },
  jenius: {
    web: "https://www.jenius.com",
    ios: "https://apps.apple.com/id/app/jenius/id1087210607",
    android: "https://play.google.com/store/apps/details?id=com.btpn.dc",
  },
  digibank: {
    web: "https://www.dbs.id/digibank",
    ios: "https://apps.apple.com/id/app/digibank-by-dbs/id1059566836",
    android:
      "https://play.google.com/store/apps/details?id=com.dbs.id.digibankindonesia",
  },
};

const LPS_LIMIT_BANK_UMUM = 3.5;
const LPS_LIMIT_BPR = 6.75;

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════ */
const idr = (v, compact = false) => {
  const n = Math.round(v);
  if (compact) {
    if (n >= 1e12) return "Rp " + (n / 1e12).toFixed(2) + "T";
    if (n >= 1e9) return "Rp " + (n / 1e9).toFixed(2) + "M";
    if (n >= 1e6) return "Rp " + (n / 1e6).toFixed(1) + "jt";
    if (n >= 1e3) return "Rp " + (n / 1e3).toFixed(0) + "rb";
  }
  return "Rp " + n.toLocaleString("id-ID");
};
const pct = (v, dec = 2) => Number(v).toFixed(dec) + "%";

/* ═══════════════════════════════════════════════════════════════════
   RESPONSIVE HOOK
═══════════════════════════════════════════════════════════════════ */
function useBreakpoint() {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1024,
  );
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return { isMobile: width < 640, isTablet: width < 900, width };
}

/* ═══════════════════════════════════════════════════════════════════
   DATA FETCHING HOOK
═══════════════════════════════════════════════════════════════════ */
function useBankRates() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [source, setSource] = useState(null); // 'live' | 'fallback'

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(RATES_JSON_URL, { cache: "no-cache" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setSource("live");
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        // Fallback: try bundled copy
        fetch("/scraper/bank_rates.json")
          .then((r) => r.json())
          .then((json) => {
            if (cancelled) return;
            setData(json);
            setSource("fallback");
            setLoading(false);
          })
          .catch(() => {
            if (cancelled) return;
            setError("Gagal memuat data bank. Coba refresh halaman.");
            setLoading(false);
          });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error, source };
}

/* ═══════════════════════════════════════════════════════════════════
   COMPOUND INTEREST CALC
═══════════════════════════════════════════════════════════════════ */
function compute(principal, monthly, rate, duration) {
  const r = rate / 100;
  const rows = [];
  let balance = principal;
  let cumInterest = 0;
  for (let i = 1; i <= duration; i++) {
    const totalContrib = principal + i * monthly;
    const interestThisMonth = balance * r;
    balance = balance + interestThisMonth + monthly;
    cumInterest += interestThisMonth;
    rows.push({
      month: i,
      setoran: i === 1 ? principal + monthly : monthly,
      interestThisMonth,
      balance,
      totalContrib,
      cumInterest,
      roiCumulative: (cumInterest / totalContrib) * 100,
    });
  }
  const ear = (Math.pow(1 + r, 12) - 1) * 100;
  const last = rows[rows.length - 1];
  return {
    rows,
    ear,
    totalContrib: last.totalContrib,
    cumInterest: last.cumInterest,
    finalBalance: last.balance,
    roiFinal: last.roiCumulative,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   UI ATOMS
═══════════════════════════════════════════════════════════════════ */
function InfoTip({ text }) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        marginLeft: 4,
      }}
    >
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow((s) => !s)}
        style={{
          width: 15,
          height: 15,
          borderRadius: "50%",
          background: "var(--bg-hover)",
          border: "1px solid var(--border-strong)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "help",
          fontSize: 9,
          color: "var(--text-muted)",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        ?
      </span>
      {show && (
        <span
          style={{
            position: "absolute",
            bottom: "130%",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1c2521",
            border: "1px solid var(--border-strong)",
            borderRadius: 10,
            padding: "10px 13px",
            fontSize: 12,
            color: "var(--text-secondary)",
            width: 200,
            lineHeight: 1.55,
            zIndex: 300,
            boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
            pointerEvents: "none",
            whiteSpace: "normal",
            textAlign: "left",
            fontWeight: 400,
          }}
        >
          {text}
          <span
            style={{
              position: "absolute",
              top: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: "5px solid #1c2521",
            }}
          />
        </span>
      )}
    </span>
  );
}

function LpsBadge({ bunga_pa, lps_limit }) {
  const safe = bunga_pa <= lps_limit;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        padding: "3px 8px",
        borderRadius: 99,
        fontWeight: 600,
        background: safe ? "rgba(45,206,137,0.12)" : "rgba(255,180,0,0.12)",
        color: safe ? "#2dce89" : "#f7c600",
        border: `1px solid ${safe ? "rgba(45,206,137,0.3)" : "rgba(247,198,0,0.3)"}`,
      }}
    >
      {safe ? "✓ LPS Terjamin" : "⚠ Di atas LPS"}
    </span>
  );
}

function BprBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        padding: "3px 8px",
        borderRadius: 99,
        fontWeight: 600,
        background: "rgba(249,115,22,0.12)",
        color: "#f97316",
        border: "1px solid rgba(249,115,22,0.3)",
      }}
    >
      BPR
    </span>
  );
}

function BankLinkButtons({ bankId }) {
  const links = BANK_LINKS[bankId];
  if (!links) return null;
  const btnStyle = (color) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "7px 11px",
    borderRadius: 8,
    border: `1px solid ${color}33`,
    background: color + "11",
    color: color,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "none",
    flex: 1,
    justifyContent: "center",
  });
  return (
    <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
      <a
        href={links.web}
        target="_blank"
        rel="noopener noreferrer"
        style={btnStyle("#7d9e8c")}
      >
        🌐 Website
      </a>
      <a
        href={links.android}
        target="_blank"
        rel="noopener noreferrer"
        style={btnStyle("#3ddc84")}
      >
        ▶ Android
      </a>
      <a
        href={links.ios}
        target="_blank"
        rel="noopener noreferrer"
        style={btnStyle("#0071e3")}
      >
        iOS
      </a>
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 20px",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          border: "3px solid var(--border-strong)",
          borderTopColor: "var(--accent)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
        Memuat data bank...
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

function InstallBanner() {
  const [prompt, setPrompt] = useState(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setPrompt(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 72,
        left: 12,
        right: 12,
        zIndex: 80,
        background: "#161d1a",
        border: "1px solid var(--accent-border)",
        borderRadius: 14,
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        animation: "fadeUp 0.3s ease",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 9,
          background: "var(--accent-muted)",
          border: "1px solid var(--accent-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-primary)",
            marginBottom: 2,
          }}
        >
          Install DepositoPlus
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          Akses lebih cepat, bisa offline
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => setShow(false)}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text-muted)",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Nanti
        </button>
        <button
          onClick={() => {
            prompt?.prompt();
            setShow(false);
          }}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            border: "none",
            background: "var(--accent)",
            color: "#0a0e0d",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Install
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   NAVBAR — mobile hamburger aware
═══════════════════════════════════════════════════════════════════ */
function Navbar({ activeTab, setActiveTab }) {
  const { isMobile } = useBreakpoint();
  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 1rem",
        height: 66,
        background: "rgba(10,14,13,0.95)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        <img
          src="/logo.png"
          alt="DepositoPlus"
          style={{
            height: isMobile ? 120 : 58,
            width: "auto",
            objectFit: "contain",
          }}
        />
      </div>
    </nav>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SCREENER
═══════════════════════════════════════════════════════════════════ */
function Screener({
  bankData,
  lpsLimit,
  generatedAt,
  onSelectBank,
  selectedId,
}) {
  const { isMobile, isTablet } = useBreakpoint();
  const [filterTipe, setFilterTipe] = useState("Semua");
  const [filterLps, setFilterLps] = useState("Semua");
  const [sortBy, setSortBy] = useState("bunga_desc");
  const [minSetoran, setMinSetoran] = useState(0);
  const [expandedId, setExpandedId] = useState(null);

  const filtered = useMemo(() => {
    let d = [...bankData];
    if (filterTipe !== "Semua") d = d.filter((b) => b.tipe === filterTipe);
    if (filterLps === "Terjamin") d = d.filter((b) => b.bunga_pa <= lpsLimit);
    if (filterLps === "Tinggi") d = d.filter((b) => b.bunga_pa > lpsLimit);
    if (minSetoran > 0) d = d.filter((b) => b.setoran_min <= minSetoran);
    d.sort((a, b) => {
      if (sortBy === "bunga_desc") return b.bunga_pa - a.bunga_pa;
      if (sortBy === "bunga_asc") return a.bunga_pa - b.bunga_pa;
      if (sortBy === "setoran_asc") return a.setoran_min - b.setoran_min;
      return 0;
    });
    return d;
  }, [bankData, filterTipe, filterLps, sortBy, minSetoran, lpsLimit]);

  const fmtDate = (iso) => {
    try {
      return new Date(iso).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div
      style={{
        maxWidth: 1060,
        margin: "0 auto",
        padding: isMobile ? "20px 12px 80px" : "32px 2rem 80px",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1
          style={{
            fontFamily: "Playfair Display",
            fontSize: isMobile ? 14 : 32,
            fontWeight: 700,
            marginBottom: 6,
            color: "#939491",
          }}
        >
          Buat Uang Bekerja Lebih Keras daripada Kamu — <span style={{ color: "var(--accent)", fontWeight: 500, fontSize: isMobile ? 12 : 16 }}>Pilih deposito dengan bunga
          terbaik sesuai kebutuhanmu</span> 
        </h1>
        <h1
          style={{
            fontFamily: "Playfair Display",
            fontSize: isMobile ? 22 : 32,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          Screener Deposito{" "}
          <span style={{ color: "var(--accent)" }}>Indonesia</span>
        </h1>
        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          {bankData.length} bank terdaftar OJK & peserta LPS
          {generatedAt && <> · Diperbarui {fmtDate(generatedAt)}</>}
        </p>
      </div>

      {/* LPS info card */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "14px 16px",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            alignItems: "flex-start",
          }}
        >
          <div>
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: "14px 16px",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 20,
                  alignItems: "flex-start",
                }}
              >
                {/* Bank Umum */}
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-muted)",
                      letterSpacing: "0.07em",
                      marginBottom: 4,
                    }}
                  >
                    BATAS LPS — BANK UMUM
                  </div>
                  <div
                    style={{
                      fontFamily: "Playfair Display",
                      fontSize: 22,
                      fontWeight: 700,
                      color: "#2dce89",
                    }}
                  >
                    {lpsLimit}% p.a
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      marginTop: 2,
                    }}
                  >
                    Maks Rp2 miliar / nasabah / bank
                  </div>
                </div>
                <div
                  style={{
                    width: 1,
                    background: "var(--border)",
                    alignSelf: "stretch",
                  }}
                />
                {/* BPR */}
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-muted)",
                      letterSpacing: "0.07em",
                      marginBottom: 4,
                    }}
                  >
                    BATAS LPS — BPR
                  </div>
                  <div
                    style={{
                      fontFamily: "Playfair Display",
                      fontSize: 22,
                      fontWeight: 700,
                      color: "#f97316",
                    }}
                  >
                    6.75% p.a
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      marginTop: 2,
                    }}
                  >
                    Maks Rp2 miliar / nasabah / BPR
                  </div>
                </div>
                <div
                  style={{
                    width: 1,
                    background: "var(--border)",
                    alignSelf: "stretch",
                  }}
                />
                <div
                  style={{
                    flex: 1,
                    minWidth: 200,
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    lineHeight: 1.65,
                  }}
                >
                  <span style={{ color: "#2dce89", fontWeight: 600 }}>
                    ✓ Terjamin
                  </span>{" "}
                  — bunga di bawah batas LPS: pokok + bunga dijamin.{" "}
                  <span style={{ color: "#f7c600", fontWeight: 600 }}>
                    ⚠ Di atas LPS
                  </span>{" "}
                  — dana tidak dijamin LPS.{" "}
                  <span style={{ color: "#f97316", fontWeight: 600 }}>BPR</span>{" "}
                  — Bank Perkreditan Rakyat, batas LPS lebih tinggi namun
                  jangkauan terbatas per daerah.
                </div>
              </div>
            </div>
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 180,
              borderLeft: isMobile ? "none" : "1px solid var(--border)",
              borderTop: isMobile ? "1px solid var(--border)" : "none",
              paddingLeft: isMobile ? 0 : 16,
              paddingTop: isMobile ? 12 : 0,
            }}
          >
          </div>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: 16,
        }}
      >
        {/* Row 1 */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
              minWidth: 40,
            }}
          >
            Tipe:
          </span>
          {["Semua", "Konvensional", "Digital", "BPR"].map((t) => (
            <button
              key={t}
              onClick={() => setFilterTipe(t)}
              style={{
                padding: "5px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                cursor: "pointer",
                fontSize: 12,
                background:
                  filterTipe === t
                    ? t === "BPR"
                      ? "#f9731620"
                      : "var(--accent)"
                    : "var(--bg-input)",
                color:
                  filterTipe === t
                    ? t === "BPR"
                      ? "#f97316"
                      : "#0a0e0d"
                    : "var(--text-secondary)",
                fontWeight: filterTipe === t ? 600 : 400,
                borderColor:
                  filterTipe === t && t === "BPR"
                    ? "rgba(249,115,22,0.4)"
                    : undefined,
              }}
            >
              {t}
            </button>
          ))}
        </div>
        {/* Row 2 */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
              minWidth: 40,
            }}
          >
            LPS:
          </span>
          {[
            ["Semua", "Semua"],
            ["Terjamin", "✓ Terjamin"],
            ["Tinggi", "⚠ Bunga Tinggi"],
          ].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFilterLps(v)}
              style={{
                padding: "5px 12px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 12,
                transition: "all 0.15s",
                border: `1px solid ${filterLps === v ? (v === "Terjamin" ? "rgba(45,206,137,0.4)" : v === "Tinggi" ? "rgba(247,198,0,0.4)" : "var(--accent)") : "var(--border)"}`,
                background:
                  filterLps === v
                    ? v === "Terjamin"
                      ? "#1a4a30"
                      : v === "Tinggi"
                        ? "#4a3a00"
                        : "var(--accent)"
                    : "var(--bg-input)",
                color:
                  filterLps === v
                    ? v === "Terjamin"
                      ? "#2dce89"
                      : v === "Tinggi"
                        ? "#f7c600"
                        : "#0a0e0d"
                    : "var(--text-secondary)",
                fontWeight: filterLps === v ? 600 : 400,
              }}
            >
              {l}
            </button>
          ))}
        </div>
        {/* Row 3 */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
              minWidth: 40,
            }}
          >
            Dana:
          </span>
          {[
            [0, "Semua"],
            [1_000_000, "≤1jt"],
            [5_000_000, "≤5jt"],
            [10_000_000, "≤10jt"],
          ].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setMinSetoran(v)}
              style={{
                padding: "5px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                cursor: "pointer",
                fontSize: 12,
                transition: "all 0.15s",
                background:
                  minSetoran === v ? "var(--bg-hover)" : "var(--bg-input)",
                color:
                  minSetoran === v
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                borderColor:
                  minSetoran === v ? "var(--border-strong)" : "var(--border)",
              }}
            >
              {l}
            </button>
          ))}
          <div style={{ marginLeft: "auto" }}>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <option value="bunga_desc">Bunga ↓</option>
              <option value="bunga_asc">Bunga ↑</option>
              <option value="setoran_asc">Setoran min ↑</option>
            </select>
          </div>
        </div>
      </div>

      <div
        style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}
      >
        Menampilkan{" "}
        <strong style={{ color: "var(--text-secondary)" }}>
          {filtered.length}
        </strong>{" "}
        dari {bankData.length} bank
      </div>

      {/* Bank cards grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : isTablet
              ? "repeat(2,1fr)"
              : "repeat(3,1fr)",
          gap: 14,
        }}
      >
        {filtered.map((bank, idx) => {
          const safe = bank.bunga_pa <= lpsLimit;
          const selected = selectedId === bank.id;
          const expanded = expandedId === bank.id;
          const rank = sortBy === "bunga_desc" ? idx : null;

          return (
            <div
              key={bank.id}
              style={{
                background: "var(--bg-card)",
                border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 16,
                overflow: "hidden",
                transition: "all 0.2s",
                boxShadow: selected
                  ? "0 0 0 2px rgba(45,206,137,0.15)"
                  : "none",
                position: "relative",
              }}
            >
              {/* Color stripe */}
              <div style={{ height: 3, background: bank.warna }} />

              <div style={{ padding: "16px 16px 14px" }}>
                {/* Header row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 9,
                      background: bank.warna + "22",
                      border: `1px solid ${bank.warna}44`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      fontWeight: 800,
                      fontSize: 13,
                      color: bank.warna,
                    }}
                  >
                    {bank.nama.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 13,
                        color: "var(--text-primary)",
                        lineHeight: 1.3,
                        marginBottom: 4,
                      }}
                    >
                      {bank.nama}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 4,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <LpsBadge
                        bunga_pa={bank.bunga_pa}
                        lps_limit={bank.lps_tipe === "bpr" ? 6.75 : 3.5}
                      />
                      {bank.kategori === "BUMN" && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: "2px 7px",
                            borderRadius: 99,
                            background: "rgba(55,138,221,0.12)",
                            color: "#378add",
                            border: "1px solid rgba(55,138,221,0.3)",
                          }}
                        >
                          BUMN
                        </span>
                      )}
                      {bank.tipe === "BPR" && <BprBadge />}
                      {rank !== null && rank < 3 && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: "2px 6px",
                            borderRadius: 99,
                            background: [
                              "rgba(201,168,76,0.2)",
                              "rgba(158,158,158,0.15)",
                              "rgba(205,127,50,0.15)",
                            ][rank],
                            color: ["#c9a84c", "#9e9e9e", "#cd7f32"][rank],
                            border: "1px solid currentColor",
                            opacity: 0.9,
                          }}
                        >
                          #{rank + 1}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Rate + setoran */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 9,
                        color: "var(--text-muted)",
                        letterSpacing: "0.08em",
                        marginBottom: 2,
                      }}
                    >
                      BUNGA / TAHUN
                    </div>
                    <div
                      style={{
                        fontFamily: "Playfair Display",
                        fontSize: 30,
                        fontWeight: 700,
                        color: safe ? "var(--accent)" : "#f7c600",
                        lineHeight: 1,
                      }}
                    >
                      {bank.bunga_pa.toFixed(2)}
                      <span style={{ fontSize: 16 }}>%</span>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-muted)",
                        marginTop: 2,
                      }}
                    >
                      ≈ {(bank.bunga_pa / 12).toFixed(3)}%/bln
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: 9,
                        color: "var(--text-muted)",
                        letterSpacing: "0.08em",
                        marginBottom: 2,
                      }}
                    >
                      SETORAN MIN
                    </div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      {idr(bank.setoran_min, true)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {bank.metode_buka}
                    </div>
                  </div>
                </div>

                {/* Tenor chips */}
                <div
                  style={{
                    display: "flex",
                    gap: 5,
                    flexWrap: "wrap",
                    marginBottom: 12,
                  }}
                >
                  {bank.tenor.map((t) => (
                    <span
                      key={t}
                      style={{
                        fontSize: 10,
                        padding: "3px 8px",
                        borderRadius: 99,
                        background:
                          t === 1 ? "var(--accent-muted)" : "var(--bg-input)",
                        color:
                          t === 1 ? "var(--accent)" : "var(--text-secondary)",
                        border: `1px solid ${t === 1 ? "var(--accent-border)" : "var(--border)"}`,
                        fontWeight: t === 1 ? 600 : 400,
                      }}
                    >
                      {t} bln
                    </span>
                  ))}
                </div>

                {/* Expandable detail */}
                {expanded && (
                  <div style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        lineHeight: 1.6,
                        padding: "10px 12px",
                        background: "var(--bg-input)",
                        borderRadius: 8,
                        marginBottom: 8,
                      }}
                    >
                      {bank.keterangan}
                    </div>
                    {!safe && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "#f7c600",
                          background: "rgba(247,198,0,0.06)",
                          border: "1px solid rgba(247,198,0,0.2)",
                          borderRadius: 8,
                          padding: "8px 10px",
                          lineHeight: 1.5,
                        }}
                      >
                        ⚠ Bunga di atas batas penjaminan LPS ({lpsLimit}%). Dana
                        tidak dijamin LPS.
                      </div>
                    )}
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        marginTop: 8,
                        fontSize: 11,
                        color: "var(--text-muted)",
                      }}
                    >
                      <div>
                        <span style={{ color: "var(--text-secondary)" }}>
                          App:
                        </span>{" "}
                        {bank.app}
                      </div>
                      {bank.scrape_status && (
                        <div>
                          <span style={{ color: "var(--text-secondary)" }}>
                            Data:
                          </span>{" "}
                          {bank.scrape_status === "scraped"
                            ? "🟢 Auto-scraped"
                            : "🟡 Manual"}
                        </div>
                      )}
                    </div>
                    <BankLinkButtons bankId={bank.id} />
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setExpandedId(expanded ? null : bank.id)}
                    style={{
                      flex: 1,
                      padding: "9px",
                      borderRadius: 9,
                      border: "1px solid var(--border-strong)",
                      background: "var(--bg-input)",
                      color: "var(--text-secondary)",
                      fontSize: 12,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {expanded ? "Tutup" : "Detail"}
                  </button>
                  <button
                    onClick={() => {
                      onSelectBank(bank);
                    }}
                    style={{
                      flex: 2,
                      padding: "9px",
                      borderRadius: 9,
                      border: `1px solid ${selected ? "var(--accent)" : "var(--border-strong)"}`,
                      background: selected
                        ? "var(--accent)"
                        : "var(--bg-hover)",
                      color: selected ? "#0a0e0d" : "var(--text-primary)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    {selected ? <>✓ Terpilih</> : <>→ Hitung</>}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   KALKULATOR — responsive
═══════════════════════════════════════════════════════════════════ */
function SliderInput({ label, hint, value, min, max, step, onChange, format }) {
  const p = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: hint ? 3 : 7,
        }}
      >
        <label
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            fontWeight: 500,
          }}
        >
          {label}
        </label>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>
          {format(value)}
        </span>
      </div>
      {hint && (
        <div
          style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}
        >
          {hint}
        </div>
      )}
      <div
        style={{
          position: "relative",
          height: 24,
          display: "flex",
          alignItems: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "auto 0",
            height: 4,
            borderRadius: 2,
            background: "var(--bg-input)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            width: p + "%",
            height: 4,
            borderRadius: 2,
            background: "var(--accent)",
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{
            position: "absolute",
            left: 0,
            width: "100%",
            height: 24,
            opacity: 0,
            cursor: "pointer",
            zIndex: 2,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `calc(${p}% - 10px)`,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "var(--accent)",
            border: "2px solid var(--bg-base)",
            boxShadow: "0 0 0 3px var(--accent-border)",
            pointerEvents: "none",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 4,
        }}
      >
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {format(min)}
        </span>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {format(max)}
        </span>
      </div>
    </div>
  );
}

function NumberInput({ label, hint, value, onChange, step = 500000 }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: "block",
          fontSize: 13,
          color: "var(--text-secondary)",
          fontWeight: 500,
          marginBottom: hint ? 3 : 6,
        }}
      >
        {label}
      </label>
      {hint && (
        <div
          style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 5 }}
        >
          {hint}
        </div>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: "var(--bg-input)",
          border: `1px solid ${focused ? "var(--accent-border)" : "var(--border-strong)"}`,
          borderRadius: 10,
          overflow: "hidden",
          transition: "all 0.2s",
          boxShadow: focused ? "0 0 0 3px rgba(45,206,137,0.08)" : "none",
        }}
      >
        <span
          style={{
            padding: "0 11px",
            fontSize: 12,
            color: "var(--text-muted)",
            background: "var(--bg-card)",
            borderRight: "1px solid var(--border)",
            height: 44,
            display: "flex",
            alignItems: "center",
          }}
        >
          Rp
        </span>
        <input
          type="number"
          value={value}
          step={step}
          min={0}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            padding: "0 12px",
            height: 44,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--text-primary)",
            fontSize: 14,
            fontWeight: 500,
          }}
        />
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
        {idr(value, true)}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const modal = payload.find((p) => p.dataKey === "Modal")?.value || 0;
  const bunga = payload.find((p) => p.dataKey === "Bunga")?.value || 0;
  return (
    <div
      style={{
        background: "#161d1a",
        border: "1px solid var(--border-strong)",
        borderRadius: 12,
        padding: "10px 14px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        minWidth: 170,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "var(--text-muted)",
          marginBottom: 8,
          letterSpacing: "0.07em",
        }}
      >
        BULAN KE-{label}
      </div>
      {[
        ["Modal", "#1a9b61", modal],
        ["Bunga", "#2dce89", bunga],
      ].map(([l, c, v]) => (
        <div
          key={l}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            marginBottom: 5,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{ width: 7, height: 7, borderRadius: 2, background: c }}
            />
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              {l}
            </span>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            {idr(v, true)}
          </span>
        </div>
      ))}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          marginTop: 6,
          paddingTop: 6,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
          Total
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>
          {idr(modal + bunga, true)}
        </span>
      </div>
    </div>
  );
}

const COL_TIPS = {
  Periode: "Urutan bulan berjalan.",
  Setoran: "Uang yang masuk bulan ini.",
  "Bunga Ini": "Bunga bulan ini — NAIK terus karena saldo makin besar.",
  Saldo: "Saldo setelah bunga + setoran.",
  ROI: "Total bunga ÷ total modal × 100%. NAIK terus karena compounding.",
};

function MobileTableRow({ row, isLast, isFirst, firstInterest }) {
  const [open, setOpen] = useState(false);
  const isYearly = row.month % 12 === 0 && !isLast;
  const growthVsFirst =
    firstInterest > 0 ? (row.interestThisMonth / firstInterest - 1) * 100 : 0;

  return (
    <div
      style={{
        background: isLast ? "rgba(45,206,137,0.05)" : "var(--bg-card)",
        border: `1px solid ${isLast ? "var(--accent-border)" : "var(--border)"}`,
        borderRadius: 12,
        marginBottom: 8,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          padding: "12px 14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          {isLast && (
            <span
              style={{
                fontSize: 9,
                background: "var(--accent)",
                color: "#0a0e0d",
                padding: "2px 5px",
                borderRadius: 99,
                fontWeight: 700,
              }}
            >
              AKHIR
            </span>
          )}
          {isYearly && (
            <span
              style={{
                fontSize: 9,
                background: "var(--gold-dim)",
                color: "var(--gold)",
                padding: "2px 5px",
                borderRadius: 99,
              }}
            >
              {row.month / 12}thn
            </span>
          )}
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: isLast ? "var(--accent)" : "var(--text-primary)",
            }}
          >
            Bln {row.month}
          </span>
        </div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Saldo</div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            {idr(row.balance, true)}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div
            style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}
          >
            {pct(row.roiCumulative, 1)}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>ROI</div>
        </div>
        <span
          style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 4 }}
        >
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div
          style={{
            padding: "0 14px 14px",
            borderTop: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "10px 16px",
              paddingTop: 12,
            }}
          >
            {[
              { label: "Setoran", value: idr(row.setoran, true) },
              {
                label: "Bunga bulan ini",
                value: idr(row.interestThisMonth, true),
                accent: true,
                sub: !isFirst ? `+${growthVsFirst.toFixed(0)}% vs bln 1` : null,
              },
              { label: "Total modal", value: idr(row.totalContrib, true) },
              {
                label: "Total bunga",
                value: idr(row.cumInterest, true),
                accent: true,
              },
            ].map((item, i) => (
              <div key={i}>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    marginBottom: 2,
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: item.accent ? "#2dce89" : "var(--text-primary)",
                  }}
                >
                  {item.value}
                </div>
                {item.sub && (
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {item.sub}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Kalkulator({ selectedBank, onGoToScreener }) {
  const { isMobile, isTablet } = useBreakpoint();
  const [principal, setPrincipal] = useState(10_000_000);
  const [monthly, setMonthly] = useState(2_000_000);
  const [rate, setRate] = useState(0.5);
  const [duration, setDuration] = useState(24);
  const [showControls, setShowControls] = useState(true);

  // Sync rate when bank selected
  const prevBankId = useRef(null);
  if (selectedBank && selectedBank.id !== prevBankId.current) {
    prevBankId.current = selectedBank.id;
    const newRate = parseFloat((selectedBank.bunga_pa / 12).toFixed(4));
    setTimeout(() => setRate(newRate), 0);
  }

  const { rows, ear, totalContrib, cumInterest, finalBalance, roiFinal } =
    useMemo(
      () => compute(principal, monthly, rate, duration),
      [principal, monthly, rate, duration],
    );

  const formatDur = useCallback((v) => {
    const y = Math.floor(v / 12),
      m = v % 12;
    if (y === 0) return `${v} bln`;
    if (m === 0) return `${y} thn`;
    return `${y}t ${m}b`;
  }, []);

  const chartData = useMemo(() => {
    const step = Math.max(1, Math.floor(duration / 24));
    return rows
      .filter((_, i) => i % step === 0 || i === rows.length - 1)
      .map((r) => ({
        month: r.month,
        Modal: Math.round(r.totalContrib),
        Bunga: Math.round(r.cumInterest),
      }));
  }, [rows, duration]);

  const controls = (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 18,
        padding: "20px 18px",
      }}
    >
      {isMobile && (
        <button
          onClick={() => setShowControls((c) => !c)}
          style={{
            width: "100%",
            padding: "8px",
            borderRadius: 9,
            border: "1px solid var(--border)",
            background: "var(--bg-input)",
            color: "var(--text-secondary)",
            fontSize: 13,
            cursor: "pointer",
            marginBottom: showControls ? 16 : 0,
          }}
        >
          {showControls ? "▲ Sembunyikan parameter" : "▼ Ubah parameter"}
        </button>
      )}
      {(!isMobile || showControls) && (
        <>
          <h2
            style={{
              fontFamily: "Playfair Display",
              fontSize: 17,
              fontWeight: 600,
              marginBottom: 18,
            }}
          >
            Parameter
          </h2>
          <NumberInput
            label="Modal Awal"
            hint="Disetor di hari pertama"
            value={principal}
            onChange={setPrincipal}
            step={1_000_000}
          />
          <NumberInput
            label="Setoran Bulanan"
            hint="Ditambahkan tiap bulan"
            value={monthly}
            onChange={setMonthly}
          />
          <div
            style={{ height: 1, background: "var(--border)", margin: "16px 0" }}
          />
          <SliderInput
            label="Bunga / Bulan"
            hint={
              selectedBank
                ? `Dari ${selectedBank.nama}`
                : "Atau pilih bank dari Screener"
            }
            value={rate}
            min={0.1}
            max={2.0}
            step={0.05}
            onChange={setRate}
            format={(v) => v.toFixed(2) + "%"}
          />
          <SliderInput
            label="Durasi"
            value={duration}
            min={1}
            max={120}
            step={1}
            onChange={setDuration}
            format={formatDur}
          />
          <div
            style={{ height: 1, background: "var(--border)", margin: "16px 0" }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              {
                label: "Modal disetor",
                val: idr(totalContrib, true),
                tip: "Modal awal + semua setoran.",
              },
              {
                label: "Total bunga",
                val: idr(cumInterest, true),
                accent: true,
                tip: "Akumulasi seluruh bunga.",
              },
              {
                label: "Nilai akhir",
                val: idr(finalBalance, true),
                large: true,
                accent: true,
                tip: "Modal + bunga akhir periode.",
              },
            ].map((item, i) => (
              <div
                key={i}
                style={{
                  padding: "10px 12px",
                  background: item.large
                    ? "var(--accent-muted)"
                    : "var(--bg-input)",
                  borderRadius: 10,
                  border: `1px solid ${item.accent ? "var(--accent-border)" : "var(--border)"}`,
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--text-muted)",
                    letterSpacing: "0.06em",
                    marginBottom: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                  }}
                >
                  {item.label.toUpperCase()}
                  <InfoTip text={item.tip} />
                </div>
                <div
                  style={{
                    fontFamily: "Playfair Display",
                    fontSize: item.large ? 18 : 14,
                    fontWeight: 700,
                    color: item.accent
                      ? "var(--accent)"
                      : "var(--text-primary)",
                  }}
                >
                  {item.val}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div
      style={{
        maxWidth: 1120,
        margin: "0 auto",
        padding: isMobile ? "16px 12px 80px" : "32px 2rem 80px",
      }}
    >
      {/* Bank banner */}
      {selectedBank ? (
        <div
          style={{
            background: "var(--accent-muted)",
            border: "1px solid var(--accent-border)",
            borderRadius: 13,
            padding: "11px 14px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 10,
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: selectedBank.warna + "33",
                border: `1px solid ${selectedBank.warna}55`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 11,
                color: selectedBank.warna,
                flexShrink: 0,
              }}
            >
              {selectedBank.nama.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                <span style={{ color: "var(--accent)" }}>
                  {selectedBank.nama}
                </span>{" "}
                — {selectedBank.bunga_pa}% p.a ={" "}
                {(selectedBank.bunga_pa / 12).toFixed(3)}%/bln
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  marginTop: 2,
                  flexWrap: "wrap",
                }}
              >
                <LpsBadge
                  bunga_pa={selectedBank.bunga_pa}
                  lps_limit={selectedBank.lps_tipe === "bpr" ? 6.75 : 3.5}
                />
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  {selectedBank.app}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onGoToScreener}
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              background: "var(--bg-input)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "5px 12px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Ganti bank →
          </button>
        </div>
      ) : (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 13,
            padding: "11px 14px",
            marginBottom: 20,
            fontSize: 13,
            color: "var(--text-secondary)",
          }}
        >
          Masukkan parameter manual, atau{" "}
          <button
            onClick={onGoToScreener}
            style={{
              fontSize: 13,
              color: "var(--accent)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
              textDecorationStyle: "dotted",
            }}
          >
            pilih bank dari Screener
          </button>
          .
        </div>
      )}

      {/* Layout: sidebar + main, stacked on mobile */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            isMobile || isTablet ? "1fr" : "clamp(240px,30%,320px) 1fr",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* Controls */}
        <div
          style={{
            position: isMobile || isTablet ? "static" : "sticky",
            top: 72,
          }}
        >
          {controls}
        </div>

        {/* Right col */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Stats row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 12,
            }}
          >
            {[
              {
                label: "EAR / Tahun",
                value: pct(ear),
                sub: "efektif annual",
                tip: "Bunga tahunan setelah compounding. Lebih tinggi dari bunga nominal × 12.",
              },
              {
                label: "ROI Total",
                value: pct(roiFinal, 1),
                sub: `selama ${formatDur(duration)}`,
                tip: "Total bunga ÷ total modal. Naik terus.",
              },
              {
                label: "Passive Income",
                value: idr(rows[rows.length - 1]?.interestThisMonth || 0, true),
                sub: "bulan terakhir",
                tip: "Bunga yang diterima di bulan terakhir.",
              },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: isMobile ? "14px 12px" : 18,
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    color: "var(--text-muted)",
                    letterSpacing: "0.07em",
                    marginBottom: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  {s.label.toUpperCase()}
                  <InfoTip text={s.tip} />
                </div>
                <div
                  style={{
                    fontFamily: "Playfair Display",
                    fontSize: isMobile ? 17 : 22,
                    fontWeight: 700,
                    color: "var(--accent)",
                    marginBottom: 3,
                  }}
                >
                  {s.value}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  {s.sub}
                </div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 18,
              padding: isMobile ? "16px 12px" : "22px 22px 14px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 16,
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div>
                <h2
                  style={{
                    fontFamily: "Playfair Display",
                    fontSize: 17,
                    fontWeight: 600,
                    marginBottom: 2,
                  }}
                >
                  Pertumbuhan Portofolio
                </h2>
                <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Modal vs bunga kumulatif
                </p>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  fontSize: 11,
                  color: "var(--text-secondary)",
                }}
              >
                {[
                  ["#1a9b61", "Modal"],
                  ["#2dce89", "Bunga"],
                ].map(([c, l]) => (
                  <span
                    key={l}
                    style={{ display: "flex", alignItems: "center", gap: 5 }}
                  >
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 2,
                        background: c,
                        display: "inline-block",
                      }}
                    />
                    {l}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ height: isMobile ? 180 : 230 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 5, right: 4, left: 0, bottom: 0 }}
                >
                  <defs>
                    {[
                      ["Modal", "#1a9b61", 0.35],
                      ["Bunga", "#2dce89", 0.45],
                    ].map(([id, c, o]) => (
                      <linearGradient
                        key={id}
                        id={`g${id}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="5%" stopColor={c} stopOpacity={o} />
                        <stop offset="95%" stopColor={c} stopOpacity={0.01} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.04)"
                  />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fill: "#4a6358" }}
                    tickFormatter={(v) => `B${v}`}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#4a6358" }}
                    tickFormatter={(v) => idr(v, true)}
                    axisLine={false}
                    tickLine={false}
                    width={62}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="Modal"
                    stackId="1"
                    stroke="#1a9b61"
                    fill="url(#gModal)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="Bunga"
                    stackId="1"
                    stroke="#2dce89"
                    fill="url(#gBunga)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ROI explanation */}
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--accent-border)",
              borderRadius: 13,
              padding: "13px 16px",
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                flexShrink: 0,
                background: "var(--accent-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                lineHeight: 1.65,
              }}
            >
              <strong
                style={{
                  color: "var(--text-primary)",
                  display: "block",
                  marginBottom: 3,
                }}
              >
                Kenapa bunga & ROI terus naik?
              </strong>
              Bunga dihitung dari saldo yang terus membesar. ROI naik karena
              bunga tumbuh eksponensial, jauh lebih cepat dari setoran baru yang
              linear. ROI saat ini:{" "}
              <span style={{ color: "var(--accent)", fontWeight: 700 }}>
                {pct(roiFinal, 1)}
              </span>
            </div>
          </div>

          {/* Table — responsive */}
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 18,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: isMobile ? "14px 14px 10px" : "18px 18px 12px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div>
                <h2
                  style={{
                    fontFamily: "Playfair Display",
                    fontSize: 17,
                    fontWeight: 600,
                    marginBottom: 2,
                  }}
                >
                  Rincian per Bulan
                </h2>
                <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {isMobile
                    ? "Tap baris untuk detail lengkap"
                    : "Hover ? di header untuk penjelasan"}
                </p>
              </div>
              <span
                style={{
                  fontSize: 10,
                  color: "var(--accent)",
                  background: "var(--accent-muted)",
                  padding: "3px 10px",
                  borderRadius: 99,
                  border: "1px solid var(--accent-border)",
                }}
              >
                {duration} BULAN
              </span>
            </div>

            {isMobile ? (
              <div
                style={{
                  padding: "0 12px 12px",
                  maxHeight: 480,
                  overflowY: "auto",
                }}
              >
                {rows.map((row, i) => (
                  <MobileTableRow
                    key={row.month}
                    row={row}
                    isLast={i === rows.length - 1}
                    isFirst={i === 0}
                    firstInterest={rows[0].interestThisMonth}
                  />
                ))}
              </div>
            ) : (
              // tabel desktop yang sudah ada — tidak perlu diubah
              <div
                style={{ overflowX: "auto", maxHeight: 440, overflowY: "auto" }}
              >
                ...tabel lama Anda di sini...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   BOTTOM NAV — mobile only
═══════════════════════════════════════════════════════════════════ */
function BottomNav({ activeTab, setActiveTab }) {
  const { isMobile } = useBreakpoint();
  if (!isMobile) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 60,
        display: "flex",
        background: "rgba(10,14,13,0.97)",
        backdropFilter: "blur(16px)",
        borderTop: "1px solid var(--border)",
        padding: "8px 0 max(8px, env(safe-area-inset-bottom))",
      }}
    >
      {[
        [
          "screener",
          "Screener",
          <svg
            key="s"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>,
        ],
        [
          "kalkulator",
          "Kalkulator",
          <svg
            key="k"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>,
        ],
      ].map(([tab, label, icon]) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            padding: "6px 0",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: activeTab === tab ? "var(--accent)" : "var(--text-muted)",
            transition: "color 0.2s",
          }}
        >
          {icon}
          <span
            style={{ fontSize: 10, fontWeight: activeTab === tab ? 600 : 400 }}
          >
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ROOT APP
═══════════════════════════════════════════════════════════════════ */
export default function App() {
  const [activeTab, setActiveTab] = useState("screener");
  const [selectedBank, setSelectedBank] = useState(null);
  const { data, loading, error } = useBankRates();
  const { isMobile } = useBreakpoint();

  const handleSelectBank = useCallback((bank) => {
    setSelectedBank(bank);
    setActiveTab("kalkulator");
  }, []);

  const banks = data?.banks ?? [];
  const lpsLimit = data?.lps_bank_umum ?? 3.5;
  const genAt = data?.generated_at ?? null;

  // Tambahkan di dalam komponen App, sebelum return
  useEffect(() => {
    const titles = {
      screener: "Screener Deposito Indonesia — DepositoPlus",
      kalkulator: "Kalkulator Compound Interest — DepositoPlus",
    };
    document.title = titles[activeTab] || "DepositoPlus";
  }, [activeTab]);

  return (
    <>
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {loading ? (
        <Spinner />
      ) : error ? (
        <div
          style={{
            textAlign: "center",
            padding: "80px 20px",
            color: "var(--text-secondary)",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
          <p style={{ fontSize: 14 }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16,
              padding: "8px 20px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-input)",
              color: "var(--text-primary)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Coba lagi
          </button>
        </div>
      ) : activeTab === "screener" ? (
        <Screener
          bankData={banks}
          lpsLimit={lpsLimit}
          generatedAt={genAt}
          onSelectBank={handleSelectBank}
          selectedId={selectedBank?.id}
        />
      ) : (
        <Kalkulator
          selectedBank={selectedBank}
          onGoToScreener={() => setActiveTab("screener")}
        />
      )}
      <InstallBanner />
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

      <footer
        style={{
          borderTop: "1px solid var(--border)",
          padding: isMobile ? "20px 16px" : "24px 2rem",
          textAlign: "center",
          paddingBottom: isMobile ? "80px" : undefined,
        }}
      >
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
          DepositoPlus — Screener & Kalkulator Deposito Indonesia
        </p>
        <p
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginTop: 5,
            opacity: 0.5,
          }}
        >
          Data diperbarui otomatis setiap Senin · Bukan saran investasi · Selalu
          cek website resmi bank
        </p>
        <p
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginTop: 5,
            opacity: 0.5,
          }}
        >
          © {new Date().getFullYear()} DepositoPlus. All rights reserved.
        </p>
        <p
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginTop: 5,
            opacity: 0.5,
          }}
        >
          Developed by{" "}
          <a
            href="https://rendidev.netlify.app/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--text-primary)" }}
          >
            Rendi
          </a>
          .
        </p>
      </footer>
    </>
  );
}
