import { addDays, addMonths, format, parseISO, startOfISOWeek } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { BudgetPeriod, PeriodBounds } from "./types.js";

export function isValidDateKey(dateKey: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (daysInMonth[month - 1] ?? 0);
}

export function isValidTime(time: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59;
}

function localDateKey(date: Date, timeZone: string): string {
  return formatInTimeZone(date, timeZone, "yyyy-MM-dd");
}

function atStartOfDay(date: Date, timeZone: string): Date {
  return fromZonedTime(`${format(date, "yyyy-MM-dd")}T00:00:00`, timeZone);
}

export function getPeriodBounds(
  date: Date,
  period: "day" | BudgetPeriod,
  timeZone: string
): PeriodBounds {
  const dateKey = localDateKey(date, timeZone);
  const zonedCalendarDate = parseISO(dateKey);

  if (period === "day") {
    const nextDay = addDays(zonedCalendarDate, 1);
    return {
      key: dateKey,
      start: atStartOfDay(zonedCalendarDate, timeZone),
      endExclusive: atStartOfDay(nextDay, timeZone)
    };
  }

  if (period === "weekly") {
    const weekStart = startOfISOWeek(zonedCalendarDate);
    const weekEnd = addDays(weekStart, 7);
    const key = format(weekStart, "yyyy-MM-dd");
    return {
      key,
      start: atStartOfDay(weekStart, timeZone),
      endExclusive: atStartOfDay(weekEnd, timeZone)
    };
  }

  const monthStart = new Date(
    zonedCalendarDate.getFullYear(),
    zonedCalendarDate.getMonth(),
    1
  );
  const nextMonth = addMonths(monthStart, 1);
  const key = format(monthStart, "yyyy-MM");
  return {
    key,
    start: atStartOfDay(monthStart, timeZone),
    endExclusive: atStartOfDay(nextMonth, timeZone)
  };
}
