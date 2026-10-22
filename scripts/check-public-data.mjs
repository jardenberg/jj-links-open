import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const patterns = [
  new RegExp(["go", "ai", "links"].join("|").replace(/\|/g, String.raw`\.jardenberg\.(?:se|net)|`) + String.raw`\.jardenberg\.(?:se|net)`, "i"),
  /appg(?:prj|dep|ver)_[a-z0-9]+/i,
  /(?:ghp|gho|ghs|github_pat|sk)[_-][a-z0-9_-]{20,}/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /CLOUDFLARE_(?:ACCOUNT|ZONE|LIST|RULESET)_ID\s*=\s*[a-f0-9]{32}/i,
];
const failures = [];
for (const file of execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean)) {
  const text = readFileSync(file, "utf8");
  if (patterns.some((pattern) => pattern.test(text))) failures.push(file);
}
if (failures.length) {
  console.error("Public data check failed in:", failures.join(", "));
  process.exitCode = 1;
} else console.log("Public source data check passed.");
