const test = require("node:test");
const assert = require("node:assert/strict");
const Sync = require("../sync-state.js");

const NOW = Date.parse("2026-07-26T12:00:00.000Z");
const STALE = "2026-07-26T11:54:59.999Z";
const ACTIVE = "2026-07-26T11:59:00.000Z";

test("stale syncing after app restart becomes retryable and preserves context", () => {
  const original = {
    local_id: "local-temp-1",
    sync_status: "syncing",
    sync_attempt_started_at: STALE,
    sync_attempt_count: 3,
    last_sync_error: "previous timeout",
  };
  const result = Sync.recoverStale(original, { nowMs: NOW, now: "2026-07-26T12:00:00.000Z" });
  assert.equal(result.reason, "stale_retryable");
  assert.equal(result.record.sync_status, "sync_error");
  assert.equal(result.record.sync_attempt_count, 3);
  assert.equal(result.record.last_sync_error, "previous timeout");
  assert.equal(Sync.isRetryable(result.record, NOW), true);
});

test("beginning a retry records its start while preserving retry history", () => {
  const started = Sync.beginAttempt({
    local_id: "local-temp-history",
    sync_status: "sync_error",
    sync_attempt_count: 2,
    last_sync_error: "timeout after insert",
  }, { now: "2026-07-26T12:00:00.000Z" });
  assert.equal(started.sync_operation_id, "local-temp-history");
  assert.equal(started.sync_status, "syncing");
  assert.equal(started.sync_attempt_started_at, "2026-07-26T12:00:00.000Z");
  assert.equal(started.sync_attempt_count, 3);
  assert.equal(started.last_sync_error, "timeout after insert");
  assert.equal(Sync.isRetryable({ sync_status: "retry" }, NOW), true);
  assert.equal(Sync.isRetryable({ sync_status: "error" }, NOW), true);
});

test("remote completion found after a lost response is reused instead of created", async () => {
  const remote = [];
  let creates = 0;
  await assert.rejects(Sync.reconcileBeforeCreate({
    findExisting: async () => remote,
    create: async () => {
      const accepted = { id: "measurement-real-1", number: "KZN-ZM-2026-000001" };
      remote.push(accepted);
      creates += 1;
      throw new Error("response lost after server acceptance");
    },
  }), /response lost/);
  const result = await Sync.reconcileBeforeCreate({
    findExisting: async () => remote,
    create: async () => {
      creates += 1;
      return { id: "duplicate" };
    },
  });
  assert.equal(result.reused, true);
  assert.equal(result.value.id, "measurement-real-1");
  assert.equal(creates, 1);
});

test("true failure with no remote completion is safely retried", async () => {
  let creates = 0;
  const options = {
    findExisting: async () => [],
    create: async () => {
      creates += 1;
      if (creates === 1) throw new Error("request failed before acceptance");
      return { id: "created-after-safe-retry" };
    },
  };
  await assert.rejects(Sync.reconcileBeforeCreate(options), /before acceptance/);
  const result = await Sync.reconcileBeforeCreate(options);
  assert.equal(result.reused, false);
  assert.equal(result.value.id, "created-after-safe-retry");
  assert.equal(creates, 2);
});

test("repeated retry reuses the first successful remote record", async () => {
  const remote = [];
  let creates = 0;
  const operation = () => Sync.reconcileBeforeCreate({
    findExisting: async () => remote,
    create: async () => {
      const value = { id: `measurement-${++creates}`, number: "KZN-ZM-2026-000002" };
      remote.push(value);
      return value;
    },
  });
  await operation();
  const retried = await operation();
  assert.equal(retried.reused, true);
  assert.equal(creates, 1);
});

test("concurrent retry attempts for one measurement share one execution", async () => {
  const coordinator = Sync.createMeasurementCoordinator({ webLocks: null });
  let executions = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const task = () => coordinator.run("local-temp-3", async () => {
    executions += 1;
    await gate;
    return "synced";
  });
  const first = task();
  const second = task();
  release();
  assert.equal(await first, "synced");
  assert.equal(await second, "synced");
  assert.equal(executions, 1);
});

const duplicateFixtures = [
  {
    entity: "client",
    existing: { id: "client-existing", created_by: "owner-1", name: "Synthetic", phone: "+70000000000", address: "Test 1", city: "Казань" },
    matches: (candidate) => candidate.created_by === "owner-1"
      && candidate.name === "Synthetic"
      && candidate.phone === "+70000000000"
      && candidate.address === "Test 1"
      && candidate.city === "Казань",
  },
  {
    entity: "measurement",
    existing: { id: "measurement-existing", number: "KZN-ZM-2026-000004", created_by: "owner-1" },
    matches: (candidate) => candidate.number === "KZN-ZM-2026-000004" && candidate.created_by === "owner-1",
  },
  {
    entity: "photo row",
    existing: { id: "photo-row-existing", measurement_id: "measurement-existing", file_path: "measurements/measurement-existing/photo-local-4.jpg" },
    matches: (candidate) => candidate.measurement_id === "measurement-existing"
      && candidate.file_path === "measurements/measurement-existing/photo-local-4.jpg",
  },
  {
    entity: "Storage path",
    existing: { id: "storage-object-existing", path: "measurements/measurement-existing/photo-local-4.jpg" },
    matches: (candidate) => candidate.path === "measurements/measurement-existing/photo-local-4.jpg",
  },
];

for (const fixture of duplicateFixtures) {
  test(`duplicate ${fixture.entity} prevention reconciles the exact existing identifier`, async () => {
    let creates = 0;
    const result = await Sync.reconcileBeforeCreate({
      findExisting: async () => [fixture.existing],
      matches: fixture.matches,
      create: async () => {
        creates += 1;
        return { id: "duplicate" };
      },
    });
    assert.equal(result.value, fixture.existing);
    assert.equal(result.reused, true);
    assert.equal(creates, 0);
  });
}

test("TEMP-to-real mapping is completion evidence and is reused", () => {
  const result = Sync.recoverStale({
    local_id: "local-temp-5",
    server_id: "measurement-real-5",
    server_number: "KZN-ZM-2026-000005",
    sync_status: "syncing",
    sync_attempt_started_at: STALE,
  }, { nowMs: NOW });
  assert.equal(result.reason, "local_completion_evidence");
  assert.equal(result.record.sync_status, "synced");
  assert.equal(result.record.server_id, "measurement-real-5");
});

test("photo server evidence must agree with the real measurement mapping", () => {
  const photo = {
    local_photo_id: "photo-local-5",
    server_photo_id: "photo-real-5",
    server_file_path: "measurements/measurement-real-5/photo-local-5.jpg",
    server_measurement_id: "measurement-real-5",
  };
  assert.equal(Sync.photoServerMeasurementMatches(photo, "measurement-real-5"), true);
  assert.equal(Sync.photoServerMeasurementMatches(photo, "measurement-real-6"), false);
});

test("Storage reconciliation accepts only an exact object name and tolerates duplicate listings", () => {
  const objects = [
    { name: "photo-local-5.jpg" },
    { name: "photo-local-5.jpg" },
    { name: "photo-local-5.jpg.backup" },
  ];
  assert.equal(Sync.storageListContainsExactName(objects, "photo-local-5.jpg"), true);
  assert.equal(Sync.storageListContainsExactName(objects, "photo-local-5.jp"), false);
});

test("non-stale active synchronization remains untouched", () => {
  const original = {
    local_id: "local-temp-6",
    sync_status: "syncing",
    sync_attempt_started_at: ACTIVE,
    sync_attempt_count: 1,
  };
  const result = Sync.recoverStale(original, { nowMs: NOW });
  assert.equal(result.changed, false);
  assert.equal(result.record, original);
  assert.equal(Sync.millisecondsUntilStale(original, NOW), 4 * 60 * 1000);
});

test("different measurements synchronize independently", async () => {
  const coordinator = Sync.createMeasurementCoordinator({ webLocks: null });
  const started = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = coordinator.run("measurement-a", async () => {
    started.push("a");
    await gate;
    return "a";
  });
  const second = coordinator.run("measurement-b", async () => {
    started.push("b");
    return "b";
  });
  await Promise.resolve();
  assert.deepEqual(started.sort(), ["a", "b"]);
  assert.equal(await second, "b");
  release();
  assert.equal(await first, "a");
});

test("ambiguous reconciliation stops rather than creating a duplicate", async () => {
  let creates = 0;
  await assert.rejects(
    Sync.reconcileBeforeCreate({
      findExisting: async () => [{ id: "one" }, { id: "two" }],
      create: async () => {
        creates += 1;
        return { id: "three" };
      },
    }),
    /неоднозначна/
  );
  assert.equal(creates, 0);
});
