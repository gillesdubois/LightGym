import { useCallback, useEffect, useState } from "react";
import ActivitySheet from "./components/ActivitySheet";
import RestBar from "./components/RestBar";
import { dayLabel, isoWeek, todayISO } from "./lib/dates";
import { keepScreenOn, releaseScreen, useToast, useWakeState } from "./lib/device";
import { useT } from "./lib/i18n";
import type { Template } from "./lib/program";
import { createSession, isEmpty } from "./lib/sessions";
import { getSaveFailed, update, useData } from "./lib/store";
import ChronoView from "./views/ChronoView";
import HistoryView from "./views/HistoryView";
import SessionView from "./views/SessionView";
import ToolsView, { type ToolSection } from "./views/ToolsView";
import WeekView from "./views/WeekView";

export type Tab = "semaine" | "seance" | "chrono" | "historique" | "outils";

export interface Nav {
  go: (tab: Tab, opts?: { section?: ToolSection; date?: string }) => void;
  openActivity: (date?: string) => void;
  startSession: (date: string, template: Template | null) => void;
  openSession: (id: string) => void;
}

const TABS: { id: Tab; icon: React.ReactNode }[] = [
  { id: "semaine", icon: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></> },
  { id: "seance", icon: <path d="M4 6h16M4 12h10M4 18h13" /> },
  { id: "chrono", icon: <><circle cx="12" cy="13" r="7.5" /><path d="M12 13V9M9.5 3h5" /></> },
  { id: "historique", icon: <><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4h4M12 8v4l3 2" /></> },
  { id: "outils", icon: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></> },
];

export default function App() {
  const data = useData();
  const t = useT();
  const [tab, setTab] = useState<Tab>("semaine");
  const [section, setSection] = useState<ToolSection>("bilan");
  const [historyDate, setHistoryDate] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ date?: string } | null>(null);
  const msg = useToast();
  const wake = useWakeState();

  useEffect(() => {
    document.documentElement.lang = t.lang;
  }, [t.lang]);

  const go: Nav["go"] = useCallback((next, opts) => {
    if (opts?.section) setSection(opts.section);
    if (opts?.date) setHistoryDate(opts.date);
    setTab(next);
    window.scrollTo(0, 0);
  }, []);

  const startSession: Nav["startSession"] = useCallback((date, template) => {
    const s = createSession(date, template);
    update((d) => {
      // Une séance en cours restée vide est remplacée plutôt que gardée.
      const prev = d.sessions.find((x) => x.id === d.activeId);
      if (prev && prev.status === "live") {
        if (isEmpty(prev)) d.sessions = d.sessions.filter((x) => x.id !== prev.id);
        else prev.status = "done";
      }
      d.sessions.push(s);
      d.activeId = s.id;
    });
    void keepScreenOn();
    go("seance");
  }, [go]);

  const openSession: Nav["openSession"] = useCallback((id) => {
    update((d) => { d.activeId = id; });
    go("seance");
  }, [go]);

  const nav: Nav = { go, openActivity: (date) => setSheet({ date }), startSession, openSession };

  const active = data.sessions.find((s) => s.id === data.activeId) ?? null;
  const today = todayISO();
  const header: Record<Tab, [string, string]> = {
    semaine: [t.tabs.semaine, t.header.weekSub(isoWeek(today), dayLabel(today, t.lang))],
    seance: active ? [dayLabel(active.date, t.lang), active.title || t.header.freeSession] : [t.header.session, t.header.noSession],
    chrono: [t.tabs.chrono, t.header.chronoSub],
    historique: [t.tabs.historique, t.header.historySub],
    outils: [t.tabs.outils, t.header.toolsSub],
  };

  return (
    <div className="app">
      <header className="appbar">
        <div className="appbar-text">
          <h1 className="t">{header[tab][0]}</h1>
          <div className="s">{header[tab][1]}</div>
        </div>
        <button
          type="button"
          className={`wake ${wake === "on" ? "on" : ""}`}
          aria-pressed={wake === "on"}
          onClick={() => (wake === "on" ? releaseScreen() : void keepScreenOn())}
          title={t.wake.title}
        >
          {wake === "on" ? t.wake.on : wake === "unsupported" ? t.wake.unsupported : t.wake.off}
        </button>
      </header>

      {getSaveFailed() && <div className="banner">{t.saveFailed}</div>}

      <main className="view">
        {tab === "semaine" && <WeekView data={data} nav={nav} />}
        {tab === "seance" && <SessionView data={data} nav={nav} session={active} />}
        {tab === "chrono" && <ChronoView nav={nav} />}
        {tab === "historique" && <HistoryView data={data} nav={nav} initialDate={historyDate} />}
        {tab === "outils" && <ToolsView data={data} section={section} setSection={setSection} />}
      </main>

      <RestBar />

      <nav className="tabbar" aria-label="Navigation">
        {TABS.map((x) => (
          <button key={x.id} type="button" aria-current={tab === x.id ? "page" : undefined} onClick={() => go(x.id)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{x.icon}</svg>
            {t.tabs[x.id]}
            {x.id === "seance" && active?.status === "live" && <span className="dot" aria-label={t.liveDot} />}
          </button>
        ))}
      </nav>

      {sheet && <ActivitySheet date={sheet.date} onClose={() => setSheet(null)} />}
      {msg && <div className="toast" role="status">{msg}</div>}
    </div>
  );
}
