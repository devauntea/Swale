import type { RainfallForecast } from "../../types";
import { formatTime, fixtureTime, displayNumber } from "../../app/format";
import { Icon } from "../controls/Icon";

export function ForecastCard({ forecast }: { forecast: RainfallForecast }) {
  const unavailable =
    forecast.status === "unavailable" || forecast.amount === null;
  return (
    <section className="forecast-section" aria-labelledby="forecast-title">
      <div className="section-heading">
        <h2 id="forecast-title">RAINFALL OUTLOOK</h2>
        <Icon name="drop" size={15} />
      </div>
      <div className="forecast-card">
        <div className="forecast-kicker">
          <span className="demo-dot" />
          DEMO / FORECAST EXAMPLE
        </div>
        <div className="forecast-main">
          <div>
            <strong>
              {unavailable ? "—" : displayNumber(forecast.amount, 2)}
            </strong>
            <span>{unavailable ? "Unavailable" : "mm accumulated"}</span>
          </div>
          <RainGlyph />
        </div>
        {forecast.status === "stale" && (
          <p className="state-notice warning">
            STALE example · source times retained
          </p>
        )}
        {unavailable ? (
          <p className="forecast-window">
            No quantitative example available. NWS integration is pending.
          </p>
        ) : (
          <p className="forecast-window">
            {formatTime(forecast.validFrom)}
            <br />
            <span>to {formatTime(forecast.validTo)}</span>
          </p>
        )}
        <details className="forecast-details">
          <summary>
            Example provenance <Icon name="chevron" size={13} />
          </summary>
          <div>
            <p>
              {forecast.provenance.type} · {forecast.provenance.source}
            </p>
            <p>
              Example issued: {formatTime(forecast.issuedAt, "Unavailable")}
            </p>
            <p>Retrieved: {formatTime(forecast.provenance.retrievedAt)}</p>
            <p>Fixture authored: {fixtureTime(forecast.provenance)}</p>
            <p>
              Accumulation over a stated period, not an hourly intensity. No
              live forecast is connected.
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}
function RainGlyph() {
  return (
    <svg
      className="rain-glyph"
      width="76"
      height="50"
      viewBox="0 0 76 50"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M21 29c-15 0-14-20 0-20 4-13 25-10 27 2 17-3 22 18 5 18H21Z"
        fill="#284a4d"
        stroke="#77b8af"
        strokeWidth="1.3"
      />
      <g stroke="#9bd7c2" strokeWidth="2" strokeLinecap="round">
        <path d="m23 36-3 6m16-6-3 6m16-6-3 6" />
      </g>
    </svg>
  );
}
