const test = require("node:test");
const assert = require("node:assert/strict");

const {
  photoPathBelongsToMeasurement,
  filterPhotoRecordsForMeasurement,
} = require("../photo-path.js");

const measurement = {
  id: "11111111-1111-4111-8111-111111111111",
  number: "KZN-ZM-2026-123456",
};
const otherMeasurementId = "11111111-1111-4111-8111-111111111112";

function photo(overrides = {}) {
  return {
    id: "photo-1",
    measurement_id: measurement.id,
    file_path: `${measurement.number}_${measurement.id}/photo.jpg`,
    ...overrides,
  };
}

test("accepts each documented photo path family", () => {
  const paths = [
    `${measurement.number}_${measurement.id}/online/photo.jpg`,
    `${measurement.number}/legacy/photo.jpg`,
    `measurements/${measurement.id}/temp-photo.jpg`,
    `123_${measurement.id}/numeric-online/photo.jpg`,
    "123/numeric-legacy/photo.jpg",
  ];

  for (const path of paths) {
    assert.equal(photoPathBelongsToMeasurement(path, measurement.id), true, path);
  }
});

test("rejects a wrong measurement id and exact-prefix collisions", () => {
  const rejected = [
    `${measurement.number}_${otherMeasurementId}/photo.jpg`,
    `measurements/${otherMeasurementId}/photo.jpg`,
    `${measurement.number}_${measurement.id}-copy/photo.jpg`,
    `measurements/${measurement.id}-copy/photo.jpg`,
    `archive/${measurement.id}/photo.jpg`,
  ];

  for (const path of rejected) {
    assert.equal(photoPathBelongsToMeasurement(path, measurement.id), false, path);
  }
});

test("rejects malformed and unrelated Storage paths", () => {
  const rejected = [
    "",
    " ",
    "/measurements/id/photo.jpg",
    `measurements/${measurement.id}`,
    `measurements/${measurement.id}/`,
    `measurements/${measurement.id}/../photo.jpg`,
    `measurements//${measurement.id}/photo.jpg`,
    `measurement-photos/measurements/${measurement.id}/photo.jpg`,
    `unrelated_${measurement.id}/photo.jpg`,
    "unrelated/photo.jpg",
    `${measurement.number}_${measurement.id}\\photo.jpg`,
  ];

  for (const path of rejected) {
    assert.equal(photoPathBelongsToMeasurement(path, measurement.id), false, path);
  }
});

test("requires database measurement_id ownership for every accepted family", () => {
  const fixtures = [
    photo({ id: "strict-wrong-owner", measurement_id: otherMeasurementId }),
    photo({ id: "legacy-wrong-owner", measurement_id: otherMeasurementId, file_path: `${measurement.number}/photo.jpg` }),
    photo({ id: "temp-wrong-owner", measurement_id: otherMeasurementId, file_path: `measurements/${measurement.id}/photo.jpg` }),
  ];

  assert.deepEqual(filterPhotoRecordsForMeasurement(fixtures, measurement), []);
});

test("rejects a valid number-only path belonging to another measurement number", () => {
  const fixture = photo({
    file_path: "KZN-ZM-2026-654321/legacy-photo.jpg",
  });

  assert.deepEqual(filterPhotoRecordsForMeasurement([fixture], measurement), []);
});

test("TEMP draft photo remains visible after synchronization and reopen", () => {
  const synchronizedRow = photo({
    id: "server-photo-id",
    file_path: `measurements/${measurement.id}/local-photo-id.jpg`,
    sync_status: "synced",
    server_measurement_id: measurement.id,
  });

  const reopenedGallery = filterPhotoRecordsForMeasurement([synchronizedRow], measurement);
  assert.equal(reopenedGallery.length, 1);
  assert.equal(reopenedGallery[0], synchronizedRow);
});

test("deduplicates repeated rows and repeated Storage objects safely", () => {
  const synchronizedRow = photo({
    id: "server-photo-id",
    file_path: `measurements/${measurement.id}/local-photo-id.jpg`,
  });
  const duplicateObject = { ...synchronizedRow };
  const duplicatePathWithAnotherRow = { ...synchronizedRow, id: "duplicate-db-row" };
  const foreignDuplicate = {
    ...synchronizedRow,
    id: "foreign-row",
    measurement_id: otherMeasurementId,
  };

  const reopenedGallery = filterPhotoRecordsForMeasurement(
    [synchronizedRow, duplicateObject, duplicatePathWithAnotherRow, foreignDuplicate],
    measurement,
  );

  assert.deepEqual(reopenedGallery, [synchronizedRow]);
});

test("rejected paths never appear in another measurement", () => {
  const otherMeasurement = {
    id: otherMeasurementId,
    number: "KZN-ZM-2026-654321",
  };
  const rows = [
    photo(),
    photo({
      id: "other-photo",
      measurement_id: otherMeasurement.id,
      file_path: `measurements/${otherMeasurement.id}/other.jpg`,
    }),
  ];

  assert.deepEqual(filterPhotoRecordsForMeasurement(rows, measurement).map((row) => row.id), ["photo-1"]);
  assert.deepEqual(filterPhotoRecordsForMeasurement(rows, otherMeasurement).map((row) => row.id), ["other-photo"]);
});
