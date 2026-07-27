# Winder radial geometry correction — 2026-07-27

## Scope and reproduced defect

The owner-confirmed defect was reproduced with `ready_u_winder_right`, `ZN = 3`.
The runtime path is:

`buildGeometry()` → `buildWinderPolygons()` → `rayRectIntersection()` → `renderWinder()`.

Before this correction, each tread polygon was serialized as:

`[pivot, boundaryHit[i], boundaryHit[i + 1]]`.

For L winders, `buildGeometry()` supplied a lower corner of the turn rectangle as `pivot`.
For U winders, it supplied the midpoint of the lower turn edge. The helper then intersected
successive angle rays with the rectangle and emitted one triangle per adjacent hit pair. The
outer intersections moved along the rectangle boundary, but the pivot was not the center of
the actual turning area. In the observed U-right fixture it was:

`(turn.x + turn.w / 2, turn.y + turn.h)`.

This edge-origin triangle sequence is the incorrect construction the owner observed.

## Corrected deterministic construction

`turningCenter(rect)` now computes exactly:

`{ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }`.

`buildGeometry()` computes that point once for the active rectangular turn and passes the same
object to every region created for that zone. `buildWinderPolygons()`:

1. starts the fan at the lower-center ray;
2. sweeps one full turn in equal angular divisions controlled by `ZN`;
3. reverses sweep direction for the mirrored right variant;
4. intersects every ray with the actual rectangle boundary;
5. includes intervening rectangle corners in each region polygon so the regions cover the
   complete turn rectangle without gaps;
6. stores and uses the same center as the first point of every radial region.

The L-left/L-right and U-left/U-right pairs are exact normalized mirrors. The flight rectangles,
outer stair bounds, dimensions, routes, viewBoxes, measurement calculations, editor persistence,
and production consumers were not changed.

## Regression and browser acceptance

The Node regression suite now asserts for all four protected winder variants and `ZN = 2, 3, 4`:

- requested tread-region count;
- one common origin;
- origin equals the actual turn-rectangle center;
- both radial endpoints lie on valid rectangle boundaries;
- no zero-area or self-intersecting polygons;
- region areas sum to the turn-rectangle area;
- number-label points remain inside their region;
- exact left/right mirroring;
- finite SVG output.

The four winder hashes were intentionally updated. All eight non-winder hashes remain unchanged.

`tests/winder-browser-acceptance.js` runs Chromium for every winder variant at:

- 390 × 844;
- 844 × 390;
- 768 × 1024;
- 1440 × 1000.

It checks the rendered SVG common origin, calculated center, tread count, label containment,
responsive viewBox, finite output, and editor/production polygon parity. It also writes one
print PDF per variant. Poppler inspection reports no raster images in those PDFs, and rendered
PDF pages retain the corrected vector geometry.

Local evidence is generated under `artifacts/winder-radial-geometry/`. The evidence directory is
not part of the focused runtime commit.

## Acceptance state

Real-phone owner acceptance is **PENDING**. It must not be marked PASS until the owner opens a new
or existing measurement for each of the four variants on a phone and visually confirms the
radial center, labels, mirroring, and save/reopen result.
