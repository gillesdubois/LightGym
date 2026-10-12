import { useEffect, useMemo, useState } from "react";
import { isPaced, paceLabel } from "../lib/activities";
import { type Dict, useT } from "../lib/i18n";
import { allAtTop, parseLine, type ParsedLine, type Value } from "../lib/parse";
import { parseProgram } from "../lib/program";
import { sessionLines } from "../lib/sessions";
import type { Data, Session } from "../lib/store";

export function useNow(active = true, ms = 250): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

export function useTemplates(data: Data) {
  return useMemo(() => parseProgram(data.programText, data.settings), [data.programText, data.settings]);
}

export function activityTypeLabel(t: Dict, type: string): string {
  return (t.activity.types as Record<string, string>)[type] ?? type;
}

/** Texte d'aide statique contenant du balisage <code>, écrit dans i18n.ts. */
export function Rich({ html, as: Tag = "span" }: { html: string; as?: "span" | "p" | "li" }) {
  return <Tag dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Chip({ v }: { v: Value }) {
  return (
    <span className={`chip ${v.cls}`}>
      {v.side && <span className="side">{v.side}</span>}
      {v.txt}
    </span>
  );
}

export function LineView({ line, parsed }: { line?: string; parsed?: ParsedLine | null }) {
  const t = useT();
  const p = parsed ?? (line ? parseLine(line) : null);
  if (!p) return null;
  if (p.free) {
    return (
      <div className="ex">
        <div className="ex-head"><span className="ex-name">{p.name}</span></div>
      </div>
    );
  }
  const meta = [p.load, p.sets ? `${p.sets}x` : null, p.targetTxt ? `[${p.targetTxt}]` : null].filter(Boolean).join(" ");
  return (
    <div className="ex">
      <div className="ex-head">
        <span className="ex-name">{p.name}</span>
        {meta && <span className="ex-meta">{meta}</span>}
      </div>
      {p.values.length > 0 && (
        <div className="chips">
          {p.values.map((v, i) => <Chip key={i} v={v} />)}
        </div>
      )}
      {allAtTop(p) && <div className="flag">{t.common.topRange}</div>}
      {p.note && <div className="note">{p.note}</div>}
    </div>
  );
}

export function ActivityLine({ label, durationMin, distanceKm, type }: { label: string; durationMin?: number; distanceKm?: number; type: string }) {
  const t = useT();
  const pace = isPaced(type) ? paceLabel(durationMin, distanceKm) : null;
  return (
    <div className="act">
      <span className="act-type">{activityTypeLabel(t, type)}</span>
      <span className="act-label">{label}</span>
      {pace && <span className="ex-meta">{pace}</span>}
    </div>
  );
}

export function SessionBody({ session }: { session: Session }) {
  const lines = sessionLines(session);
  return (
    <>
      {lines.map((l, i) => <LineView key={i} line={l} />)}
      {session.activities.length > 0 && (
        <div className="acts">
          {session.activities.map((a) => <ActivityLine key={a.id} {...a} />)}
        </div>
      )}
      {session.note.trim() && <div className="note">{session.note}</div>}
    </>
  );
}

export function Confirm({ label, confirmLabel, onConfirm, className = "btn sm ghost danger" }: { label: string; confirmLabel: string; onConfirm: () => void; className?: string }) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  if (!asking) return <button type="button" className={className} onClick={() => setAsking(true)}>{label}</button>;
  return (
    <span className="row">
      <button type="button" className="btn sm danger-solid" onClick={() => { setAsking(false); onConfirm(); }}>{confirmLabel}</button>
      <button type="button" className="btn sm ghost" onClick={() => setAsking(false)}>{t.common.cancel}</button>
    </span>
  );
}
