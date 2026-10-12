import { useState } from "react";
import type { Nav } from "../App";
import { ActivityLine, Chip, Confirm, LineView, useNow, useTemplates } from "../components/common";
import { DAYS, dayLabel, fmtClock, todayISO, weekday } from "../lib/dates";
import { beep, releaseScreen, toast, unlockAudio } from "../lib/device";
import { useT } from "../lib/i18n";
import { parseLine, parseTarget, parseValue } from "../lib/parse";
import { placeholderFor } from "../lib/program";
import { isEmpty } from "../lib/sessions";
import { type Data, type Session, update } from "../lib/store";
import { startRest, stopRest } from "../lib/timers";

export default function SessionView({ data, nav, session }: { data: Data; nav: Nav; session: Session | null }) {
  if (!session) return <Picker data={data} nav={nav} />;
  return <Editor key={session.id} data={data} nav={nav} s={session} />;
}

function Picker({ data, nav }: { data: Data; nav: Nav }) {
  const t = useT();
  const [date, setDate] = useState(todayISO());
  const { templates } = useTemplates(data);
  const wd = weekday(date);
  const sorted = [...templates].sort((a, b) => Number(b.weekday === wd) - Number(a.weekday === wd));
  return (
    <div className="stack">
      <section className="card">
        <h2 className="h2">{t.session.newTitle}</h2>
        <label className="lbl" htmlFor="pick-date">{t.session.date}
          <input className="field" id="pick-date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <button type="button" className="btn primary" onClick={() => nav.startSession(date, null)}>{t.session.freeSession}</button>
      </section>
      {sorted.length > 0 && (
        <section className="card">
          <span className="blk-label">{t.session.fromProgram}</span>
          <div className="tpl-list">
            {sorted.map((x) => (
              <button key={x.id} type="button" className="tpl" onClick={() => nav.startSession(date, x)}>
                <span>
                  <b>{x.title}</b>
                  <span className="small">{x.blocks.map((b) => b.exos.map((e) => e.name).join(" / ")).join(" · ")}</span>
                </span>
                <span className="mono small">{x.weekday !== null ? DAYS[t.lang].long[x.weekday] : t.session.anyDay}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {!templates.length && <p className="small">{t.session.noProgram}</p>}
    </div>
  );
}

function Editor({ data, nav, s }: { data: Data; nav: Nav; s: Session }) {
  const t = useT();
  const live = s.status === "live";
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [hold, setHold] = useState<{ blockId: string; start: number } | null>(null);
  const now = useNow(live || hold !== null);
  const [free, setFree] = useState("");
  const [editLines, setEditLines] = useState<string | null>(null);

  const patch = (fn: (x: Session) => void) =>
    update((d) => {
      const x = d.sessions.find((y) => y.id === s.id);
      if (x) fn(x);
    });

  const elapsed = s.startedAt ? (now - s.startedAt) / 1000 : 0;
  const target = data.settings.targetMinutes * 60;

  const addSet = (blockId: string) => {
    unlockAudio();
    const b = s.blocks.find((x) => x.id === blockId)!;
    const val = (inputs[blockId] ?? "").trim() || placeholderFor(b);
    if (!val) {
      toast(t.session.needValue);
      return;
    }
    patch((x) => x.blocks.find((y) => y.id === blockId)!.values.push(val));
    setInputs((m) => ({ ...m, [blockId]: "" }));
    const count = b.values.length + 1;
    if (count >= b.sets) toast(t.session.blockCount(b.label, count, b.sets));
    else if (b.rest > 0) startRest(b.rest);
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

  const finish = () => {
    update((d) => {
      const x = d.sessions.find((y) => y.id === s.id);
      if (x) x.status = "done";
      if (x && isEmpty(x)) d.sessions = d.sessions.filter((y) => y.id !== s.id);
      d.activeId = null;
    });
    stopRest();
    releaseScreen();
    toast(t.session.finished);
    nav.go("semaine");
  };

  const close = () => {
    update((d) => { d.activeId = null; });
    nav.go("semaine");
  };

  const freePreview = free.split("\n").map((l) => l.trim()).filter(Boolean);

  return (
    <div className="stack">
      <section className="card">
        <div className="grid2">
          <label className="lbl" htmlFor="s-title">{t.session.title}
            <input className="field" id="s-title" value={s.title} placeholder={t.session.titlePh} onChange={(e) => patch((x) => { x.title = e.target.value; })} />
          </label>
          <label className="lbl" htmlFor="s-date">{t.session.date}
            <input className="field" id="s-date" type="date" value={s.date} onChange={(e) => e.target.value && patch((x) => { x.date = e.target.value; })} />
          </label>
        </div>
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
      </section>

      {s.blocks.map((b) => {
        const target1 = b.kind === "skill" || b.exos.length === 1 ? parseTarget(b.exos[0]?.target) : null;
        const ph = placeholderFor(b);
        const holdable = b.exos.length === 1 && /\d\s*s\b|sec/i.test(b.exos[0].target);
        const holdLeft = hold?.blockId === b.id ? (now - hold.start) / 1000 : null;
        return (
          <section key={b.id} className={`card blk ${b.skipped ? "skipped" : ""}`}>
            <div className="row between">
              <span className="blk-label">{b.label}{b.rest ? ` · ${t.session.rest(fmtClock(b.rest))}` : ""}</span>
              <span className="row">
                {b.tag === "bonus" && <span className="pill bonus">{t.session.bonus}</span>}
                {b.tag === "core" && <span className="pill">{t.session.core}</span>}
                {b.tag === "bonus" && (
                  <button type="button" className="btn sm ghost" onClick={() => patch((x) => { const y = x.blocks.find((z) => z.id === b.id)!; y.skipped = !y.skipped; })}>
                    {b.skipped ? t.session.resume : t.session.skip}
                  </button>
                )}
              </span>
            </div>
            {!b.skipped && (
              <>
                {b.exos.map((e, i) => (
                  <div key={i} className="pair"><span>{e.name}</span>{e.target && <span className="target">{e.target}</span>}</div>
                ))}
                <div className="row between">
                  <div className="chips">
                    {b.values.length ? b.values.map((v, i) => {
                      const p = parseValue(v, target1);
                      return p ? <Chip key={i} v={p} /> : null;
                    }) : <span className="small">{t.session.noSet}</span>}
                  </div>
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
                    onChange={(e) => setInputs((m) => ({ ...m, [b.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && addSet(b.id)}
                  />
                  <button type="button" className="btn primary" onClick={() => addSet(b.id)}>{t.session.logSet}</button>
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
              </>
            )}
          </section>
        );
      })}

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
            update((d) => { d.sessions = d.sessions.filter((y) => y.id !== s.id); d.activeId = null; });
            stopRest();
            toast(t.session.deleted);
            nav.go("semaine");
          }} />
        </div>
      </section>
    </div>
  );
}
