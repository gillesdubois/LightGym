import { useEffect, useState } from "react";
import { ACTIVITY_TYPES, type ActivityType, isPaced, paceLabel } from "../lib/activities";
import { todayISO } from "../lib/dates";
import { toast } from "../lib/device";
import { useT } from "../lib/i18n";
import { addActivityTo } from "../lib/sessions";
import { uid, update } from "../lib/store";

export default function ActivitySheet({ date, onClose }: { date?: string; onClose: () => void }) {
  const t = useT();
  const [type, setType] = useState<ActivityType>("run");
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
    let label = t.activity.types[type];
    if (distanceKm) label += ` ${distanceKm.toLocaleString(t.locale)} km`;
    if (durationMin) label += `${distanceKm ? ` ${t.activity.durationJoin}` : ""} ${durationMin} min`;
    const pace = isPaced(type) ? paceLabel(durationMin, distanceKm) : null;
    if (pace) label += ` (${pace})`;
    if (note.trim()) label += ` · ${note.trim()}`;
    update((d) => addActivityTo(d, day, { id: uid(), type, label, durationMin, distanceKm }));
    toast(t.activity.added);
    onClose();
  };

  return (
    <div className="sheet-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="row between">
          <h3 id="sheet-title">{t.activity.sheetTitle}</h3>
          <button type="button" className="btn sm ghost" onClick={onClose}>{t.common.close}</button>
        </div>
        <div className="types">
          {ACTIVITY_TYPES.map((k) => (
            <button key={k} type="button" aria-pressed={k === type} onClick={() => setType(k)}>{t.activity.types[k]}</button>
          ))}
        </div>
        <div className="grid3">
          <label className="lbl" htmlFor="act-day">{t.activity.day}
            <input className="field" id="act-day" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          </label>
          <label className="lbl" htmlFor="act-dur">{t.activity.duration}
            <input className="field mono" id="act-dur" inputMode="decimal" value={dur} onChange={(e) => setDur(e.target.value)} placeholder="30" />
          </label>
          <label className="lbl" htmlFor="act-dist">{t.activity.distance}
            <input className="field mono" id="act-dist" inputMode="decimal" value={dist} onChange={(e) => setDist(e.target.value)} placeholder="5" />
          </label>
        </div>
        <label className="lbl" htmlFor="act-note">{t.activity.note}
          <input className="field" id="act-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.activity.notePh} />
        </label>
        <button type="button" className="btn primary" onClick={add}>{t.activity.add}</button>
      </div>
    </div>
  );
}
