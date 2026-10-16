import {
  serviceColor,
  serviceTextColor,
  uniqueServices,
} from "../../map/servicePalette";
import "./serviceBadges.css";

/** Labelled service identities; neither a schedule nor a service-status claim. */
export function ServiceBadges({ routes }: { routes: readonly string[] }) {
  const services = uniqueServices(routes);
  return (
    <span
      className="transit-routes"
      aria-label={`Routes ${services.join(", ") || "unavailable"}`}
    >
      {services.map((route) => {
        const fill = serviceColor(route);
        return (
          <span
            key={route}
            className="service-badge"
            style={
              fill
                ? { backgroundColor: fill, color: serviceTextColor(route) }
                : undefined
            }
            title={`${route} · ${fill ? "MTA service color" : "Unrecognized service; color unavailable"} · not service status`}
          >
            {route}
          </span>
        );
      })}
    </span>
  );
}
