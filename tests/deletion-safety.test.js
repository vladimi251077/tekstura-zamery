const test = require("node:test");
const assert = require("node:assert/strict");
const Safety = require("../deletion-safety.js");

const remote = { id: "measurement-1", number: "ZM-1", sync_status: "synced" };
const local = { local_id: "local-1", number: "TEMP-001", sync_status: "local_only" };
const syncedPhoto = {
  id: "photo-1",
  measurement_id: "measurement-1",
  file_path: "ZM-1_measurement-1/photo.jpg",
};

test("clean synchronized measurement can use the normal confirmed deletion flow", () => {
  const result = Safety.classifyMeasurement({ measurement: remote });
  assert.equal(result.classification, Safety.CLASSIFICATION.SAFE_TO_DELETE);
  assert.equal(Safety.canProceedWithDeletion(result, { confirmed: false }), false);
  assert.equal(Safety.canProceedWithDeletion(result, { confirmed: true }), true);
});

for (const [name, measurement] of [
  ["TEMP measurement", local],
  ["pending measurement", { ...local, sync_status: "pending" }],
  ["syncing measurement", { ...local, sync_status: "syncing" }],
  ["retryable error measurement", { ...local, sync_status: "sync_error", last_sync_error: "timeout" }],
]) {
  test(`${name} is protected`, () => {
    assert.equal(
      Safety.classifyMeasurement({ measurement }).classification,
      Safety.CLASSIFICATION.BLOCKED_UNTIL_SYNC_OR_EXPORT,
    );
  });
}

test("unsynced photo prevents immediate measurement deletion", () => {
  const result = Safety.classifyMeasurement({
    measurement: remote,
    photos: [{ local_photo_id: "local-photo", local_draft_id: "local-1", blob: { size: 12 }, sync_status: "pending" }],
  });
  assert.equal(result.classification, Safety.CLASSIFICATION.BLOCKED_UNTIL_SYNC_OR_EXPORT);
  assert.equal(result.unsyncedPhotos, 1);
  assert.equal(Safety.canProceedWithDeletion(result, { confirmed: true }), false);
  assert.equal(Safety.canProceedWithDeletion(result, {
    backupExported: true,
    phrase: Safety.CONFIRMATION_PHRASE,
  }), true);
});

test("synced photo does not create a false block", () => {
  const result = Safety.classifyMeasurement({ measurement: remote, photos: [syncedPhoto] });
  assert.equal(result.classification, Safety.CLASSIFICATION.REQUIRES_CONFIRMATION);
  assert.equal(result.unsyncedPhotos, 0);
});

test("confirmed synced measurement is not blocked by retained retry history", () => {
  const result = Safety.classifyMeasurement({
    measurement: { ...remote, last_sync_error: "old retry history" },
  });
  assert.equal(result.classification, Safety.CLASSIFICATION.SAFE_TO_DELETE);
});

test("local Blob remains protected even when remote photo identifiers are present", () => {
  const result = Safety.classifyMeasurement({
    measurement: remote,
    photos: [{ ...syncedPhoto, sync_status: "synced", blob: { size: 42 } }],
  });
  assert.equal(result.classification, Safety.CLASSIFICATION.BLOCKED_UNTIL_SYNC_OR_EXPORT);
  assert.equal(result.unsyncedPhotos, 1);
});

test("cross-measurement photo deletion is rejected", () => {
  const result = Safety.validatePhotoDeletionOwnership({
    photo: syncedPhoto,
    measurementId: "measurement-2",
    pathReferences: [syncedPhoto],
    pathBelongsToMeasurement: () => true,
  });
  assert.equal(result.allowed, false);
});

test("ambiguous Storage ownership is rejected", () => {
  const result = Safety.validatePhotoDeletionOwnership({
    photo: syncedPhoto,
    measurementId: "measurement-1",
    pathReferences: [syncedPhoto, { ...syncedPhoto, id: "photo-2" }],
    pathBelongsToMeasurement: () => true,
  });
  assert.equal(result.allowed, false);
});

test("record-level path ownership rejection blocks Storage deletion", () => {
  const result = Safety.validatePhotoDeletionOwnership({
    photo: syncedPhoto,
    measurementId: "measurement-1",
    measurementNumber: "KZN-ZM-2026-000001",
    pathReferences: [syncedPhoto],
    recordBelongsToMeasurement: () => false,
    pathBelongsToMeasurement: () => true,
  });
  assert.equal(result.allowed, false);
});

test("unsaved form changes trigger navigation protection", () => {
  assert.equal(Safety.shouldWarnOnNavigation([{ measurement: remote, unsavedChanges: true }]), true);
});

test("clean state does not trigger navigation protection", () => {
  assert.equal(Safety.shouldWarnOnNavigation([{ measurement: remote }]), false);
});

test("backup contains measurement data but no credentials, tokens, or signed URLs", () => {
  const backup = Safety.buildBackup({
    exportedAt: "2026-07-27T12:00:00.000Z",
    measurement: {
      ...remote,
      client: { name: "Тест", access_token: "secret" },
      signed_url: "https://example.test/private?token=secret",
      password: "secret",
      credentials: { api_key: "secret" },
      preview_url: "https://example.test/private?signature=secret",
    },
    photos: [{ ...syncedPhoto, url: "https://signed.example.test", blob: { size: 42 }, file_name: "photo.jpg" }],
  });
  const json = JSON.stringify(backup);
  assert.match(json, /Тест/);
  assert.doesNotMatch(json, /secret|access_token|signed_url|signed\.example/i);
  assert.equal(backup.photos[0].binary_included, false);
});

test("SVG drawing inputs survive backup and restore without renderer rewriting", () => {
  const drawingInputs = {
    drawing_project_json: { schemaVersion: 2, type: "ready_u_winder_left", params: { B1: 900 } },
    finish_dimensions_json: { riser: 180, tread: 260 },
    drawing_svg: '<svg data-source="accepted"><path d="M0 0"/></svg>',
  };
  const backup = Safety.buildBackup({ measurement: remote, drawingInputs, exportedAt: "2026-07-27T12:00:00.000Z" });
  assert.deepEqual(Safety.restoreBackupInputs(backup).drawingInputs, drawingInputs);
});
