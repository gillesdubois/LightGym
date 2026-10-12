import { useEffect, useState } from "react";
import { ACTIVITY_TYPES, paceLabel } from "../lib/activities";
import { todayISO } from "../lib/dates";
import { toast } from "../lib/device";
import { addActivityTo } from "../lib/sessions";
import { uid, update } from "../lib/store";

export default function ActivitySheet({ date, onClose }: { date?: string; onClose: () => void }) {
  const [type, setType] = useState("Running");
  const [day, setDay] = useState(date ?? todayISO());
  const [dur, setDur] = useState("");
  const [dist, setDist] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const add = () => {
    const durationMin = dur ? parseFloat(dur.replace(",", ".")) : undefined;
    const distanceKm = dist ? parseFloat(dist.replace(",", ".")) : undefined;
    let label = type;
    if (distanceKm) label += ` ${String(distanceKm).replace(".", ",")} km`;
    if (durationMin) label += `${distanceKm ? " en" : ""} ${durationMin} min`;
    const pace = /Running|Rando|Marche/.test(type) ? paceLabel(durationMin, distanceKm) : null;
    if (pace) label += ` (${pace})`;
    if (note.trim()) label += ` · ${note.trim()}`;
    update((d) => addActivityTo(d, day, { id: uid(), type, label, durationMin, distanceKm }));
    toast("Activité ajoutée.");
    onClose();
  };

  return (
    <div className="sheet-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="row between">
          <h3 id="sheet-title">Ajouter une activité</h3>
          <button type="button" className="btn sm ghost" onClick={onClose}>Fermer</button>
        </div>
        <div className="types">
          {ACTIVITY_TYPES.map((t) => (
            <button key={t} type="button" aria-pressed={t === type} onClick={() => setType(t)}>{t}</button>
          ))}
        </div>
        <div className="grid3">
          <label className="lbl" htmlFor="act-day">Jour
            <input className="field" id="act-day" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          </label>
          <label className="lbl" htmlFor="act-dur">Durée (min)
            <input className="field mono" id="act-dur" inputMode="decimal" value={dur} onChange={(e) => setDur(e.target.value)} placeholder="30" />
          </label>
          <label className="lbl" htmlFor="act-dist">Distance (km)
            <input className="field mono" id="act-dist" inputMode="decimal" value={dist} onChange={(e) => setDist(e.target.value)} placeholder="5" />
          </label>
        </div>
        <label className="lbl" htmlFor="act-note">Note
          <input className="field" id="act-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Allure facile, jambes lourdes" />
        </label>
        <button type="button" className="btn primary" onClick={add}>Ajouter</button>
      </div>
    </div>
  );
}
