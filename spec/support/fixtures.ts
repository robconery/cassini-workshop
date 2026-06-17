/**
 * Test fixtures — small, hand-built rows mirroring `data/cassini.db`'s
 * `master_plan` schema. Used to arrange deterministic scenarios.
 */
export interface Row {
  id: number;
  start_time_utc: string; // raw mission DOY, e.g. "2004-135T18:40:00"
  start_iso: string; // derived ISO 8601, e.g. "2004-05-14T18:40:00Z"
  duration: string;
  date: string;
  team: string;
  spass_type: string;
  target: string;
  request_name: string;
  library_definition: string;
  title: string;
  description: string;
}

let seq = 0;
const next = () => ++seq;

/** Build a row, overriding any fields you care about for a scenario. */
export function row(overrides: Partial<Row> = {}): Row {
  const id = overrides.id ?? next();
  return {
    id,
    start_time_utc: "2004-135T18:40:00",
    start_iso: "2004-05-14T18:40:00Z",
    duration: "000T09:22:00",
    date: "14-May-04",
    team: "CAPS",
    spass_type: "Non-SPASS",
    target: "Saturn",
    request_name: "SURVEY",
    library_definition: "Magnetospheric survey",
    title: "MAPS Survey",
    description: "MAPS magnetospheric survey",
    ...overrides,
  };
}
