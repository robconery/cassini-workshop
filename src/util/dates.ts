/**
 * Mission timestamp utilities — DOY ↔ ISO 8601
 *
 * Mission DOY format: "YYYY-DDDTHH:MM:SS"
 *   - YYYY: 4-digit year
 *   - DDD:  day-of-year, 1-based, zero-padded to 3 digits (001–366)
 *   - T:    separator
 *   - HH:MM:SS: time component, UTC
 *
 * ISO 8601 output: "YYYY-MM-DDTHH:MM:SSZ"
 */

const DOY_RE = /^(\d{4})-(\d{3})T(\d{2}):(\d{2}):(\d{2})$/;

/** Return the number of days in a given year (365 or 366). */
function daysInYear(year: number): number {
  // A year is a leap year if divisible by 4, except centuries unless also by 400.
  return (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
}

/** Parse a mission DOY string, throwing a descriptive Error on failure. */
function parseDoy(doy: string): {
  year: number;
  dayOfYear: number;
  hh: number;
  mm: number;
  ss: number;
} {
  const m = DOY_RE.exec(doy);
  if (m === null) {
    throw new Error(
      `Invalid mission DOY format: "${doy}" — expected "YYYY-DDDTHH:MM:SS"`
    );
  }

  const year = parseInt(m[1]!, 10);
  const dayOfYear = parseInt(m[2]!, 10);
  const hh = parseInt(m[3]!, 10);
  const mm = parseInt(m[4]!, 10);
  const ss = parseInt(m[5]!, 10);

  const maxDay = daysInYear(year);
  if (dayOfYear < 1 || dayOfYear > maxDay) {
    throw new Error(
      `Invalid day-of-year ${dayOfYear} in "${doy}" — ${year} has ${maxDay} days`
    );
  }

  // Range-check time components before handing to Date.UTC, which would
  // silently normalise out-of-range values (e.g. 99:99:99 → next day).
  if (hh > 23) {
    throw new Error(`Invalid hours ${hh} in "${doy}" — must be 00–23`);
  }
  if (mm > 59) {
    throw new Error(`Invalid minutes ${mm} in "${doy}" — must be 00–59`);
  }
  if (ss > 59) {
    throw new Error(`Invalid seconds ${ss} in "${doy}" — must be 00–59`);
  }

  return { year, dayOfYear, hh, mm, ss };
}

/**
 * Convert a mission day-of-year timestamp to ISO 8601 UTC.
 *
 * @throws {Error} on unparseable input (malformed string, day 000, day > 366)
 *
 * @example
 * doyToIso("2004-135T18:40:00") // "2004-05-14T18:40:00Z"
 */
export function doyToIso(doy: string): string {
  const { year, dayOfYear, hh, mm, ss } = parseDoy(doy);

  // Date.UTC(year, 0, dayOfYear, hh, mm, ss) is the single source of truth.
  // It rolls day-of-year into the correct month/day (leap years included) and
  // embeds the validated time. We already validated all ranges above, so no
  // silent normalisation can occur.
  const d = new Date(Date.UTC(year, 0, dayOfYear, hh, mm, ss));

  const YYYY = String(d.getUTCFullYear()).padStart(4, "0");
  const MM = String(d.getUTCMonth() + 1).padStart(2, "0");
  const DD = String(d.getUTCDate()).padStart(2, "0");
  const HH = String(d.getUTCHours()).padStart(2, "0");
  const Min = String(d.getUTCMinutes()).padStart(2, "0");
  const Sec = String(d.getUTCSeconds()).padStart(2, "0");

  return `${YYYY}-${MM}-${DD}T${HH}:${Min}:${Sec}Z`;
}

/**
 * Convert an ISO 8601 UTC timestamp back to mission DOY format.
 *
 * @throws {Error} on unparseable or non-UTC input
 *
 * @example
 * isoToDoy("2004-05-14T18:40:00Z") // "2004-135T18:40:00"
 */
export function isoToDoy(iso: string): string {
  // Only Z-suffix is accepted; +00:00 or bare offsets are intentionally
  // excluded — we only ever emit and consume Zulu UTC in mission timestamps.
  if (!iso.endsWith("Z")) {
    throw new Error(
      `Invalid ISO timestamp: "${iso}" — must end with "Z" (UTC)`
    );
  }

  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid ISO timestamp: "${iso}"`);
  }

  const year = d.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  // Day-of-year is 1-based: Jan 1 = 001.
  // floor(diff/day) gives zero-based offset; +1 makes it 1-based.
  // We floor (not round) to avoid bumping the day on times > noon.
  const dayOfYear = Math.floor((d.getTime() - jan1) / 86_400_000) + 1;

  const YYYY = String(year).padStart(4, "0");
  const DDD = String(dayOfYear).padStart(3, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");

  return `${YYYY}-${DDD}T${hh}:${mm}:${ss}`;
}
