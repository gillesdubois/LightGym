import { describe, expect, it } from "vitest";
import { parseDurationMin, parseDistanceKm, detectType } from "./activities";
import { parseImport } from "./importer";
import { allAtTop, parseLine, splitExercises } from "./parse";
import { EXAMPLE_PROGRAM, parseDuration, parseProgram, placeholderFor, timedTotal } from "./program";
import { addPlan, applyImport, beginSession, buildPrompt, createSession, fillWeekFromProgram, moveSession, movePlan, pendingPlanOn, removePlan, sessionLines, weekMarkdown } from "./sessions";
import { migrate } from "./store";

let n = 0;
const id = () => `id${++n}`;

describe("parseLine", () => {
  it("lit nom, charge, séries, objectif et valeurs", () => {
    const p = parseLine("* Tractions +12kg 4x [4-6] : 6,6,6,5")!;
    expect(p.name).toBe("Tractions");
    expect(p.load).toBe("+12 kg");
    expect(p.sets).toBe(4);
    expect(p.targetTxt).toBe("4-6");
    expect(p.values.map((v) => v.txt)).toEqual(["6", "6", "6", "5"]);
    expect(p.values[0].cls).toBe("top");
  });

  it("lit les côtés et les secondes", () => {
    const p = parseLine("Front lever one-leg (jambe 90°) 5x [8-12s] : 12s D, 11s G, D11s, 8s")!;
    expect(p.values.map((v) => [v.side, v.txt])).toEqual([["D", "12s"], ["G", "11s"], ["D", "11s"], [null, "8s"]]);
    expect(p.values[3].cls).toBe("");
  });

  it("garde le texte non reconnu", () => {
    const p = parseLine("Dragon flag négatif 3x [3-5] : remplacé par hollow hold")!;
    expect(p.values[0].kind).toBe("txt");
    expect(parseLine("Handstand libre")!.free).toBe(true);
  });

  it("détecte le haut de fourchette sur toutes les séries", () => {
    expect(allAtTop(parseLine("Dips 4x [5-6] : 6,6,6,6")!)).toBe(true);
    expect(allAtTop(parseLine("Dips 4x [5-6] : 6,6,6")!)).toBe(false);
  });

  it("colore les supersets selon l'objectif de chaque exercice", () => {
    const p = parseLine("Dips / Clean & press 20kg 4x [6-8 / 5] : 8/5, 8/5, 7/5, 5/5")!;
    expect(p.values.map((v) => v.cls)).toEqual(["top", "top", "", "low"]);
    expect(allAtTop(p)).toBe(false);
    const all = parseLine("Tractions / Swing KB 20kg 4x [8-10 / 15] : 10/15, 10/15, 10/15, 10/15")!;
    expect(allAtTop(all)).toBe(true);
  });

  it("garde un objectif par côté sur une seule valeur", () => {
    const p = parseLine("One arm push-up 3x [3-5/côté] : 5/5, 4/4, 2/3")!;
    expect(p.target).toEqual({ low: 3, high: 5 });
    expect(p.values.map((v) => v.cls)).toEqual(["top", "", "low"]);
    const archer = parseLine("Pompes archer / Swing 3x [6 par côté / 15] : 6/15, 6/14")!;
    expect(archer.values.map((v) => v.cls)).toEqual(["top", "low"]);
  });

  it("découpe un superset en deux exercices", () => {
    const p = parseLine("Tractions strictes / Swing KB 20kg 4x [8-10 / 15] : 10/15, 10/15, 8/15, 7/14")!;
    const [a, b] = splitExercises(p);
    expect(a.name).toBe("Tractions strictes");
    expect(a.values.map((v) => v.num)).toEqual([10, 10, 8, 7]);
    expect(b.name).toBe("Swing KB");
    expect(b.load).toBe("20 kg");
    expect(b.values.map((v) => v.num)).toEqual([15, 15, 15, 14]);
  });
});

describe("activités", () => {
  it("lit durée, distance et type", () => {
    expect(parseDistanceKm("Vélotaf 2x4 km")).toBe(8);
    expect(parseDurationMin("1h20 de gravel")).toBe(80);
    expect(parseDurationMin("Running 21 minutes / 3km")).toBe(21);
    expect(detectType("1h20 de gravel")).toBe("gravel");
    expect(detectType("Escalade en bloc 1 heure")).toBe("climb");
  });
});

describe("parseImport", () => {
  const today = "2026-10-12";

  it("lit le format carnet actuel", () => {
    const text = `# Semaine du 05/10

## Lun 05/10 — Haut du corps + front lever (fort)

* Front lever one-leg (jambe 90°) 5x [8-12s] : G 12s, D 12s, G 11s, D11s, 15s

Note : dernière série en tuck.
* Tractions +12kg 4x [5-6] : 6,5,4,4

Autre :
- vélo 7km
- yoga

Note : séance moyenne.

## Mar 06/10 — Cardio

- Running : 3km en 6,30minutes le km
* Handstand libre : N/A`;
    const r = parseImport(text, id, today);
    expect(r.days).toHaveLength(2);
    const [lun, mar] = r.days;
    expect(lun.date).toBe("2026-10-05");
    expect(lun.title).toBe("Haut du corps + front lever (fort)");
    expect(lun.lines).toHaveLength(2);
    expect(lun.activities.map((a) => a.type)).toEqual(["bike", "yoga"]);
    expect(lun.note).toContain("dernière série en tuck");
    expect(lun.note).toContain("séance moyenne");
    expect(mar.lines).toHaveLength(0);
    expect(mar.activities.map((a) => a.type)).toEqual(["run", "handstand"]);
  });

  it("lit l'ancien format avec objectif puis valeurs", () => {
    const text = `Résultats semaine 1409

1/ Lundi 14

5x One leg front lever : Objectif 8-12 secs
- 12s,12s,12s,11s,11s

4x Tractions lestées  12kg : Objectif 4-6 reps
- 6,5,5,4

2/ Mardi 15

Séance de vélo. 57 Minutes en mode gravel. 20km de trajet.`;
    const r = parseImport(text, id, today);
    expect(r.days.map((d) => d.date)).toEqual(["2026-09-14", "2026-09-15"]);
    expect(r.days[0].lines).toEqual([
      "One leg front lever 5x [8-12s] : 12s,12s,12s,11s,11s",
      "Tractions lestées  12kg 4x [4-6] : 6,5,5,4",
    ]);
    expect(r.days[1].activities[0].distanceKm).toBe(20);
    expect(r.days[1].activities[0].durationMin).toBe(57);
  });

  it("lit les en-têtes « Lun 21/09 : » et ignore le texte hors journée", () => {
    const text = `Bonjour,

Lun 21/09 :
Front lever one-leg 5x [8-12s]: 12s,12s,10s,10s,15s
2x4km à vélo

Mer 23/09 :
Bulgare +20kg 4x [6-8]: 8,8,8,8
Bonus : 1h20 de gravel à la fin de la journée`;
    const r = parseImport(text, id, today);
    expect(r.ignoredLines).toBe(1);
    expect(r.days[0].lines).toHaveLength(1);
    expect(r.days[0].activities[0].distanceKm).toBe(8);
    expect(r.days[1].activities[0].durationMin).toBe(80);
  });

  it("devine l'année sans dépasser aujourd'hui", () => {
    const r = parseImport("Lun 29/12 :\n* Tractions 3x [5] : 5,5,5", id, today);
    expect(r.days[0].date).toBe("2025-12-29");
  });

  it("relit son propre export Markdown", () => {
    const data = migrate({});
    const s = createSession("2026-10-12", null, "manual");
    s.title = "Pull";
    s.lines = ["Tractions 4x [8-10] : 10,10,8,7"];
    s.activities = [{ id: "a", type: "commute", label: "Vélotaf 2x4 km", distanceKm: 8 }];
    s.note = "Dernier bloc non fait.";
    data.sessions.push(s);
    const r = parseImport(weekMarkdown(data, "2026-10-12"), id, today);
    expect(r.days).toHaveLength(1);
    expect(r.days[0].lines).toEqual(s.lines);
    expect(r.days[0].activities[0].label).toBe("Vélotaf 2x4 km");
    expect(r.days[0].note).toBe("Dernier bloc non fait.");
  });
});

describe("parseProgram", () => {
  const settings = { defaultRest: 90, skillRest: 150 };

  it("lit le programme d'exemple", () => {
    const { templates, warnings } = parseProgram(EXAMPLE_PROGRAM.fr, settings);
    expect(warnings).toEqual([]);
    expect(templates.map((t) => t.weekday)).toEqual([0, 1, 2, 4, null]);
    const lun = templates[0];
    expect(lun.title).toBe("Haut du corps");
    expect(lun.blocks[0]).toMatchObject({ kind: "skill", sets: 3, rest: 150 });
    expect(lun.blocks[1]).toMatchObject({ kind: "superset", tag: "core", sets: 4, rest: 90 });
    expect(lun.blocks[2].tag).toBe("bonus");
    const mar = templates[1];
    expect(mar.blocks).toHaveLength(2);
    expect(mar.blocks[0]).toMatchObject({ kind: "single", rest: 0, exos: [{ name: "Running", target: "30 min facile" }] });
    expect(templates[4].blocks[0].exos).toHaveLength(3);
  });

  it("propose une valeur par défaut", () => {
    expect(placeholderFor({ exos: [{ name: "a", target: "8-10" }, { name: "b", target: "15" }] })).toBe("10/15");
    expect(placeholderFor({ exos: [{ name: "a", target: "8-12s" }] })).toBe("12s");
    expect(placeholderFor({ exos: [{ name: "a", target: "libre" }] })).toBe("");
    expect(placeholderFor({ exos: [{ name: "a", target: "5-6 / jambe" }] })).toBe("6");
    expect(placeholderFor({ exos: [{ name: "a", target: "3-4 km, allure facile" }] })).toBe("");
  });

  it("produit des lignes au format carnet", () => {
    const { templates } = parseProgram(EXAMPLE_PROGRAM.fr, settings);
    const s = createSession("2026-10-12", templates[0]);
    s.blocks[1].values = ["8/15", "7/14"];
    expect(sessionLines(s)).toEqual(["Tractions / Pompes 4x [6-8 / 12-15] : 8/15, 7/14"]);
  });
});

describe("buildPrompt", () => {
  it("assemble contexte, tendances et semaine", () => {
    const data = migrate({ context: "Contexte de test." });
    for (const [date, v] of [["2026-10-05", "6,5,4,4"], ["2026-10-12", "6,6,5,5"]]) {
      const s = createSession(date, null, "manual");
      s.lines = [`Tractions 4x [5-6] : ${v}`];
      data.sessions.push(s);
    }
    const p = buildPrompt(data, { monday: "2026-10-12", context: true, program: true, trends: true, week: true, question: "Analyse." });
    expect(p).toContain("## Contexte\nContexte de test.");
    expect(p).toContain("- Tractions : 05/10 4x [5-6] 6,5,4,4 · 12/10 4x [5-6] 6,6,5,5");
    expect(p).toContain("## Semaine du 12/10");
    expect(p).not.toContain("## Programme");
  });
});

describe("anglais", () => {
  const today = "2026-10-12";

  it("lit des notes en anglais", () => {
    const text = `# Week of 05/10

## Mon 05/10 — Upper body
* Pull-ups +12kg 4x [5-6] : 6,5,4,4
* Front lever one-leg 5x [8-12s] : L 12s, R 12s, L11s
Other:
- bike 7km
- yoga 15 minutes
Note: a bit tired.

## Tuesday 06/10
- Running 5 km in 28 min
Extra: 1h30 bouldering`;
    const r = parseImport(text, id, today);
    expect(r.warnings).toEqual([]);
    const [mon, tue] = r.days;
    expect(mon.date).toBe("2026-10-05");
    expect(mon.title).toBe("Upper body");
    expect(mon.activities.map((a) => a.type)).toEqual(["bike", "yoga"]);
    expect(mon.activities[1].durationMin).toBe(15);
    expect(mon.note).toBe("a bit tired.");
    expect(parseLine(mon.lines[1])!.values.map((v) => v.side)).toEqual(["L", "R", "L"]);
    expect(tue.date).toBe("2026-10-06");
    expect(tue.activities.map((a) => [a.type, a.distanceKm, a.durationMin])).toEqual([["run", 5, 28], ["climb", undefined, 90]]);
  });

  it("lit l'ancien format avec « Target »", () => {
    const r = parseImport("Week of 14/09\nMonday 14\n4x Pull-ups 12kg : Target 4-6 reps\n- 6,5,5,4", id, today);
    expect(r.days[0].lines).toEqual(["Pull-ups 12kg 4x [4-6] : 6,5,5,4"]);
  });

  it("relit son export Markdown anglais", () => {
    const data = migrate({});
    const s = createSession("2026-10-12", null, "manual");
    s.lines = ["Pull-ups 4x [8-10] : 10,10,8,7"];
    s.activities = [{ id: "a", type: "commute", label: "Bike commute 2x5 km", distanceKm: 10 }];
    s.note = "Good one.";
    data.sessions.push(s);
    const md = weekMarkdown(data, "2026-10-12", "en");
    expect(md).toContain("# Week of 12/10");
    expect(md).toContain("## Mon 12/10");
    expect(md).toContain("Other:");
    const r = parseImport(md, id, today);
    expect(r.days[0].lines).toEqual(s.lines);
    expect(r.days[0].activities[0].type).toBe("commute");
    expect(r.days[0].note).toBe("Good one.");
  });

  it("lit le programme d'exemple anglais", () => {
    const { templates, warnings } = parseProgram(EXAMPLE_PROGRAM.en, { defaultRest: 90, skillRest: 150 });
    expect(warnings).toEqual([]);
    expect(templates.map((t) => t.weekday)).toEqual([0, 1, 2, 4, null]);
    expect(templates[0].blocks[0]).toMatchObject({ kind: "skill", rest: 150 });
    expect(templates[0].blocks[1]).toMatchObject({ kind: "superset", tag: "core", sets: 4, rest: 90 });
    expect(templates[0].blocks[1].label).toBe("Superset A");
    expect(templates[0].blocks[2].tag).toBe("bonus");
    expect(placeholderFor({ exos: [{ name: "a", target: "8-10 / leg" }] })).toBe("10");
  });

  it("prompt en anglais", () => {
    const data = migrate({ context: "Test context." });
    const s = createSession("2026-10-12", null, "manual");
    s.lines = ["Pull-ups 4x [5-6] : 6,6,5,5"];
    data.sessions.push(s);
    const p = buildPrompt(data, { monday: "2026-10-12", context: true, program: false, trends: true, week: true, question: "Review.", lang: "en" });
    expect(p).toContain("## Context\nTest context.");
    expect(p).toContain("## Week of 12/10");
    expect(p).toContain("## Request\nReview.");
  });

  it("convertit les anciennes sauvegardes", () => {
    const d = migrate({ sessions: [{ id: "x", date: "2026-10-01", activities: [{ id: "a", type: "Vélotaf", label: "Vélotaf 8 km" }], blocks: [{ id: "b", tag: "noyau", exos: [], values: [] }] }] });
    expect(d.sessions[0].activities[0].type).toBe("commute");
    expect(d.sessions[0].blocks[0].tag).toBe("core");
    expect(d.settings.lang).toBe("auto");
  });
});

describe("planning", () => {
  const settings = { defaultRest: 90, skillRest: 150 };
  const yoga = { id: "yoga", title: "Yoga" };

  it("planifie un bloc sur un jour ou sur la semaine", () => {
    const d = migrate({});
    expect(addPlan(d, "2026-10-14", yoga)).toBe(1);
    expect(addPlan(d, "2026-10-14", yoga)).toBe(0);
    // Mercredi 14 : du mercredi au vendredi, puis jusqu'au dimanche.
    expect(addPlan(d, "2026-10-14", yoga, "weekdays")).toBe(2);
    expect(addPlan(d, "2026-10-14", yoga, "everyday")).toBe(2);
    expect(d.plan.map((p) => p.date).sort()).toEqual(["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  });

  it("place la semaine type sans doublon", () => {
    const { templates } = parseProgram(EXAMPLE_PROGRAM.fr, settings);
    const d = migrate({});
    expect(fillWeekFromProgram(d, "2026-10-12", templates)).toBe(4);
    expect(fillWeekFromProgram(d, "2026-10-12", templates)).toBe(0);
    expect(d.plan.map((p) => [p.date, p.templateId])).toContainEqual(["2026-10-16", "full-body"]);
  });

  it("garde l'id d'un bloc quand on retire son jour du titre", () => {
    const a = parseProgram("## Lundi — Pull\n- Tractions [8-10]", settings).templates[0];
    const b = parseProgram("## Pull\n- Tractions [8-10]", settings).templates[0];
    expect(a.id).toBe(b.id);
    expect(a.weekday).toBe(0);
    expect(b.weekday).toBeNull();
  });

  it("déplace un bloc et sa séance, le retire du planning", () => {
    const d = migrate({});
    addPlan(d, "2026-10-14", yoga);
    const p = d.plan[0];
    const s = createSession(p.date, null, "live", p.id);
    d.sessions.push(s);
    expect(pendingPlanOn(d, "2026-10-14")).toEqual([]);
    movePlan(d, p.id, "2026-10-15");
    expect(d.sessions[0].date).toBe("2026-10-15");
    removePlan(d, p.id);
    expect(d.plan).toEqual([]);
    expect(d.sessions[0].planId).toBeUndefined();
  });
});

describe("non-régression", () => {
  it("conserve la demande du prompt de bilan", () => {
    expect(migrate({}).question).toBeNull();
    expect(migrate({ question: "" }).question).toBe("");
    expect(migrate(JSON.parse(JSON.stringify(migrate({ question: "Bilan court" })))).question).toBe("Bilan court");
  });

  it("remplace une date sans effacer une autre journée du même import", () => {
    const d = migrate({ sessions: [{ id: "old", date: "2026-10-05", source: "import", lines: ["Tractions 4x : 5,5,5,5"] }] });
    const { days } = parseImport("# Semaine du 05/10/2026\n## Lun 05/10 — Matin\n* Tractions 4x : 6,6,6,6\n## Lun 05/10 — Soir\n* Pompes 3x : 20,20,20", id);
    expect(applyImport(d, days, ["replace", "replace"])).toBe(2);
    expect(d.sessions.map((s) => s.title).sort()).toEqual(["Matin", "Soir"]);
  });

  it("garde une séance en cours et les autres dates lors d'un remplacement", () => {
    const d = migrate({ sessions: [
      { id: "live", date: "2026-10-05", status: "live", lines: ["Squat : 10"] },
      { id: "other", date: "2026-10-06", source: "import", lines: ["Squat : 10"] },
    ] });
    const { days } = parseImport("## Lun 05/10/2026\n* Pompes : 20", id);
    applyImport(d, days, ["replace"]);
    expect(d.sessions.map((s) => s.id)).toEqual(expect.arrayContaining(["live", "other"]));
    expect(applyImport(d, days, ["skip"])).toBe(0);
    expect(d.sessions).toHaveLength(3);
  });

  it("termine toute séance restée en cours au démarrage d'une nouvelle", () => {
    const d = migrate({ sessions: [
      { id: "a", date: "2026-10-13", status: "live", lines: ["Squat : 10"] },
      { id: "empty", date: "2026-10-13", status: "live" },
      { id: "b", date: "2026-10-12", status: "done", lines: ["Squat : 8"] },
    ], activeId: "b" });
    const c = createSession("2026-10-14", null, "live");
    beginSession(d, c);
    expect(d.sessions.filter((s) => s.status === "live").map((s) => s.id)).toEqual([c.id]);
    expect(d.sessions.find((s) => s.id === "a")?.status).toBe("done");
    expect(d.sessions.some((s) => s.id === "empty")).toBe(false);
    expect(d.activeId).toBe(c.id);
  });

  it("déplace le bloc planifié avec sa séance", () => {
    const d = migrate({});
    addPlan(d, "2026-10-14", { id: "yoga", title: "Yoga" });
    const s = createSession("2026-10-14", null, "live", d.plan[0].id);
    const free = createSession("2026-10-14", null, "live");
    d.sessions.push(s, free);
    moveSession(d, s.id, "2026-10-16");
    expect(d.sessions[0].date).toBe("2026-10-16");
    expect(d.plan[0].date).toBe("2026-10-16");
    moveSession(d, free.id, "2026-10-17");
    expect(d.sessions[1].date).toBe("2026-10-17");
    expect(d.plan[0].date).toBe("2026-10-16");
    // Lien vers un bloc absent (sauvegarde fusionnée) : la séance bouge quand même.
    const orphan = { ...createSession("2026-10-14", null, "live"), planId: "missing" };
    d.sessions.push(orphan);
    moveSession(d, orphan.id, "2026-10-18");
    expect(d.sessions[2].date).toBe("2026-10-18");
  });
});

describe("blocs minutés", () => {
  const settings = { defaultRest: 90, skillRest: 150 };

  it("lit les durées", () => {
    expect(parseDuration("1:00")).toEqual({ seconds: 60, perSide: false });
    expect(parseDuration("0:45 / côté")).toEqual({ seconds: 45, perSide: true });
    expect(parseDuration("15 min")).toEqual({ seconds: 900, perSide: false });
    expect(parseDuration("30 s / side")).toEqual({ seconds: 30, perSide: true });
    expect(parseDuration("10-15 min")).toBeNull();
    expect(parseDuration("8-10")).toBeNull();
  });

  it("enchaîne les lignes minutées en un bloc, avec leurs consignes", () => {
    const text = `> Commentaire en tête, ignoré
## Routine mobilité
> Description du bloc, ignorée
- Poignets : 1:00
> En quadrupédie.
- Chevilles : 0:45 / côté
> Pied à 10 cm du mur.
> Talon au sol.
- Chat vache : 1:00

## Yoga
- Yoga : 15 min

## Running
- Running : 3-4 km, allure facile`;
    const { templates, warnings } = parseProgram(text, settings);
    expect(warnings).toEqual([]);
    const [routine, yoga, run] = templates;
    expect(routine.blocks).toHaveLength(1);
    const b = routine.blocks[0];
    expect(b).toMatchObject({ kind: "timed", label: "Routine mobilité", sets: 1, rest: 0 });
    expect(b.exos.map((e) => [e.name, e.seconds, !!e.perSide])).toEqual([["Poignets", 60, false], ["Chevilles", 45, true], ["Chat vache", 60, false]]);
    expect(b.exos[0].cue).toBe("En quadrupédie.");
    expect(b.exos[1].cue).toBe("Pied à 10 cm du mur. Talon au sol.");
    expect(timedTotal(b)).toBe(210);
    expect(yoga.blocks[0]).toMatchObject({ kind: "timed", exos: [{ name: "Yoga", seconds: 900 }] });
    expect(run.blocks[0].kind).toBe("single");
  });

  it("rend minuté un bloc avec en-tête dont toutes les lignes ont une durée", () => {
    const { templates } = parseProgram("## Gainage\nCircuit | 3 tours\n- Planche : 0:45\n- Hollow : 0:30", settings);
    expect(templates[0].blocks[0]).toMatchObject({ kind: "timed", sets: 1, rest: 0 });
  });

  it("écrit un bloc minuté sur une ligne", () => {
    const { templates } = parseProgram("## Yoga\n- Yoga : 15 min", settings);
    const s = createSession("2026-10-14", templates[0]);
    s.blocks[0].values = ["12:40"];
    expect(sessionLines(s)).toEqual(["Yoga : 12:40"]);
    const v = parseLine("Yoga : 12:40")!.values[0];
    expect([v.kind, v.num, v.txt]).toEqual(["num", 760, "12:40"]);
  });
});
