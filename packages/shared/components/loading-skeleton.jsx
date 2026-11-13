import { FileText, UserRound, Search, CalendarDays, Clock, PencilLine, Trash2 } from "lucide-react";
import "./loading-skeleton.css";

const Bar = ({ short = false }) => <span className={`loading-shape loading-line${short ? " is-short" : ""}`} />;
function Rows({ tiles = false, schedule = false }) {
  return <div className={`loading-rows${tiles ? " is-tiles" : ""}`}>{[0, 1, 2].map(key => <div className="loading-row" key={key}>
    <span className="loading-icon">{schedule ? <CalendarDays size={24} /> : <FileText size={26} />}</span><div><Bar /><Bar short /></div>
  </div>)}</div>;
}
function ScheduleDays() {
  return <div className="loading-schedule-grid">{[0, 1, 2].map(day => <div key={day}>
    <span className="loading-shape loading-day-title" />
    {Array.from({ length: day === 0 ? 2 : 1 }, (_, slot) => <div className="loading-schedule-card" key={slot}>
      <div className="loading-schedule-time"><Clock size={17} /><span className="loading-shape" /></div>
      <span className="loading-shape loading-schedule-subject" />
      <div className="loading-schedule-bottom"><span className="loading-shape" /><span><PencilLine size={18} /><Trash2 size={18} /></span></div>
    </div>)}
  </div>)}</div>;
}
export default function LoadingSkeleton({ variant = "list", label = "Memuat" }) {
  return <div className={`loading-skeleton loading-${variant}`} role="status" aria-label={label} aria-busy="true">
    <div aria-hidden="true">
      {variant === "account" || variant === "session" ? <><div className="loading-account"><span className="loading-account-icon"><UserRound size={32} /></span><div><Bar /><Bar short /></div></div>{variant === "account" && <div className="loading-fields">{[0, 1, 2, 3].map(key => <div key={key}><Bar short /><span className="loading-shape loading-field" /></div>)}</div>}</>
        : variant === "exam" ? <div className="loading-exam-columns"><div><div className="loading-search"><Search size={20} /><Bar /></div><Rows /></div><div className="loading-fields">{[0, 1, 2, 3, 4].map(key => <div key={key}><Bar short /><span className="loading-shape loading-field" /></div>)}</div></div>
        : variant === "lesson" ? <><Bar short /><div className="loading-lesson-columns"><div>{[0, 1, 2].map(key => <div className="loading-paragraph" key={key}><Bar /><Bar /><Bar short /></div>)}</div><span className="loading-shape loading-image" /></div></>
        : variant === "schedule-page" ? <>
          <div className="loading-schedule-heading"><span className="loading-shape" /><span className="loading-shape" /></div>
          <div className="loading-schedule-filters">{[0, 1, 2].map(key => <div key={key}><Bar short /><span className="loading-shape loading-field" /></div>)}</div>
          <ScheduleDays />
        </>
        : variant === "schedule-days" ? <ScheduleDays />
        : variant === "home" ? <><div className="loading-shape loading-welcome" /><div className="loading-exam-columns"><Rows schedule /><Rows /></div></>
        : <Rows tiles={variant === "tiles"} schedule={variant === "schedule"} />}
    </div>
  </div>;
}
