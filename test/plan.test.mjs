// node --test test/plan.test.mjs — checks the sync diff in extension.js without Spotify.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = { setTimeout: () => {} }; // no Spicetify: the extension's startup loop just schedules a retry
vm.runInNewContext(readFileSync(new URL("../library-plus/extension.js", import.meta.url), "utf8"), ctx);
const plan = (...a) => JSON.parse(JSON.stringify(ctx.libraryPlusPlan(...a))); // copy out of the vm realm for deepEqual
const rows = (...uris) => uris.map((uri, i) => ({ uri, uid: `u${i}` }));

test("empty playlist gets everything in order", () => {
	assert.deepEqual(plan(["a", "b", "c"], []), { remove: [], add: ["a", "b", "c"] });
});

test("removes unliked tracks and duplicates, adds only new ones", () => {
	const r = plan(["new", "a", "b"], rows("a", "gone", "b", "a"));
	assert.deepEqual(r.add, ["new"]);
	assert.deepEqual(r.remove.map((x) => x.uid), ["u1", "u3"]);
});

test("in sync means no changes", () => {
	const r = plan(["a", "b"], rows("a", "b"));
	assert.equal(r.add.length + r.remove.length, 0);
});

const byHand = (...a) => JSON.parse(JSON.stringify(ctx.libraryPlusRemovedByHand(...a)));
const want = Array.from({ length: 100 }, (_, i) => `t${i}`);
const prevAll = Object.fromEntries(want.map((u) => [u, u]));

test("a track deleted by hand stays out; new tracks are not mistaken for deletions", () => {
	const have = rows(...want.filter((u) => u !== "t5" && u !== "t99"));
	const prev = { ...prevAll };
	delete prev.t99; // t99 is new since the last sync
	assert.deepEqual(byHand(want, have, prev, {}), ["t5"]);
	assert.deepEqual(byHand(want, have, prev, { t5: "" }), [], "already excluded");
	assert.deepEqual(byHand(want, have, null, {}), [], "no snapshot yet");
});

test("an empty or half-loaded playlist never hides the library", () => {
	assert.deepEqual(byHand(want, [], prevAll, {}), []);
	assert.deepEqual(byHand(want, rows(...want.slice(0, 50)), prevAll, {}), []);
});
