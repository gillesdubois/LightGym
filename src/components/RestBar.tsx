import { fmtClock } from "../lib/dates";
import { useT } from "../lib/i18n";
import { addRest, rest, stopRest, useTimers } from "../lib/timers";

export default function RestBar() {
  useTimers();
  const t = useT();
  if (!rest) return null;
  const left = (rest.end - Date.now()) / 1000;
  const pct = Math.max(0, Math.min(100, (left / rest.total) * 100));
  return (
    <div className={`restbar ${rest.overAt ? "over" : ""}`} role="timer" aria-live="off">
      <span className="lab">{rest.overAt ? t.rest.over : t.rest.label}</span>
      <span className="time">{left > 0 ? fmtClock(left) : "0:00"}</span>
      <button type="button" onClick={() => addRest(15)}>{t.rest.plus}</button>
      <button type="button" onClick={stopRest}>{rest.overAt ? t.rest.close : t.rest.skip}</button>
      <div className="rp"><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
