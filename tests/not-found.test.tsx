import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import NotFound from "@/app/not-found";

describe("not-found page (COA-85)", () => {
  test("renders calm empty state with a home link", () => {
    const html = renderToStaticMarkup(<NotFound />);
    expect(html).toContain("Page not found");
    expect(html).toContain("That address doesn");
    expect(html).toContain("match anything here.");
    expect(html).toContain('href="/"');
    expect(html).toContain("Back home");
  });
});
