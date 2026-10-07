import test from "node:test";
import assert from "node:assert/strict";
import * as api from "../src/scoring.mjs";
import { runScoringTests } from "./scoring-cases.mjs";
test("16 adversarial scoring groups",()=>{const r=runScoringTests(api);assert.equal(r.passed,16);assert.equal(r.failed,0);});
