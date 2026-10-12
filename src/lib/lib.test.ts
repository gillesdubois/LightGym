import { describe, expect, it } from "vitest";
import { parseDurationMin, parseDistanceKm, detectType } from "./activities";
import { parseImport } from "./importer";
import { allAtTop, parseLine, splitExercises } from "./parse";
import { EXAMPLE_PROGRAM, parseProgram, placeholderFor } from "./program";
import { createSession, sessionLines, weekMarkdown, buildPrompt } from "./sessions";
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
    expect(detectType("1h20 de gravel")).toBe("Gravel");
    expect(detectType("Escalade en bloc 1 heure")).toBe("Escalade");
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
    expect(lun.activities.map((a) => a.type)).toEqual(["Vélo", "Yoga"]);
    expect(lun.note).toContain("dernière série en tuck");
    expect(lun.note).toContain("séance moyenne");
    expect(mar.lines).toHaveLength(0);
    expect(mar.activities.map((a) => a.type)).toEqual(["Running", "Handstand"]);
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
    s.activities = [{ id: "a", type: "Vélotaf", label: "Vélotaf 2x4 km", distanceKm: 8 }];
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
    const { templates, warnings } = parseProgram(EXAMPLE_PROGRAM, settings);
    expect(warnings).toEqual([]);
    expect(templates.map((t) => t.weekday)).toEqual([0, 1, 2, 4, null]);
    const lun = templates[0];
    expect(lun.title).toBe("Haut du corps");
    expect(lun.blocks[0]).toMatchObject({ kind: "skill", sets: 3, rest: 150 });
    expect(lun.blocks[1]).toMatchObject({ kind: "superset", tag: "noyau", sets: 4, rest: 90 });
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
    const { templates } = parseProgram(EXAMPLE_PROGRAM, settings);
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
