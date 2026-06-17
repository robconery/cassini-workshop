/**
 * Feature: converting mission DOY timestamps to and from ISO 8601
 *
 * Mission DOY format: "YYYY-DDDTHH:MM:SS"
 * ISO 8601 output:   "YYYY-MM-DDTHH:MM:SSZ"
 */
import { describe, it, expect, beforeAll } from "@jest/globals";

import { doyToIso, isoToDoy } from "../src/util/dates";

describe("Feature: converting mission DOY timestamps to ISO 8601", () => {
  // -----------------------------------------------------------------------
  // HAPPY PATH
  // -----------------------------------------------------------------------

  describe("Scenario: converting a leap-year day-of-year (2004-135)", () => {
    let result: string;

    beforeAll(() => {
      result = doyToIso("2004-135T18:40:00");
    });

    it("maps to the correct calendar date", () => {
      expect(result).toBe("2004-05-14T18:40:00Z");
    });
  });

  describe("Scenario: converting the first day of a non-leap year (2005-001)", () => {
    let result: string;

    beforeAll(() => {
      result = doyToIso("2005-001T00:00:00");
    });

    it("maps to January 1st of that year", () => {
      expect(result).toBe("2005-01-01T00:00:00Z");
    });
  });

  describe("Scenario: round-tripping a DOY timestamp through ISO and back", () => {
    const original = "2004-135T18:40:00";
    let roundTripped: string;

    beforeAll(() => {
      roundTripped = isoToDoy(doyToIso(original));
    });

    it("returns the original DOY string unchanged", () => {
      expect(roundTripped).toBe(original);
    });
  });

  // -----------------------------------------------------------------------
  // SAD PATH
  // -----------------------------------------------------------------------

  describe("Scenario: rejecting a malformed DOY string", () => {
    let act: () => string;

    beforeAll(() => {
      act = () => doyToIso("not-a-real-timestamp");
    });

    it("throws an Error", () => {
      expect(act).toThrow(Error);
    });
  });

  describe("Scenario: rejecting day 000", () => {
    let act: () => string;

    beforeAll(() => {
      act = () => doyToIso("2004-000T12:00:00");
    });

    it("throws an Error", () => {
      expect(act).toThrow(Error);
    });
  });

  describe("Scenario: rejecting day 367", () => {
    let act: () => string;

    beforeAll(() => {
      act = () => doyToIso("2004-367T12:00:00");
    });

    it("throws an Error", () => {
      expect(act).toThrow(Error);
    });
  });

  describe("Scenario: rejecting day 366 in a non-leap year (2005)", () => {
    let act: () => string;

    beforeAll(() => {
      act = () => doyToIso("2005-366T12:00:00");
    });

    it("throws an Error (2005 has only 365 days)", () => {
      expect(act).toThrow(Error);
    });
  });

  describe("Scenario: accepting day 366 in a leap year (2004)", () => {
    let result: string;

    beforeAll(() => {
      result = doyToIso("2004-366T12:00:00");
    });

    it("maps to December 31st of the leap year", () => {
      expect(result).toBe("2004-12-31T12:00:00Z");
    });
  });

  describe("Scenario: rejecting out-of-range time components (99:99:99)", () => {
    let act: () => string;

    beforeAll(() => {
      act = () => doyToIso("2005-001T99:99:99");
    });

    it("throws an Error", () => {
      expect(act).toThrow(Error);
    });
  });
});
