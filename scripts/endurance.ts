/**
 * Headless 200-event session: stay fast and recover from a budget miss.
 *
 * Usage: npm run endurance
 */
import {
  ENDURANCE_P95_MS,
  runEnduranceSession,
} from "../src/runtime/session-endurance";

const result = await runEnduranceSession(200);

console.log(
  [
    `events ${result.events}`,
    `p50 ${result.p50.toFixed(1)}ms`,
    `p95 ${result.p95.toFixed(1)}ms (limit ${ENDURANCE_P95_MS}ms)`,
    `last ${result.lastMs.toFixed(1)}ms`,
    `recovered ${result.recovered}`,
  ].join(" · "),
);

if (!result.ok) {
  for (const failure of result.failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log("OK: 200+ events stayed fast and recoverable");
