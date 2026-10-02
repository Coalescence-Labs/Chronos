import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import NotFound from "@/app/not-found";

describe("not-found page (COA-85)", () => {
  test("renders calm empty state; Chronos brand in the shell links home", () => {
    const html = renderToStaticMarkup(<NotFound />);
    expect(html).toContain("Page not found");
    expect(html).toContain("That address doesn");
    expect(html).toContain("match anything here.");
    // Shell brand — no shouting Back-home pill.
    expect(html).toContain(">Chronos</a>");
    expect(html).not.toContain("Back home");
  });
});
