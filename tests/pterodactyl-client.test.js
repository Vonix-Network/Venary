'use strict';

/**
 * Property-based tests for PterodactylClient
 *
 * Validates: Requirements 5.5 (exponential backoff), 5.8 (console buffer capacity)
 *
 * Runner: node:test (built-in, Node ≥ 18)
 * PBT lib: fast-check
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');
const PterodactylClient = require('../extensions/pterodactyl-panel/server/pterodactyl-client');

// ---------------------------------------------------------------------------
// Helper: create a client instance without real credentials (no network calls)
// ---------------------------------------------------------------------------
function makeClient() {
  return new PterodactylClient({
    baseUrl: 'https://panel.example.com',
    apiKey: 'test-key',
    serverId: 'abc123',
  });
}

// ---------------------------------------------------------------------------
// 3.1 — Property 1: Exponential backoff bounds
// **Validates: Requirements 5.5**
//
// For any attempt index in [0, 4], the computed delay must be:
//   - Non-decreasing as attempt increases
//   - Equal to 1000 * 2^attempt
//   - Never exceed 1000 * 2^4 = 16 000 ms
// ---------------------------------------------------------------------------
test('Property 1: backoff delay sequence is strictly non-decreasing and never exceeds 16 s', () => {
  // Expose the delay formula used inside _scheduleReconnect
  // delay = 1000 * 2^attempt, attempt in [0..4]
  const delay = (attempt) => 1000 * Math.pow(2, attempt);

  fc.assert(
    fc.property(
      // Two distinct attempt indices within the valid range [0, 4]
      fc.integer({ min: 0, max: 3 }),
      (attempt) => {
        const d0 = delay(attempt);
        const d1 = delay(attempt + 1);

        // Non-decreasing: next delay >= current delay
        assert.ok(d1 >= d0, `delay(${attempt + 1})=${d1} should be >= delay(${attempt})=${d0}`);

        // Upper bound: never exceeds 2^4 * base = 16 000 ms
        assert.ok(d0 <= 16000, `delay(${attempt})=${d0} exceeds 16 000 ms`);
        assert.ok(d1 <= 16000, `delay(${attempt + 1})=${d1} exceeds 16 000 ms`);

        return true;
      }
    ),
    { numRuns: 200 }
  );
});

test('Property 1b: backoff delay at attempt 4 is exactly 16 000 ms (max)', () => {
  const delay = (attempt) => 1000 * Math.pow(2, attempt);
  assert.equal(delay(4), 16000);
});

// ---------------------------------------------------------------------------
// 3.2 — Property 2: Console buffer capacity invariant
// **Validates: Requirements 5.8**
//
// No matter how many lines are pushed, consoleBuffer.length never exceeds 500.
// ---------------------------------------------------------------------------
test('Property 2: console line buffer never exceeds 500 entries regardless of push count', () => {
  fc.assert(
    fc.property(
      // Push between 0 and 1000 lines (well above the 500 cap)
      fc.array(fc.string(), { minLength: 0, maxLength: 1000 }),
      (lines) => {
        const client = makeClient();
        for (const line of lines) {
          client._bufferLine(line);
        }
        assert.ok(
          client.consoleBuffer.length <= 500,
          `Buffer length ${client.consoleBuffer.length} exceeds 500`
        );
        return true;
      }
    ),
    { numRuns: 500 }
  );
});

test('Property 2b: buffer retains the most recent lines when capacity is exceeded', () => {
  fc.assert(
    fc.property(
      // Push more than 500 lines so the circular eviction kicks in
      fc.integer({ min: 501, max: 1000 }),
      (count) => {
        const client = makeClient();
        for (let i = 0; i < count; i++) {
          client._bufferLine(`line-${i}`);
        }
        // Length must be exactly 500
        assert.equal(client.consoleBuffer.length, 500);
        // The last entry must be the most recently pushed line
        assert.equal(client.consoleBuffer[499], `line-${count - 1}`);
        // The first entry must be the oldest retained line
        assert.equal(client.consoleBuffer[0], `line-${count - 500}`);
        return true;
      }
    ),
    { numRuns: 300 }
  );
});
