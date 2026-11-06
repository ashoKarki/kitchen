export interface ReminderSettings {
  reminderEnabled: boolean;
  reminderHour: number;
  timeZone: string;
}

export function readReminderSettings(value: unknown): ReminderSettings {
  if (typeof value !== "object" || value === null) {
    throw new Error("Kitchen settings document is missing or invalid.");
  }
  const data = value as Record<string, unknown>;
  const reminderHour = data.reminderHour;
  if (
    typeof data.reminderEnabled !== "boolean"
    || typeof reminderHour !== "number"
    || !Number.isInteger(reminderHour)
    || reminderHour < 0
    || reminderHour > 23
    || typeof data.timeZone !== "string"
    || data.timeZone.length === 0
  ) {
    throw new Error("Kitchen reminder settings are invalid.");
  }
  new Intl.DateTimeFormat("en-US", { timeZone: data.timeZone }).format(new Date(0));
  return {
    reminderEnabled: data.reminderEnabled,
    reminderHour,
    timeZone: data.timeZone
  };
}

export function hourInTimeZone(now: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23"
  }).format(now);
  return Number(hour);
}

export function reminderBody(names: readonly string[]): string {
  const listed = names.slice(0, 5);
  const extraCount = names.length - listed.length;
  return `${listed.join(", ")}${extraCount > 0 ? `, +${extraCount} more` : ""}`;
}
