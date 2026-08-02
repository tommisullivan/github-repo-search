import { describe, expect, it } from "vitest";
import {
  buildSearchUrl,
  DEFAULT_SORT,
  parseSort,
  SORT_OPTIONS,
  type SearchSort,
} from "./searchUrl";

function parse(url: string): URL {
  return new URL(url, "http://example.test");
}

describe("parseSort", () => {
  it("accepts every value the sort control can produce", () => {
    // The control renders SORT_OPTIONS, so anything it can emit must survive
    // the round trip — this is what stops the two ends drifting apart.
    for (const option of SORT_OPTIONS) {
      expect(parseSort(option.value)).toBe(option.value);
    }
  });

  it.each([
    ["", "empty"],
    ["forks", "a real GitHub sort this app does not offer"],
    ["updated", "another real one"],
    ["STARS", "right value, wrong case"],
    ["stars ", "trailing space"],
    ["<script>alert(1)</script>", "hostile"],
    ["best-match ", "the default, mistyped"],
  ])("falls back to the default for %s (%s)", (raw) => {
    expect(parseSort(raw)).toBe(DEFAULT_SORT);
  });

  it("never returns a value that is not in SORT_OPTIONS", () => {
    // The guarantee the search unit relies on: only a value from this list
    // can ever reach GitHub as `sort=`.
    const allowed = SORT_OPTIONS.map((option) => option.value);
    for (const raw of ["stars", "junk", "", "best-match", "../../etc"]) {
      expect(allowed).toContain(parseSort(raw));
    }
  });
});

describe("buildSearchUrl", () => {
  it("builds the canonical shape for an ordinary search", () => {
    expect(buildSearchUrl({ q: "react", page: 1, sort: "best-match" })).toBe(
      "/?q=react&page=1"
    );
  });

  it("omits the default sort but includes a non-default one", () => {
    expect(
      parse(buildSearchUrl({ q: "react", page: 2, sort: "best-match" }))
        .searchParams.has("sort")
    ).toBe(false);

    expect(
      parse(
        buildSearchUrl({ q: "react", page: 2, sort: "stars" })
      ).searchParams.get("sort")
    ).toBe("stars");
  });

  it("collapses a blank or whitespace-only keyword to the canonical '/'", () => {
    for (const q of ["", "   ", "\t\n"]) {
      // Not `/?q=&page=1` — that renders the same screen under a second URL.
      expect(buildSearchUrl({ q, page: 3, sort: "stars" })).toBe("/");
    }
  });

  it("trims the keyword rather than encoding the surrounding whitespace", () => {
    expect(
      parse(
        buildSearchUrl({ q: "  react  ", page: 1, sort: "best-match" })
      ).searchParams.get("q")
    ).toBe("react");
  });

  it("escapes a keyword so it cannot introduce or overwrite a parameter", () => {
    const parsed = parse(
      buildSearchUrl({ q: "next&page=99&sort=stars", page: 1, sort: "best-match" })
    );

    // The whole thing is the *value* of q, not three parameters.
    expect(parsed.searchParams.get("q")).toBe("next&page=99&sort=stars");
    expect(parsed.searchParams.get("page")).toBe("1");
    expect(parsed.searchParams.has("sort")).toBe(false);
    expect(Array.from(parsed.searchParams.keys()).sort()).toEqual([
      "page",
      "q",
    ]);
  });

  it("round-trips through parseSort for every option", () => {
    for (const option of SORT_OPTIONS) {
      const built = buildSearchUrl({ q: "react", page: 1, sort: option.value });
      const readBack: SearchSort = parseSort(
        parse(built).searchParams.get("sort") ?? ""
      );
      expect(readBack).toBe(option.value);
    }
  });
});
