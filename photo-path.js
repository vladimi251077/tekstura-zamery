(function initTeksturaPhotoPaths(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TeksturaPhotoPaths = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createTeksturaPhotoPaths() {
  const MEASUREMENT_NUMBER_PATTERN = /^(?:KZN-ZM-\d{4}-\d{6}|\d+)$/;

  function validPathSegments(path) {
    if (typeof path !== "string" || !path || path !== path.trim()) return null;
    if (path.startsWith("/") || path.endsWith("/") || path.includes("\\") || path.includes("//")) return null;
    if (path.includes("?") || path.includes("#") || path.includes("\0")) return null;
    const segments = path.split("/");
    if (segments.length < 2 || segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
    return segments;
  }

  function validMeasurementId(measurementId) {
    const id = String(measurementId || "");
    if (!id || id !== id.trim() || id.includes("/") || id.includes("\\") || id === "." || id === "..") return "";
    return id;
  }

  function photoPathBelongsToMeasurement(path, measurementId) {
    const segments = validPathSegments(path);
    const id = validMeasurementId(measurementId);
    if (!segments || !id) return false;

    if (segments[0] === "measurements") {
      return segments.length >= 3 && segments[1] === id;
    }

    const folder = segments[0];
    const strictSuffix = `_${id}`;
    if (folder.endsWith(strictSuffix)) {
      const number = folder.slice(0, -strictSuffix.length);
      return MEASUREMENT_NUMBER_PATTERN.test(number);
    }

    // A number-only folder carries no id. Its ownership is accepted only by
    // filterPhotoRecordsForMeasurement after measurement_id metadata agrees.
    return MEASUREMENT_NUMBER_PATTERN.test(folder);
  }

  function recordBelongsToMeasurement(photo, measurement) {
    if (!photo || !measurement) return false;
    const measurementId = validMeasurementId(measurement.id);
    if (!measurementId || String(photo.measurement_id || "") !== measurementId) return false;

    const path = photo.file_path;
    if (!photoPathBelongsToMeasurement(path, measurementId)) return false;

    const folder = path.split("/")[0];
    if (folder === "measurements") return true;

    const expectedNumber = String(measurement.number || "");
    if (!MEASUREMENT_NUMBER_PATTERN.test(expectedNumber)) return false;
    return folder === expectedNumber || folder === `${expectedNumber}_${measurementId}`;
  }

  function filterPhotoRecordsForMeasurement(photos, measurement) {
    const accepted = [];
    const seenIds = new Set();
    const seenPaths = new Set();

    for (const photo of Array.isArray(photos) ? photos : []) {
      if (!recordBelongsToMeasurement(photo, measurement)) continue;
      const rowId = photo.id === null || photo.id === undefined ? "" : String(photo.id);
      const path = photo.file_path;
      if ((rowId && seenIds.has(rowId)) || seenPaths.has(path)) continue;
      if (rowId) seenIds.add(rowId);
      seenPaths.add(path);
      accepted.push(photo);
    }

    return accepted;
  }

  return {
    photoPathBelongsToMeasurement,
    filterPhotoRecordsForMeasurement,
  };
});
