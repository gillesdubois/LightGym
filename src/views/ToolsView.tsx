import { useMemo, useState } from "react";
import { LineView } from "../components/common";
import { addDays, DAY_LONG, ddmm, ddmmyyyy, dayLabel, isoWeek, mondayOf, todayISO } from "../lib/dates";
import { copyText, downloadText, toast } from "../lib/device";
import { type ImportResult, parseImport } from "../lib/importer";
import { EXAMPLE_PROGRAM, parseProgram } from "../lib/program";
import { allMarkdown, buildPrompt, createSession, isEmpty, sessionLines, weekMarkdown } from "../lib/sessions";
import { type Data, migrate, replaceAll, requestPersistence, uid, update } from "../lib/store";
import { Confirm } from "../components/common";

export type ToolSection = "bilan" | "import" | "programme" | "sauvegarde" | "reglages";

const SECTIONS: [ToolSection, string][] = [
  ["bilan", "Bilan"],
  ["import", "Import"],
  ["programme", "Programme"],
  ["sauvegarde", "Sauvegarde"],
  ["reglages", "Réglages"],
];

export default function ToolsView({ data, section, setSection }: { data: Data; section: ToolSection; setSection: (s: ToolSection) => void }) {
  return (
    <div className="stack">
      <div className="subnav" role="tablist" aria-label="Outils">
        {SECTIONS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={section === id} onClick={() => setSection(id)}>{label}</button>
        ))}
      </div>
      {section === "bilan" && <Bilan data={data} />}
      {section === "import" && <Import data={data} />}
      {section === "programme" && <Programme data={data} />}
      {section === "sauvegarde" && <Sauvegarde data={data} />}
      {section === "reglages" && <Reglages data={data} />}
    </div>
  );
}

/* ---------- Bilan et export Markdown ---------- */

function Bilan({ data }: { data: Data }) {
  const [monday, setMonday] = useState(mondayOf(todayISO()));
  const [mode, setMode] = useState<"prompt" | "md">("prompt");
  const [opts, setOpts] = useState({ context: true, program: true, trends: true, week: true });
  const [question, setQuestion] = useState("Fais une analyse de ma semaine et propose des options pour la semaine prochaine. Explique ton raisonnement, je déciderai.");

  const text = mode === "md" ? weekMarkdown(data, monday) : buildPrompt(data, { monday, ...opts, question });
  const copy = async () => toast((await copyText(text)) ? "Copié." : "Copie impossible : sélectionne le texte à la main.");

  return (
    <>
      <div className="weeknav">
        <button type="button" className="btn sm ghost" onClick={() => setMonday(addDays(monday, -7))} aria-label="Semaine précédente">‹</button>
        <div className="weeknav-label"><b>Semaine du {ddmm(monday)}</b><span className="mono small">S{isoWeek(monday)}</span></div>
        <button type="button" className="btn sm ghost" onClick={() => setMonday(addDays(monday, 7))} aria-label="Semaine suivante">›</button>
      </div>
      <div className="seg" role="tablist" aria-label="Type d'export">
        <button type="button" role="tab" aria-selected={mode === "prompt"} onClick={() => setMode("prompt")}>Prompt de bilan</button>
        <button type="button" role="tab" aria-selected={mode === "md"} onClick={() => setMode("md")}>Markdown</button>
      </div>

      {mode === "prompt" && (
        <section className="card">
          <span className="blk-label">Contenu du prompt</span>
          <div className="checks">
            {([
              ["context", "Contexte personnel", data.context.trim() ? null : "vide, à remplir ci-dessous"],
              ["program", "Programme en cours", data.programText.trim() ? null : "aucun programme"],
              ["trends", "Historique des exercices de la semaine", null],
              ["week", "Détail de la semaine", null],
            ] as const).map(([k, label, hint]) => (
              <label key={k} htmlFor={`opt-${k}`}>
                <input type="checkbox" id={`opt-${k}`} checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} />
                {label}{hint && <span className="small"> · {hint}</span>}
              </label>
            ))}
          </div>
          <label className="lbl" htmlFor="question">Demande
            <textarea className="field" id="question" value={question} onChange={(e) => setQuestion(e.target.value)} />
          </label>
          <details>
            <summary>Contexte personnel</summary>
            <p className="small">Qui tu es, ton rapport au sport, ton matériel, tes contraintes, la façon dont tu veux qu'on te réponde. Stocké sur cet appareil, ajouté en tête du prompt.</p>
            <textarea className="field" id="context" rows={7} value={data.context} onChange={(e) => update((d) => { d.context = e.target.value; })} placeholder="Je fais du sport par plaisir et pour la force fonctionnelle…" />
          </details>
        </section>
      )}

      <section className="card">
        <div className="row between">
          <span className="blk-label">{mode === "md" ? "Markdown (format carnet)" : "Prompt"}</span>
          <span className="small mono">{text.length} car.</span>
        </div>
        <pre className="out">{text}</pre>
        <div className="row">
          <button type="button" className="btn primary" onClick={copy}>Copier</button>
          {mode === "md" && <button type="button" className="btn" onClick={() => downloadText(`semaine-${monday}.md`, text)}>Télécharger</button>}
          {mode === "md" && <button type="button" className="btn ghost" onClick={() => downloadText(`lightgym-historique.md`, allMarkdown(data))}>Tout l'historique</button>}
        </div>
      </section>
    </>
  );
}

/* ---------- Import de masse ---------- */

type Choice = "add" | "replace" | "skip";

const IMPORT_EXAMPLE = `# Semaine du 05/10

## Lun 05/10 — Haut du corps
* Tractions +12kg 4x [5-6] : 6,5,4,4
* Front lever one-leg 5x [8-12s] : G 12s, D 12s, G 11s, D 11s
Autre :
- vélo 7km
Note : un peu fatigué.

## Mar 06/10 — Cardio
- Running 3 km en 19 min`;

function Import({ data }: { data: Data }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);

  const existingOn = (date: string) => data.sessions.filter((s) => s.date === date && !isEmpty(s));

  const analyse = () => {
    const r = parseImport(text, uid);
    setResult(r);
    setChoices(r.days.map((d) => {
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
    setText((t) => [t, ...texts].filter(Boolean).join("\n\n"));
    setResult(null);
  };

  const run = () => {
    if (!result) return;
    let added = 0;
    update((d) => {
      result.days.forEach((day, i) => {
        const c = choices[i];
        if (c === "skip") return;
        if (c === "replace") d.sessions = d.sessions.filter((s) => s.date !== day.date || s.status === "live");
        const s = createSession(day.date, null, "import");
        s.title = day.title;
        s.lines = day.lines;
        s.activities = day.activities;
        s.note = day.note;
        d.sessions.push(s);
        added++;
      });
    });
    toast(`${added} journée${added > 1 ? "s" : ""} importée${added > 1 ? "s" : ""}. Elles sont dans l'historique.`);
    setResult(null);
    setText("");
  };

  const counts = choices.reduce((m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }), {} as Record<Choice, number>);
  const range = result?.days.length ? [...result.days].map((d) => d.date).sort() : [];

  return (
    <>
      <section className="card">
        <p>Colle tes notes telles quelles, une ou plusieurs semaines d'un coup, ou choisis des fichiers .md ou .txt. Rien n'est enregistré avant la validation.</p>
        <textarea className="field mono" id="import-text" rows={10} value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} placeholder={IMPORT_EXAMPLE} aria-label="Notes à importer" />
        <div className="row">
          <button type="button" className="btn primary" disabled={!text.trim()} onClick={analyse}>Analyser</button>
          <label className="btn file" htmlFor="import-files">Choisir des fichiers
            <input id="import-files" type="file" accept=".md,.txt,.markdown,text/plain,text/markdown" multiple onChange={(e) => { void readFiles(e.target.files); e.target.value = ""; }} />
          </label>
          {text && <button type="button" className="btn ghost" onClick={() => { setText(""); setResult(null); }}>Vider</button>}
        </div>
        <details>
          <summary>Format reconnu</summary>
          <ul className="small help">
            <li><code>Semaine du 05/10</code> donne l'année et la semaine (facultatif). L'année est sinon déduite : jamais dans le futur.</li>
            <li>Une journée commence par <code>## Lun 05/10 — Titre</code>, <code>Lun 05/10 :</code> ou <code>Lundi 14</code> si la semaine est connue.</li>
            <li>Exercices : <code>Nom charge Nx [objectif] : valeurs</code>, ou l'ancien format <code>4x Tractions 12kg : Objectif 4-6</code> suivi de <code>- 6,5,5,4</code>.</li>
            <li><code>Autre :</code> puis des lignes <code>- vélo 7km</code> donnent des activités. Vélo, running, rando, escalade, yoga, corde… sont aussi reconnus seuls.</li>
            <li><code>Note :</code> et tout texte libre d'une journée vont dans la note. Le texte hors journée est ignoré.</li>
            <li>L'export Markdown de l'app se réimporte tel quel.</li>
          </ul>
        </details>
      </section>

      {result && (
        <section className="card">
          <div className="row between">
            <b>{result.days.length} journée{result.days.length > 1 ? "s" : ""} trouvée{result.days.length > 1 ? "s" : ""}</b>
            {range.length > 0 && <span className="small mono">{ddmmyyyy(range[0])} → {ddmmyyyy(range[range.length - 1])}</span>}
          </div>
          {result.ignoredLines > 0 && <span className="small">{result.ignoredLines} ligne{result.ignoredLines > 1 ? "s" : ""} hors journée ignorée{result.ignoredLines > 1 ? "s" : ""}.</span>}
          {result.warnings.map((w, i) => <div key={i} className="warn">{w}</div>)}
          {!result.days.length && <span className="small">Aucune journée reconnue. Vérifie que chaque journée commence par un jour et une date, par exemple « Lun 05/10 ».</span>}

          <div className="import-list">
            {result.days.map((d, i) => {
              const ex = existingOn(d.date);
              return (
                <details key={i} className={`import-row ${choices[i] === "skip" ? "skipped" : ""}`}>
                  <summary>
                    <span className="mono day-date">{dayLabel(d.date)}</span>
                    <span className="import-title">{d.title || "Sans titre"}<span className="small"> · {d.lines.length} ex. · {d.activities.length} act.{d.note ? " · note" : ""}</span></span>
                  </summary>
                  <div className="import-detail">
                    <span className="small mono">{ddmmyyyy(d.date)}</span>
                    {d.warnings.map((w, j) => <div key={j} className="warn">{w}</div>)}
                    {d.lines.map((l, j) => <LineView key={j} line={l} />)}
                    {d.activities.map((a) => <div key={a.id} className="act"><span className="act-type">{a.type}</span><span className="act-label">{a.label}</span></div>)}
                    {d.note && <div className="note">{d.note}</div>}
                  </div>
                  <div className="row import-choice">
                    {ex.length > 0 && <span className="small">Déjà {ex.length} séance{ex.length > 1 ? "s" : ""} ce jour</span>}
                    <select className="field sm" id={`choice-${i}`} aria-label={`Action pour ${dayLabel(d.date)}`} value={choices[i]} onChange={(e) => setChoices(choices.map((c, j) => (j === i ? (e.target.value as Choice) : c)))}>
                      <option value="add">{ex.length ? "Ajouter en plus" : "Importer"}</option>
                      {ex.length > 0 && <option value="replace">Remplacer l'existant</option>}
                      <option value="skip">Ignorer</option>
                    </select>
                  </div>
                </details>
              );
            })}
          </div>
          {result.days.length > 0 && (
            <div className="row">
              <button type="button" className="btn primary" disabled={!((counts.add ?? 0) + (counts.replace ?? 0))} onClick={run}>
                Importer {(counts.add ?? 0) + (counts.replace ?? 0)} journée{(counts.add ?? 0) + (counts.replace ?? 0) > 1 ? "s" : ""}
              </button>
              {counts.skip ? <span className="small">{counts.skip} ignorée{counts.skip > 1 ? "s" : ""}</span> : null}
            </div>
          )}
        </section>
      )}
    </>
  );
}

/* ---------- Programme ---------- */

function Programme({ data }: { data: Data }) {
  const [draft, setDraft] = useState(data.programText);
  const parsed = useMemo(() => parseProgram(draft, data.settings), [draft, data.settings]);
  const dirty = draft !== data.programText;

  return (
    <>
      <section className="card">
        <p>Écris ton programme en texte. Chaque titre <code>##</code> devient un gabarit de séance ; commence-le par un jour pour le proposer ce jour-là.</p>
        <textarea className="field mono" id="program" rows={16} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={EXAMPLE_PROGRAM} aria-label="Programme" />
        <div className="row">
          <button type="button" className="btn primary" disabled={!dirty} onClick={() => { update((d) => { d.programText = draft; }); toast("Programme enregistré."); }}>Enregistrer</button>
          {dirty && <button type="button" className="btn ghost" onClick={() => setDraft(data.programText)}>Annuler les modifications</button>}
          {!draft.trim() && <button type="button" className="btn ghost" onClick={() => setDraft(EXAMPLE_PROGRAM)}>Partir de l'exemple</button>}
        </div>
        <details>
          <summary>Syntaxe</summary>
          <ul className="small help">
            <li><code>## Lundi — Pull</code> : un gabarit associé au lundi. <code>## Séance courte</code> : un gabarit sans jour.</li>
            <li><code>Superset A · noyau | 4 tours | repos 1:30</code> : un bloc. <code>bonus</code> le rend facile à passer, <code>skill</code> ou <code>technique</code> lui donne le repos long.</li>
            <li><code>- Tractions [8-10]</code> : un exercice et son objectif. <code>5x</code> sur la ligne fixe le nombre de séries.</li>
            <li><code>- Running : 3-4 km facile</code> sans bloc : une ligne simple, sans repos.</li>
            <li>Les lignes qui commencent par <code>&gt;</code> sont des commentaires.</li>
          </ul>
        </details>
      </section>

      <section className="card">
        <span className="blk-label">Aperçu · {parsed.templates.length} gabarit{parsed.templates.length > 1 ? "s" : ""}</span>
        {parsed.warnings.map((w, i) => <div key={i} className="warn">{w}</div>)}
        {parsed.templates.map((t) => (
          <div key={t.id} className="tpl-preview">
            <div className="row between"><b>{t.title}</b><span className="mono small">{t.weekday !== null ? DAY_LONG[t.weekday] : "libre"}</span></div>
            {t.blocks.map((b, i) => (
              <div key={i} className="small tpl-block">
                <span className="mono">{b.label}{b.tag ? ` · ${b.tag}` : ""} · {b.sets}x{b.rest ? ` · ${Math.floor(b.rest / 60)}:${String(b.rest % 60).padStart(2, "0")}` : ""}</span>
                <span>{b.exos.map((e) => `${e.name}${e.target ? ` [${e.target}]` : ""}`).join(" / ")}</span>
              </div>
            ))}
          </div>
        ))}
        {!parsed.templates.length && <span className="small">Aucun gabarit pour l'instant.</span>}
      </section>
    </>
  );
}

/* ---------- Sauvegarde ---------- */

function Sauvegarde({ data }: { data: Data }) {
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
      setError("Ce fichier n'est pas une sauvegarde LightGym (JSON attendu, exporté depuis cette page).");
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
    toast(`${added} séance${added > 1 ? "s" : ""} ajoutée${added > 1 ? "s" : ""}.`);
  };

  return (
    <>
      <section className="card">
        <p>Tout est stocké dans ce navigateur, sur cet appareil. Une sauvegarde régulière évite de tout perdre si le navigateur efface ses données ou si tu changes de téléphone.</p>
        <span className="small mono">{count} séance{count > 1 ? "s" : ""} · programme {data.programText.trim() ? "enregistré" : "vide"}</span>
        <div className="row">
          <button type="button" className="btn primary" onClick={exportJson}>Exporter la sauvegarde</button>
          <label className="btn file" htmlFor="backup-file">Restaurer
            <input id="backup-file" type="file" accept=".json,application/json" onChange={(e) => { void readBackup(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
        {error && <div className="warn">{error}</div>}
        {pending && (
          <div className="card inset">
            <b>Sauvegarde lue : {pending.sessions.length} séances</b>
            <span className="small">Fusionner ajoute les séances absentes et garde les tiennes. Remplacer efface les données actuelles.</span>
            <div className="row">
              <button type="button" className="btn primary" onClick={merge}>Fusionner</button>
              <Confirm label="Remplacer tout" confirmLabel="Confirmer le remplacement" className="btn ghost danger" onConfirm={() => { replaceAll(pending); setPending(null); toast("Données remplacées."); }} />
              <button type="button" className="btn ghost" onClick={() => setPending(null)}>Annuler</button>
            </div>
          </div>
        )}
      </section>
      <section className="card">
        <span className="blk-label">Conservation</span>
        <p className="small">Sur iPhone, ajoute l'app à l'écran d'accueil (Partager → Sur l'écran d'accueil) : Safari peut sinon effacer les données d'un site non visité pendant 7 jours.</p>
        <div className="row">
          <button type="button" className="btn" onClick={async () => {
            const r = await requestPersistence();
            toast(r === true ? "Stockage protégé." : r === false ? "Le navigateur a refusé ; garde des sauvegardes." : "Option non disponible sur ce navigateur.");
          }}>Protéger le stockage</button>
        </div>
      </section>
      <section className="card">
        <span className="blk-label">Zone sensible</span>
        <div className="row">
          <Confirm label="Effacer toutes les données" confirmLabel="Tout effacer définitivement" className="btn ghost danger" onConfirm={() => { replaceAll(migrate({})); toast("Données effacées."); }} />
        </div>
      </section>
    </>
  );
}

/* ---------- Réglages ---------- */

function Reglages({ data }: { data: Data }) {
  const s = data.settings;
  const set = (k: keyof Data["settings"], v: string) => {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n < 0) return;
    update((d) => { d.settings[k] = n; });
  };
  return (
    <section className="card">
      <div className="grid3">
        <label className="lbl" htmlFor="set-rest">Repos par défaut (s)
          <input className="field mono" id="set-rest" inputMode="numeric" defaultValue={s.defaultRest} onBlur={(e) => set("defaultRest", e.target.value)} />
        </label>
        <label className="lbl" htmlFor="set-skill">Repos skill (s)
          <input className="field mono" id="set-skill" inputMode="numeric" defaultValue={s.skillRest} onBlur={(e) => set("skillRest", e.target.value)} />
        </label>
        <label className="lbl" htmlFor="set-target">Durée cible (min)
          <input className="field mono" id="set-target" inputMode="numeric" defaultValue={s.targetMinutes} onBlur={(e) => set("targetMinutes", e.target.value)} />
        </label>
      </div>
      <p className="small">Les repos s'appliquent aux blocs du programme qui n'indiquent pas le leur. La durée cible sert à la barre de progression d'une séance.</p>
    </section>
  );
}
