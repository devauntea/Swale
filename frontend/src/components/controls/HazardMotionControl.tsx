import "./hazardMotion.css";

export function HazardMotionControl({
  paused,
  onChange,
}: {
  paused: boolean;
  onChange: (paused: boolean) => void;
}) {
  return (
    <button
      className="hazard-motion-control"
      aria-pressed={paused}
      onClick={() => onChange(!paused)}
      title="Pause or resume subtle halos on recent unresolved reports. Reduced motion always uses static indicators."
    >
      {paused ? "Resume hazard animation" : "Pause hazard animation"}
    </button>
  );
}

export function HazardLegend() {
  return (
    <div className="hazard-legend">
      <span>
        <img src="/markers/catch-basin.svg" alt="" width="24" height="24" /> Red
        grate: catch basin inventory
      </span>
      <span>
        <img src="/markers/complaint-311.svg" alt="" width="24" height="24" />{" "}
        Yellow 311: complaint record
      </span>
      <span>
        <i className="hazard-key active" aria-hidden="true" /> Red halo: recent
        unresolved report, not verified present condition
      </span>
      <span>
        Historical, closed, dated findings and unknown states stay static.
        Nearby links are inferred. Numbers group records; zoom in to inspect.
      </span>
    </div>
  );
}
