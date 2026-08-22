import type { LucideIcon } from "lucide-react";
import {
  Cpu,
  Fan,
  Gauge,
  Lightbulb,
  Lock,
  Monitor,
  Power,
  Radio,
  Thermometer,
  ToggleLeft,
  Tv,
  Blinds,
} from "lucide-react";

export type DeviceVisual = {
  Icon: LucideIcon;
  label: string;
  /** Tailwind classes for the icon well */
  wellClass: string;
  iconClass: string;
};

function domainFromEntityId(entityId?: string | null): string | null {
  if (!entityId || !entityId.includes(".")) return null;
  return entityId.split(".")[0]!.toLowerCase();
}

function fromHaDomain(domain: string): DeviceVisual | null {
  switch (domain) {
    case "light":
      return {
        Icon: Lightbulb,
        label: "Light",
        wellClass: "bg-amber-500/15 ring-amber-500/25",
        iconClass: "text-amber-400",
      };
    case "media_player":
      return {
        Icon: Tv,
        label: "Media",
        wellClass: "bg-sky-500/15 ring-sky-500/25",
        iconClass: "text-sky-400",
      };
    case "switch":
    case "input_boolean":
      return {
        Icon: ToggleLeft,
        label: "Switch",
        wellClass: "bg-emerald-500/15 ring-emerald-500/25",
        iconClass: "text-emerald-400",
      };
    case "cover":
      return {
        Icon: Blinds,
        label: "Cover",
        wellClass: "bg-teal-500/15 ring-teal-500/25",
        iconClass: "text-teal-400",
      };
    case "fan":
      return {
        Icon: Fan,
        label: "Fan",
        wellClass: "bg-cyan-500/15 ring-cyan-500/25",
        iconClass: "text-cyan-400",
      };
    case "climate":
      return {
        Icon: Thermometer,
        label: "Climate",
        wellClass: "bg-rose-500/15 ring-rose-500/25",
        iconClass: "text-rose-400",
      };
    case "lock":
      return {
        Icon: Lock,
        label: "Lock",
        wellClass: "bg-violet-500/15 ring-violet-500/25",
        iconClass: "text-violet-400",
      };
    case "remote":
      return {
        Icon: Radio,
        label: "Remote",
        wellClass: "bg-indigo-500/15 ring-indigo-500/25",
        iconClass: "text-indigo-400",
      };
    case "sensor":
    case "binary_sensor":
      return {
        Icon: Gauge,
        label: "Sensor",
        wellClass: "bg-orange-500/15 ring-orange-500/25",
        iconClass: "text-orange-400",
      };
    default:
      return null;
  }
}

function fromDeviceType(deviceType?: string | null): DeviceVisual {
  const t = (deviceType || "OTHER").toUpperCase();
  switch (t) {
    case "LED":
    case "LED_CONTROLLER":
      return {
        Icon: Lightbulb,
        label: t === "LED_CONTROLLER" ? "LED controller" : "LED",
        wellClass: "bg-amber-500/15 ring-amber-500/25",
        iconClass: "text-amber-400",
      };
    case "TV":
      return {
        Icon: Tv,
        label: "TV",
        wellClass: "bg-sky-500/15 ring-sky-500/25",
        iconClass: "text-sky-400",
      };
    case "DISPLAY":
    case "NOVASTAR":
      return {
        Icon: Monitor,
        label: t === "NOVASTAR" ? "Novastar" : "Display",
        wellClass: "bg-blue-500/15 ring-blue-500/25",
        iconClass: "text-blue-400",
      };
    case "RELAY":
    case "POWER_CONTROLLER":
      return {
        Icon: Power,
        label: t === "POWER_CONTROLLER" ? "Power" : "Relay",
        wellClass: "bg-emerald-500/15 ring-emerald-500/25",
        iconClass: "text-emerald-400",
      };
    case "SENSOR":
      return {
        Icon: Gauge,
        label: "Sensor",
        wellClass: "bg-orange-500/15 ring-orange-500/25",
        iconClass: "text-orange-400",
      };
    default:
      return {
        Icon: Cpu,
        label: t.replace(/_/g, " "),
        wellClass: "bg-muted ring-border",
        iconClass: "text-muted-foreground",
      };
  }
}

/** Prefer HA entity domain when present; fall back to CtrlX deviceType. */
export function getDeviceVisual(opts: {
  deviceType?: string | null;
  homeAssistantEntityId?: string | null;
}): DeviceVisual {
  const domain = domainFromEntityId(opts.homeAssistantEntityId);
  if (domain) {
    const fromDomain = fromHaDomain(domain);
    if (fromDomain) return fromDomain;
  }
  return fromDeviceType(opts.deviceType);
}
