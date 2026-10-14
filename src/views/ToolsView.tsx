import { useMemo, useState } from "react";
import { Confirm, LineView, Rich, activityTypeLabel } from "../components/common";
import { addDays, DAYS, dayLabel, ddmm, ddmmyyyy, isoWeek, mondayOf, todayISO } from "../lib/dates";
import { copyText, downloadText, toast } from "../lib/device";
import { useT } from "../lib/i18n";
import { type ImportResult, parseImport } from "../lib/importer";
import { EXAMPLE_PROGRAM, parseProgram } from "../lib/program";
import { allMarkdown, applyImport, buildPrompt, type ImportChoice, isEmpty, sessionLines, weekMarkdown } from "../lib/sessions";
import { type Data, type LangSetting, migrate, replaceAll, requestPersistence, uid, update } from "../lib/store";

export type ToolSection = "bilan" | "import" | "programme" | "sauvegarde" | "reglages";

const SECTIONS: ToolSection[] = ["bilan", "import", "programme", "sauvegarde", "reglages"];

export default function ToolsView({ data, section, setSection }: { data: Data; section: ToolSection; setSection: (s: ToolSection) => void }) {
  const t = useT();
  return (
    <div className="stack">
      <div className="subnav" role="tablist" aria-label={t.tabs.outils}>
        {SECTIONS.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={section === id} onClick={() => setSection(id)}>{t.tools.sections[id]}</button>
        ))}
      </div>
      {section === "bilan" && <Review data={data} />}
      {section === "import" && <Import data={data} />}
      {section === "programme" && <Program data={data} />}
      {section === "sauvegarde" && <Backup data={data} />}
      {section === "reglages" && <Settings data={data} />}
    </div>
  );
}

/* ---------- Bilan et export Markdown ---------- */

function Review({ data }: { data: Data }) {
  const t = useT();
  const r = t.tools.review;
  const [monday, setMonday] = useState(mondayOf(todayISO()));
  const [mode, setMode] = useState<"prompt" | "md">("prompt");
  const [opts, setOpts] = useState({ context: true, program: true, trends: true, week: true });
  const [question, setQuestion] = useState<string | null>(null);
  const q = question ?? r.defaultQuestion;

  const text = mode === "md" ? weekMarkdown(data, monday, t.lang) : buildPrompt(data, { monday, ...opts, question: q, lang: t.lang });
  const copy = async () => toast((await copyText(text)) ? t.common.copied : t.common.copyFailed);

  return (
    <>
      <div className="weeknav">
        <button type="button" className="btn sm ghost" onClick={() => setMonday(addDays(monday, -7))} aria-label={t.common.prevWeek}>‹</button>
        <div className="weeknav-label"><b>{t.common.weekOf(ddmm(monday))}</b><span className="mono small">{t.common.weekNum(isoWeek(monday))}</span></div>
        <button type="button" className="btn sm ghost" onClick={() => setMonday(addDays(monday, 7))} aria-label={t.common.nextWeek}>›</button>
      </div>
      <div className="seg" role="tablist" aria-label={r.exportType}>
        <button type="button" role="tab" aria-selected={mode === "prompt"} onClick={() => setMode("prompt")}>{r.promptTab}</button>
        <button type="button" role="tab" aria-selected={mode === "md"} onClick={() => setMode("md")}>{r.mdTab}</button>
      </div>

      {mode === "prompt" && (
        <section className="card">
          <span className="blk-label">{r.contents}</span>
          <div className="checks">
            {([
              ["context", r.optContext, data.context.trim() ? null : r.emptyContext],
              ["program", r.optProgram, data.programText.trim() ? null : r.noProgram],
              ["trends", r.optTrends, null],
              ["week", r.optWeek, null],
            ] as const).map(([k, label, hint]) => (
              <label key={k} htmlFor={`opt-${k}`}>
                <input type="checkbox" id={`opt-${k}`} checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} />
                {label}{hint && <span className="small"> · {hint}</span>}
              </label>
            ))}
          </div>
          <label className="lbl" htmlFor="question">{r.request}
            <textarea className="field" id="question" value={q} onChange={(e) => setQuestion(e.target.value)} />
          </label>
          <details>
            <summary>{r.contextTitle}</summary>
            <p className="small">{r.contextHelp}</p>
            <textarea className="field" id="context" rows={7} value={data.context} onChange={(e) => update((d) => { d.context = e.target.value; })} placeholder={r.contextPh} />
          </details>
        </section>
      )}

      <section className="card">
        <div className="row between">
          <span className="blk-label">{mode === "md" ? r.mdOut : r.promptOut}</span>
          <span className="small mono">{r.chars(text.length)}</span>
        </div>
        <pre className="out">{text}</pre>
        <div className="row">
          <button type="button" className="btn primary" onClick={copy}>{t.common.copy}</button>
          {mode === "md" && <button type="button" className="btn" onClick={() => downloadText(`lightgym-${monday}.md`, text)}>{r.download}</button>}
          {mode === "md" && <button type="button" className="btn ghost" onClick={() => downloadText("lightgym-history.md", allMarkdown(data, t.lang))}>{r.allHistory}</button>}
        </div>
      </section>
    </>
  );
}

/* ---------- Import de masse ---------- */

function Import({ data }: { data: Data }) {
  const t = useT();
  const im = t.tools.import;
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [choices, setChoices] = useState<ImportChoice[]>([]);

  const existingOn = (date: string) => data.sessions.filter((s) => s.date === date && !isEmpty(s));

  const analyse = () => {
    const res = parseImport(text, uid);
    setResult(res);
    setChoices(res.days.map((d) => {
      const ex = existingOn(d.date);
      if (!ex.length) return "add";
      const same = ex.some((s) => sessionLines(s).join("\n") === d.lines.join("\n") && s.note.trim() === d.note.trim());
      if (same) return "skip";
      return ex.every((s) => s.source === "import") ? "replace" : "add";
    }));
  };

  const readFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const texts = await Promise.all([...files].map((f) => f.text()));
    setText((prev) => [prev, ...texts].filter(Boolean).join("\n\n"));
    setResult(null);
  };

  const run = () => {
    if (!result) return;
    let added = 0;
    update((d) => { added = applyImport(d, result.days, choices); });
    toast(im.done(added));
    setResult(null);
    setText("");
  };

  const counts = choices.reduce((m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }), {} as Record<ImportChoice, number>);
  const toImport = (counts.add ?? 0) + (counts.replace ?? 0);
  const range = result?.days.length ? result.days.map((d) => d.date).sort() : [];

  return (
    <>
      <section className="card">
        <p>{im.intro}</p>
        <textarea className="field mono" id="import-text" rows={10} value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} placeholder={im.example} aria-label={im.label} />
        <div className="row">
          <button type="button" className="btn primary" disabled={!text.trim()} onClick={analyse}>{im.analyse}</button>
          <label className="btn file" htmlFor="import-files">{im.files}
            <input id="import-files" type="file" accept=".md,.txt,.markdown,text/plain,text/markdown" multiple onChange={(e) => { void readFiles(e.target.files); e.target.value = ""; }} />
          </label>
          {text && <button type="button" className="btn ghost" onClick={() => { setText(""); setResult(null); }}>{im.clear}</button>}
        </div>
        <details>
          <summary>{im.formatTitle}</summary>
          <ul className="small help">{im.format.map((h) => <Rich key={h} as="li" html={h} />)}</ul>
        </details>
      </section>

      {result && (
        <section className="card">
          <div className="row between">
            <b>{im.found(result.days.length)}</b>
            {range.length > 0 && <span className="small mono">{ddmmyyyy(range[0])} → {ddmmyyyy(range[range.length - 1])}</span>}
          </div>
          {result.ignoredLines > 0 && <span className="small">{im.ignored(result.ignoredLines)}</span>}
          {result.warnings.map((w, i) => <div key={i} className="warn">{t.importWarning(w)}</div>)}
          {!result.days.length && <span className="small">{im.none}</span>}

          <div className="import-list">
            {result.days.map((d, i) => {
              const ex = existingOn(d.date);
              return (
                <details key={i} className={`import-row ${choices[i] === "skip" ? "skipped" : ""}`}>
                  <summary>
                    <span className="mono day-date">{dayLabel(d.date, t.lang)}</span>
                    <span className="import-title">{d.title || im.untitled}<span className="small">{im.counts(d.lines.length, d.activities.length, !!d.note)}</span></span>
                  </summary>
                  <div className="import-detail">
                    <span className="small mono">{ddmmyyyy(d.date)}</span>
                    {d.warnings.map((w, j) => <div key={j} className="warn">{t.importWarning(w)}</div>)}
                    {d.lines.map((l, j) => <LineView key={j} line={l} />)}
                    {d.activities.map((a) => <div key={a.id} className="act"><span className="act-type">{activityTypeLabel(t, a.type)}</span><span className="act-label">{a.label}</span></div>)}
                    {d.note && <div className="note">{d.note}</div>}
                  </div>
                  <div className="row import-choice">
                    {ex.length > 0 && <span className="small">{im.existing(ex.length)}</span>}
                    <select className="field sm" id={`choice-${i}`} aria-label={im.actionFor(dayLabel(d.date, t.lang))} value={choices[i]} onChange={(e) => setChoices(choices.map((c, j) => (j === i ? (e.target.value as ImportChoice) : c)))}>
                      <option value="add">{ex.length ? im.addMore : im.add}</option>
                      {ex.length > 0 && <option value="replace">{im.replace}</option>}
                      <option value="skip">{im.skip}</option>
                    </select>
                  </div>
                </details>
              );
            })}
          </div>
          {result.days.length > 0 && (
            <div className="row">
              <button type="button" className="btn primary" disabled={!toImport} onClick={run}>{im.run(toImport)}</button>
              {counts.skip ? <span className="small">{im.skipped(counts.skip)}</span> : null}
            </div>
          )}
        </section>
      )}
    </>
  );
}

/* ---------- Programme ---------- */

function Program({ data }: { data: Data }) {
  const t = useT();
  const pg = t.tools.program;
  const [draft, setDraft] = useState(data.programText);
  const parsed = useMemo(() => parseProgram(draft, data.settings), [draft, data.settings]);
  const dirty = draft !== data.programText;

  return (
    <>
      <section className="card">
        <Rich as="p" html={pg.intro} />
        <textarea className="field mono" id="program" rows={16} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={EXAMPLE_PROGRAM[t.lang]} aria-label={pg.label} />
        <div className="row">
          <button type="button" className="btn primary" disabled={!dirty} onClick={() => { update((d) => { d.programText = draft; }); toast(pg.saved); }}>{pg.save}</button>
          {dirty && <button type="button" className="btn ghost" onClick={() => setDraft(data.programText)}>{pg.revert}</button>}
          {!draft.trim() && <button type="button" className="btn ghost" onClick={() => setDraft(EXAMPLE_PROGRAM[t.lang])}>{pg.fromExample}</button>}
        </div>
        <details>
          <summary>{pg.syntaxTitle}</summary>
          <ul className="small help">{pg.syntax.map((h) => <Rich key={h} as="li" html={h} />)}</ul>
        </details>
      </section>

      <section className="card">
        <span className="blk-label">{pg.preview(parsed.templates.length)}</span>
        {parsed.warnings.map((w, i) => <div key={i} className="warn">{t.programWarning(w)}</div>)}
        {parsed.templates.map((x) => (
          <div key={x.id} className="tpl-preview">
            <div className="row between"><b>{x.title}</b><span className="mono small">{x.weekday !== null ? DAYS[t.lang].long[x.weekday] : pg.anyDay}</span></div>
            {x.blocks.map((b, i) => (
              <div key={i} className="small tpl-block">
                <span className="mono">{b.label}{b.tag ? ` · ${b.tag === "core" ? t.session.core.toLowerCase() : t.session.bonus.toLowerCase()}` : ""} · {b.sets}x{b.rest ? ` · ${Math.floor(b.rest / 60)}:${String(b.rest % 60).padStart(2, "0")}` : ""}</span>
                <span>{b.exos.map((e) => `${e.name}${e.target ? ` [${e.target}]` : ""}`).join(" / ")}</span>
              </div>
            ))}
          </div>
        ))}
        {!parsed.templates.length && <span className="small">{pg.none}</span>}
      </section>
    </>
  );
}

/* ---------- Sauvegarde ---------- */

function Backup({ data }: { data: Data }) {
  const t = useT();
  const bk = t.tools.backup;
  const [pending, setPending] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const count = data.sessions.filter((s) => !isEmpty(s)).length;

  const exportJson = () => downloadText(`lightgym-${todayISO()}.json`, JSON.stringify(data, null, 2), "application/json");

  const readBackup = async (files: FileList | null) => {
    setError(null);
    const f = files?.[0];
    if (!f) return;
    try {
      const raw = JSON.parse(await f.text());
      if (!raw || typeof raw !== "object" || !Array.isArray(raw.sessions)) throw new Error();
      setPending(migrate(raw));
    } catch {
      setError(bk.invalid);
    }
  };

  const merge = () => {
    if (!pending) return;
    let added = 0;
    update((d) => {
      const ids = new Set(d.sessions.map((s) => s.id));
      for (const s of pending.sessions) if (!ids.has(s.id)) { d.sessions.push({ ...s, status: "done" }); added++; }
      if (!d.programText.trim()) d.programText = pending.programText;
      if (!d.context.trim()) d.context = pending.context;
    });
    setPending(null);
    toast(bk.merged(added));
  };

  return (
    <>
      <section className="card">
        <p>{bk.intro}</p>
        <span className="small mono">{bk.summary(count, !!data.programText.trim())}</span>
        <div className="row">
          <button type="button" className="btn primary" onClick={exportJson}>{bk.export}</button>
          <label className="btn file" htmlFor="backup-file">{bk.restore}
            <input id="backup-file" type="file" accept=".json,application/json" onChange={(e) => { void readBackup(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
        {error && <div className="warn">{error}</div>}
        {pending && (
          <div className="card inset">
            <b>{bk.read(pending.sessions.length)}</b>
            <span className="small">{bk.mergeHelp}</span>
            <div className="row">
              <button type="button" className="btn primary" onClick={merge}>{bk.merge}</button>
              <Confirm label={bk.replaceAll} confirmLabel={bk.replaceConfirm} className="btn ghost danger" onConfirm={() => { replaceAll(pending); setPending(null); toast(bk.replaced); }} />
              <button type="button" className="btn ghost" onClick={() => setPending(null)}>{t.common.cancel}</button>
            </div>
          </div>
        )}
      </section>
      <section className="card">
        <span className="blk-label">{bk.keepTitle}</span>
        <p className="small">{bk.keepHelp}</p>
        <div className="row">
          <button type="button" className="btn" onClick={async () => {
            const res = await requestPersistence();
            toast(res === true ? bk.persistOk : res === false ? bk.persistNo : bk.persistNa);
          }}>{bk.persist}</button>
        </div>
      </section>
      <section className="card">
        <span className="blk-label">{bk.danger}</span>
        <div className="row">
          <Confirm label={bk.wipe} confirmLabel={bk.wipeConfirm} className="btn ghost danger" onConfirm={() => { replaceAll(migrate({ settings: data.settings })); toast(bk.wiped); }} />
        </div>
      </section>
    </>
  );
}

/* ---------- Réglages ---------- */

function Settings({ data }: { data: Data }) {
  const t = useT();
  const st = t.tools.settings;
  const s = data.settings;
  const setNum = (k: "defaultRest" | "skillRest" | "targetMinutes", v: string) => {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n < 0) return;
    update((d) => { d.settings[k] = n; });
  };
  return (
    <section className="card">
      <label className="lbl" htmlFor="set-lang">{st.language}
        <select className="field" id="set-lang" value={s.lang} onChange={(e) => update((d) => { d.settings.lang = e.target.value as LangSetting; })}>
          <option value="auto">{st.auto}</option>
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </label>
      <div className="grid3">
        <label className="lbl" htmlFor="set-rest">{st.defaultRest}
          <input className="field mono" id="set-rest" inputMode="numeric" defaultValue={s.defaultRest} onBlur={(e) => setNum("defaultRest", e.target.value)} />
        </label>
        <label className="lbl" htmlFor="set-skill">{st.skillRest}
          <input className="field mono" id="set-skill" inputMode="numeric" defaultValue={s.skillRest} onBlur={(e) => setNum("skillRest", e.target.value)} />
        </label>
        <label className="lbl" htmlFor="set-target">{st.target}
          <input className="field mono" id="set-target" inputMode="numeric" defaultValue={s.targetMinutes} onBlur={(e) => setNum("targetMinutes", e.target.value)} />
        </label>
      </div>
      <p className="small">{st.help}</p>
    </section>
  );
}
