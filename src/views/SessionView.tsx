import { useEffect, useRef, useState } from "react";
import type { Nav, Preview } from "../App";
import { ActivityLine, Chip, Confirm, LineView, useNow, useTemplates } from "../components/common";
import GuidedBlock from "../components/GuidedBlock";
import PlanCard from "../components/PlanCard";
import { DAYS, dayLabel, fmtClock, todayISO } from "../lib/dates";
import { beep, releaseScreen, toast, unlockAudio } from "../lib/device";
import { type Dict, useT } from "../lib/i18n";
import { parseLine, parseTarget, parseValue } from "../lib/parse";
import { type BlockDef, placeholderFor, timedSteps, timedTotal } from "../lib/program";
import { isEmpty, pendingPlanOn } from "../lib/sessions";
import { type Block, type Data, getData, type Session, update } from "../lib/store";
import { cancelGuided, guided, startRest, stopRest } from "../lib/timers";

export default function SessionView({ data, nav, session, preview, onBack }: {
  data: Data;
  nav: Nav;
  session: Session | null;
  preview: Preview | null;
  onBack: () => void;
}) {
  if (preview) return <PreviewView data={data} nav={nav} preview={preview} onBack={onBack} />;
  if (!session) return <Picker data={data} nav={nav} />;
  return <Editor key={session.id} data={data} nav={nav} s={session} />;
}

/* ---------- Aperçu d'un bloc, sans rien démarrer ---------- */

function blockMeta(t: Dict, b: BlockDef) {
  if (b.kind === "timed") return `${t.session.guided.steps(timedSteps(b))} · ${t.session.guided.total(fmtClock(timedTotal(b)))}`;
  return [b.sets > 1 ? t.session.sets(b.sets) : null, b.rest ? t.session.rest(fmtClock(b.rest)) : null].filter(Boolean).join(" · ");
}

function PreviewView({ data, nav, preview, onBack }: { data: Data; nav: Nav; preview: Preview; onBack: () => void }) {
  const t = useT();
  const { templates } = useTemplates(data);
  const tpl = templates.find((x) => x.id === preview.templateId);
  return (
    <div className="stack">
      <button type="button" className="btn sm ghost start" onClick={onBack}>‹ {t.session.back}</button>
      <section className="card">
        <h2 className="h2">{tpl?.title ?? "—"}</h2>
        <span className="small">{t.session.planned(dayLabel(preview.date, t.lang))}</span>
        {!tpl && <span className="small">{t.plan.missing}</span>}
      </section>
      {tpl?.blocks.map((b, i) => (
        <section key={i} className="card">
          <div className="row between">
            <span className="blk-label">{b.label}</span>
            <span className="row">
              {b.tag === "bonus" && <span className="pill bonus">{t.session.bonus}</span>}
              {b.tag === "core" && <span className="pill">{t.session.core}</span>}
            </span>
          </div>
          {b.exos.map((e, j) => (
            <div key={j} className="pair">
              <span>{e.name}</span>
              {e.target && <span className="target">{e.seconds ? `${fmtClock(e.seconds)}${e.perSide ? " ×2" : ""}` : e.target}</span>}
              {e.cue && <span className="small cue">{e.cue}</span>}
            </div>
          ))}
          {blockMeta(t, b) && <span className="small mono">{blockMeta(t, b)}</span>}
        </section>
      ))}
      {tpl && (
        <button type="button" className="btn primary" onClick={() => nav.startSession(preview.date, tpl, preview.planId)}>{t.session.startSession}</button>
      )}
    </div>
  );
}

/* ---------- Aucune séance ouverte : choisir quoi faire ---------- */

function Picker({ data, nav }: { data: Data; nav: Nav }) {
  const t = useT();
  const [date, setDate] = useState(todayISO());
  const { templates } = useTemplates(data);
  const byId = new Map(templates.map((x) => [x.id, x]));
  const pending = pendingPlanOn(data, date);
  return (
    <div className="stack">
      <section className="card">
        <h2 className="h2">{t.session.newTitle}</h2>
        <label className="lbl" htmlFor="pick-date">{t.session.date}
          <input className="field" id="pick-date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <button type="button" className="btn primary" onClick={() => nav.startSession(date, null)}>{t.session.freeSession}</button>
      </section>
      {pending.length > 0 && (
        <section className="card">
          <span className="blk-label">{t.today.planned}</span>
          {pending.map((p) => <PlanCard key={p.id} item={p} template={byId.get(p.templateId)} nav={nav} />)}
        </section>
      )}
      {templates.length > 0 && (
        <section className="card">
          <span className="blk-label">{t.session.fromProgram}</span>
          <div className="tpl-list">
            {templates.map((x) => (
              <button key={x.id} type="button" className="tpl" onClick={() => nav.preview({ templateId: x.id, date })}>
                <span>
                  <b>{x.title}</b>
                  <span className="small">{x.blocks.map((b) => b.exos.map((e) => e.name).join(" / ")).join(" · ")}</span>
                </span>
                {x.weekday !== null && <span className="mono small">{DAYS[t.lang].short[x.weekday]}</span>}
              </button>
            ))}
          </div>
        </section>
      )}
      {!templates.length && <p className="small">{t.session.noProgram}</p>}
    </div>
  );
}

/* ---------- Séance ouverte : un bloc à la fois ---------- */

const isDone = (b: Block) => b.skipped || b.values.length >= b.sets;

/** Premier bloc à faire après `fromIndex`, en revenant au début si besoin. */
function nextOpen(blocks: Block[], fromIndex = -1): string | null {
  for (let k = 1; k <= blocks.length; k++) {
    const b = blocks[(fromIndex + k + blocks.length) % blocks.length];
    if (!isDone(b)) return b.id;
  }
  return null;
}

function targetsOf(b: Block) {
  return {
    single: b.exos.length === 1 ? parseTarget(b.exos[0]?.target) : null,
    pair: b.exos.length === 2 ? b.exos.map((e) => parseTarget(e.target)) : null,
  };
}

function Editor({ data, nav, s }: { data: Data; nav: Nav; s: Session }) {
  const t = useT();
  const live = s.status === "live";
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [hold, setHold] = useState<{ blockId: string; start: number } | null>(null);
  const now = useNow(live || hold !== null);
  const [free, setFree] = useState("");
  const [editLines, setEditLines] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(() => nextOpen(s.blocks));
  const blockRefs = useRef(new Map<string, HTMLElement>());
  const pendingScroll = useRef(false);

  // Après un changement de bloc, on amène le nouveau bloc en haut de l'écran.
  useEffect(() => {
    if (!pendingScroll.current || !focusId) return;
    pendingScroll.current = false;
    const el = blockRefs.current.get(focusId);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [focusId]);

  const focus = (id: string | null, scroll = true) => {
    pendingScroll.current = scroll;
    setFocusId(id);
  };

  const patch = (fn: (x: Session) => void) =>
    update((d) => {
      const x = d.sessions.find((y) => y.id === s.id);
      if (x) fn(x);
    });

  const elapsed = s.startedAt ? (now - s.startedAt) / 1000 : 0;
  const target = data.settings.targetMinutes * 60;
  const total = s.blocks.length;

  const addSet = (blockId: string) => {
    unlockAudio();
    const idx = s.blocks.findIndex((x) => x.id === blockId);
    const b = s.blocks[idx];
    const val = (inputs[blockId] ?? "").trim() || placeholderFor(b);
    if (!val) {
      toast(t.session.needValue);
      return;
    }
    patch((x) => x.blocks.find((y) => y.id === blockId)!.values.push(val));
    setInputs((m) => ({ ...m, [blockId]: "" }));
    const count = b.values.length + 1;
    if (count >= b.sets) {
      // Bloc terminé : on passe au suivant. Le repos tourne quand même s'il en reste un après.
      const after = s.blocks.map((x, i) => (i === idx ? { ...x, values: [...x.values, val] } : x));
      const next = nextOpen(after, idx);
      if (next && b.rest > 0) startRest(b.rest);
      focus(next);
      if (!next) toast(t.session.allDone);
    } else if (b.rest > 0) {
      startRest(b.rest);
    }
  };

  const toggleSkip = (blockId: string) => {
    const idx = s.blocks.findIndex((x) => x.id === blockId);
    const b = s.blocks[idx];
    patch((x) => { const y = x.blocks.find((z) => z.id === blockId)!; y.skipped = !y.skipped; });
    if (!b.skipped && focusId === blockId) {
      const after = s.blocks.map((x, i) => (i === idx ? { ...x, skipped: true } : x));
      focus(nextOpen(after, idx));
    }
  };

  const toggleHold = (blockId: string) => {
    unlockAudio();
    if (hold?.blockId === blockId) {
      const secs = Math.max(0, Math.round((Date.now() - hold.start) / 1000));
      setHold(null);
      setInputs((m) => ({ ...m, [blockId]: `${secs}s` }));
      beep(880, 0.15);
      toast(t.session.holdDone(secs));
    } else {
      setHold({ blockId, start: Date.now() + 3000 });
      beep(660, 0.1);
    }
  };

  const stopGuidedHere = () => { if (guided.key?.startsWith(`${s.id}:`)) cancelGuided(); };

  /** Fin d'un bloc minuté : on note le temps réel et on passe au bloc suivant. */
  const completeTimed = (blockId: string) => (seconds: number) => {
    if (seconds <= 0) return;
    const value = fmtClock(seconds);
    update((d) => {
      const b = d.sessions.find((y) => y.id === s.id)?.blocks.find((y) => y.id === blockId);
      if (b && !b.values.length) b.values.push(value);
    });
    toast(t.session.guided.recorded(value));
    const fresh = getData().sessions.find((y) => y.id === s.id);
    if (fresh) focus(nextOpen(fresh.blocks, fresh.blocks.findIndex((y) => y.id === blockId)));
  };

  const finish = () => {
    stopGuidedHere();
    update((d) => {
      const x = d.sessions.find((y) => y.id === s.id);
      if (x) x.status = "done";
      if (x && isEmpty(x)) d.sessions = d.sessions.filter((y) => y.id !== s.id);
      d.activeId = null;
    });
    stopRest();
    releaseScreen();
    toast(t.session.finished);
    nav.go("today");
  };

  const close = () => {
    update((d) => { d.activeId = null; });
    nav.go("today");
  };

  const freePreview = free.split("\n").map((l) => l.trim()).filter(Boolean);
  const allDone = total > 0 && s.blocks.every(isDone);

  return (
    <div className="stack">
      <section className="card">
        {live && s.startedAt && s.date === todayISO() ? (
          <>
            <div className="row between">
              <span className="mono">{t.session.elapsed(fmtClock(elapsed))}</span>
              <span className="small">{t.session.target(data.settings.targetMinutes)}</span>
            </div>
            <div className="progress"><i style={{ width: `${Math.min(100, (elapsed / target) * 100)}%`, background: elapsed > target ? "var(--work)" : undefined }} /></div>
          </>
        ) : (
          <span className="small">{live ? t.session.inProgress : t.session.saved(dayLabel(s.date, t.lang))}</span>
        )}
        <details>
          <summary>{t.session.details}</summary>
          <div className="grid2">
            <label className="lbl" htmlFor="s-title">{t.session.title}
              <input className="field" id="s-title" value={s.title} placeholder={t.session.titlePh} onChange={(e) => patch((x) => { x.title = e.target.value; })} />
            </label>
            <label className="lbl" htmlFor="s-date">{t.session.date}
              <input className="field" id="s-date" type="date" value={s.date} onChange={(e) => e.target.value && patch((x) => { x.date = e.target.value; })} />
            </label>
          </div>
        </details>
      </section>

      {s.blocks.map((b, i) => {
        const { single, pair } = targetsOf(b);
        const chips = b.values.map((v, j) => {
          const p = parseValue(v, single, pair);
          return p ? <Chip key={j} v={p} /> : null;
        });
        const setRef = (el: HTMLElement | null) => { if (el) blockRefs.current.set(b.id, el); else blockRefs.current.delete(b.id); };

        if (b.id !== focusId) {
          return (
            <button
              key={b.id}
              ref={setRef}
              type="button"
              className={`blk-row ${isDone(b) ? "done" : ""} ${b.skipped ? "skipped" : ""}`}
              onClick={() => focus(b.id, false)}
            >
              <span className="blk-row-head">
                <span className="blk-label">{b.label}</span>
                <span className="setcount">{b.skipped ? t.session.skipped : `${b.values.length}/${b.sets}`}</span>
              </span>
              <span className="blk-row-name">
                {b.kind === "timed"
                  ? `${t.session.guided.steps(timedSteps(b))} · ${fmtClock(timedTotal(b))}`
                  : b.exos.map((e) => e.name).join(" / ")}
              </span>
              {b.values.length > 0 && <span className="chips">{chips}</span>}
            </button>
          );
        }

        if (b.kind === "timed") {
          return (
            <section key={b.id} ref={setRef} className="card blk focused" aria-current="step">
              {b.values.length ? (
                <>
                  <span className="blk-label">{t.session.blockOf(i + 1, total)} · {b.label}</span>
                  <div className="chips">{chips}</div>
                  <button type="button" className="btn sm ghost start" onClick={() => patch((x) => { x.blocks.find((y) => y.id === b.id)!.values = []; })}>{t.session.undo}</button>
                </>
              ) : (
                <GuidedBlock
                  guidedKey={`${s.id}:${b.id}`}
                  block={b}
                  heading={`${t.session.blockOf(i + 1, total)} · ${b.label}`}
                  onComplete={completeTimed(b.id)}
                />
              )}
            </section>
          );
        }

        const ph = placeholderFor(b);
        const holdable = b.exos.length === 1 && /\d\s*s\b|sec/i.test(b.exos[0].target);
        const holdLeft = hold?.blockId === b.id ? (now - hold.start) / 1000 : null;
        const simple = b.sets === 1 && b.rest === 0;
        return (
          <section key={b.id} ref={setRef} className="card blk focused" aria-current="step">
            <div className="row between">
              <span className="blk-label">{t.session.blockOf(i + 1, total)} · {b.label}{b.rest ? ` · ${t.session.rest(fmtClock(b.rest))}` : ""}</span>
              <span className="row">
                {b.tag === "bonus" && <span className="pill bonus">{t.session.bonus}</span>}
                {b.tag === "core" && <span className="pill">{t.session.core}</span>}
                {b.tag === "bonus" && (
                  <button type="button" className="btn sm ghost" onClick={() => toggleSkip(b.id)}>{t.session.skip}</button>
                )}
              </span>
            </div>
            {b.exos.map((e, j) => (
              <div key={j} className="pair big"><span>{e.name}</span>{e.target && <span className="target">{e.target}</span>}</div>
            ))}
            <div className="row between">
              <div className="chips">{b.values.length ? chips : <span className="small">{t.session.noSet}</span>}</div>
              <span className="setcount">{b.values.length}/{b.sets}</span>
            </div>
            <div className="entry">
              <input
                className="field mono"
                id={`in-${b.id}`}
                aria-label={t.session.resultLabel(b.label)}
                value={inputs[b.id] ?? ""}
                placeholder={ph || t.session.valuePh}
                autoComplete="off"
                enterKeyHint="done"
                onChange={(e) => setInputs((m) => ({ ...m, [b.id]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addSet(b.id)}
              />
              <button type="button" className="btn primary" onClick={() => addSet(b.id)}>{simple ? t.session.validate : t.session.logSet}</button>
              <button type="button" className="btn ghost" disabled={!b.values.length} onClick={() => patch((x) => { x.blocks.find((y) => y.id === b.id)!.values.pop(); })}>{t.session.undo}</button>
            </div>
            {holdable && (
              <div className="row">
                <button type="button" className={`btn sm ${holdLeft !== null ? "work" : ""}`} onClick={() => toggleHold(b.id)}>
                  {holdLeft !== null ? t.session.holdStop : t.session.holdStart}
                </button>
                {holdLeft !== null && (
                  <span className="mono big-inline">{holdLeft < 0 ? t.session.holdIn(Math.ceil(-holdLeft)) : `${Math.floor(holdLeft)} s`}</span>
                )}
              </div>
            )}
          </section>
        );
      })}

      {allDone && live && (
        <section className="card inset">
          <b>{t.session.allDone}</b>
          <button type="button" className="btn primary start" onClick={finish}>{t.session.finish}</button>
        </section>
      )}

      <section className="card">
        <span className="blk-label">{t.session.freeLines}</span>
        {editLines === null ? (
          <>
            {s.lines.map((l, i) => <LineView key={i} line={l} />)}
            {s.lines.length > 0 && (
              <button type="button" className="btn sm ghost start" onClick={() => setEditLines(s.lines.join("\n"))}>{t.session.editText}</button>
            )}
          </>
        ) : (
          <>
            <textarea className="field mono" id="s-edit-lines" rows={Math.max(4, s.lines.length + 1)} value={editLines} onChange={(e) => setEditLines(e.target.value)} aria-label={t.session.linesLabel} />
            <div className="row">
              <button type="button" className="btn sm primary" onClick={() => { patch((x) => { x.lines = editLines.split("\n").map((l) => l.trim()).filter(Boolean); }); setEditLines(null); }}>{t.session.save}</button>
              <button type="button" className="btn sm ghost" onClick={() => setEditLines(null)}>{t.common.cancel}</button>
            </div>
          </>
        )}
        <textarea className="field mono" id="s-free" value={free} onChange={(e) => setFree(e.target.value)} placeholder={t.session.freePh} aria-label={t.session.newLineLabel} />
        {freePreview.length > 0 && <div className="preview">{freePreview.map((l, i) => <LineView key={i} parsed={parseLine(l)} />)}</div>}
        <div className="row">
          <button type="button" className="btn" disabled={!freePreview.length} onClick={() => { patch((x) => { x.lines.push(...freePreview); }); setFree(""); }}>{t.session.addToSession}</button>
        </div>
      </section>

      <section className="card">
        <div className="row between">
          <span className="blk-label">{t.session.activities}</span>
          <button type="button" className="btn sm ghost" onClick={() => nav.openActivity(s.date)}>{t.week.plusActivity}</button>
        </div>
        {s.activities.length ? s.activities.map((a) => (
          <div key={a.id} className="row between nowrap">
            <ActivityLine {...a} />
            <button type="button" className="btn sm ghost" aria-label={t.session.removeLabel(a.label)} onClick={() => patch((x) => { x.activities = x.activities.filter((y) => y.id !== a.id); })}>{t.session.remove}</button>
          </div>
        )) : <span className="small">{t.session.activitiesHint}</span>}
      </section>

      <section className="card">
        <label className="lbl" htmlFor="s-note">{t.session.note}
          <textarea className="field" id="s-note" value={s.note} placeholder={t.session.notePh} onChange={(e) => patch((x) => { x.note = e.target.value; })} />
        </label>
        <div className="row between">
          {live
            ? <button type="button" className="btn primary" onClick={finish}>{t.session.finish}</button>
            : <button type="button" className="btn primary" onClick={close}>{t.session.close}</button>}
          <Confirm label={t.session.delete} confirmLabel={t.session.deleteConfirm} onConfirm={() => {
            stopGuidedHere();
            update((d) => { d.sessions = d.sessions.filter((y) => y.id !== s.id); d.activeId = null; });
            stopRest();
            toast(t.session.deleted);
            nav.go("today");
          }} />
        </div>
      </section>
    </div>
  );
}
