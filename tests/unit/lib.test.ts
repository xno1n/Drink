import { describe, it, expect } from "vitest";
import { escapeLike } from "@/lib/like";
import { dirOf, t } from "@/lib/i18n";

describe("escapeLike", () => {
  it("escapes LIKE wildcards and backslashes", () => {
    expect(escapeLike("a_b%c\\d")).toBe("a\\_b\\%c\\\\d");
  });
  it("leaves normal text untouched", () => expect(escapeLike("hello")).toBe("hello"));
});
describe("i18n", () => {
  it("uses RTL for Persian and LTR for English", () => {
    expect(dirOf("fa")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
  });
  it("has the same keys in both languages", () => expect(Object.keys(t("fa")).sort()).toEqual(Object.keys(t("en")).sort()));
});
