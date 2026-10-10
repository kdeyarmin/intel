import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// A group's tab strip spans the top of the page, above the header row. Inside
// a flex header row it becomes a sibling of the title and buttons and squeezes them.
describe("PageTabs placement", () => {
  const dir = path.resolve(import.meta.dirname, "..", "src", "pages");
  const pages = fs.readdirSync(dir).filter((f) => f.endsWith(".jsx"));

  it.each(pages.filter((f) => fs.readFileSync(path.join(dir, f), "utf8").includes("<PageTabs")))("%s renders its tabs directly in the page wrapper", (file) => {
    const lines = fs.readFileSync(path.join(dir, file), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!line.includes("<PageTabs")) return;
      const parent = lines.slice(0, i).reverse().find((l) => l.trim());
      expect(parent, `${file}:${i + 1}`).toMatch(/<div className="[^"]*\b(p|px)-4\b/);
    });
  });
});
