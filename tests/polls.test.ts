import { describe, expect, it } from "vitest";
import { formatWinnerSummary } from "../src/polls.js";

const answers = [
  { id: 1, text: "Monday, May 11" },
  { id: 2, text: "Tuesday, May 12" },
  { id: 3, text: "Wednesday, May 13" }
];

describe("formatWinnerSummary", () => {
  it("formats a single winner", () => {
    expect(
      formatWinnerSummary({
        answers,
        counts: [
          { id: 1, count: 2 },
          { id: 2, count: 4 },
          { id: 3, count: 1 }
        ]
      })
    ).toBe("Poker poll is closed. Top choice: Tuesday, May 12 with 4 votes.");
  });

  it("formats tied winners", () => {
    expect(
      formatWinnerSummary({
        answers,
        counts: [
          { id: 1, count: 3 },
          { id: 2, count: 1 },
          { id: 3, count: 3 }
        ]
      })
    ).toBe("Poker poll is closed. Top choices are Monday, May 11 and Wednesday, May 13 with 3 votes each.");
  });

  it("formats no-vote polls", () => {
    expect(
      formatWinnerSummary({
        answers,
        counts: []
      })
    ).toBe("Poker poll is closed: no votes were cast this week.");
  });
});
