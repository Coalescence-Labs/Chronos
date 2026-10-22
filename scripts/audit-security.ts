export {};

const exception = {
  package: "braces",
  advisory: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
  expires: "2026-11-17T00:00:00Z",
};

type Advisory = { url: string; title: string; severity: string };
async function audit(production: boolean): Promise<Record<string, Advisory[]>> {
  const process = Bun.spawn(["bun", "audit", "--json", ...(production ? ["--production"] : [])], {
    stdout: "pipe", stderr: "pipe",
  });
  const [output, error, code] = await Promise.all([
    new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited,
  ]);
  if (code === 0) return {};
  try {
    const findings = JSON.parse(output) as Record<string, Advisory[]>;
    if (!findings || !Object.values(findings).every(Array.isArray)) throw new Error();
    return findings;
  } catch {
    throw new Error(`Dependency audit did not complete: ${error.trim() || "invalid registry response"}`);
  }
}

const production = await audit(true);
const all = await audit(false);
const failures: string[] = [];
for (const [name, findings] of Object.entries(production)) {
  for (const finding of findings) failures.push(`Production: ${name}: ${finding.title} (${finding.url})`);
}
for (const [name, findings] of Object.entries(all)) {
  for (const finding of findings) {
    if (name === exception.package && finding.url === exception.advisory && Date.now() < Date.parse(exception.expires)) continue;
    failures.push(`${name}: ${finding.title} (${finding.url})`);
  }
}
if (failures.length) throw new Error(failures.join("\n"));
console.log("Dependency security checks passed; production dependencies have no reported advisories.");
