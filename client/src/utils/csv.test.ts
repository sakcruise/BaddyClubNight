import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("joins headers and rows with CRLF", () => {
    expect(toCsv(["a", "b"], [[1, 2], ["x", "y"]])).toBe("a,b\r\n1,2\r\nx,y");
  });
  it("quotes commas, quotes and newlines", () => {
    expect(toCsv(["n"], [["Smith, J"], ['say "hi"'], ["two\nlines"]])).toBe('n\r\n"Smith, J"\r\n"say ""hi"""\r\n"two\nlines"');
  });
  it("renders null and undefined as empty", () => {
    expect(toCsv(["a", "b"], [[null, undefined]])).toBe("a,b\r\n,");
  });
});
