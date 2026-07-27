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
object to every region created for that zone. For counts other than three,
`buildWinderPolygons()`:

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

## Owner phone follow-up: dedicated ZN=3 topology

The first common-center implementation divided a full turn into equal angles. At `ZN=3`, its
120-degree stops hit bottom-center and the two upper boundary areas. This made the middle region
an oversized triangle across the upper turn and left two diagonal separator arms, which read as
an irregular V/X construction on a phone. The same generic construction remains accepted at
`ZN=4` and `ZN=5`.

`buildThreeWinderPolygons()` now handles only `ZN=3`. It uses the actual rectangle center and
three ordered boundary anchors:

- bottom-center;
- left-edge midpoint;
- right-edge midpoint.

For a left-oriented stair, the walking sequence is the lower-left entry region, the upper
central transition region, and the lower-right exit region. Right orientation is its exact
mirror. The areas are deterministically 25%, 50%, and 25% of the turn rectangle. The separators
form a T rather than an X, all three regions are continuous and simple, and labels use the
geometric center of each region. ZN=3 labels are rendered above route and tread lines with a
small white backing so their centered positions remain legible.

Before returning the ZN=3 geometry, `validateThreeWinderTopology()` verifies:

- exactly three positive-area, consistently wound simple polygons;
- zero pairwise overlap;
- summed area equals the complete turn rectangle;
- no proper separator crossing.

The accepted normalized geometry hashes for `ZN=4` and `ZN=5` are fixed in the regression suite
and remain unchanged.

## Regression and browser acceptance

The Node regression suite now asserts for all four protected winder variants and `ZN = 2, 3, 4, 5`:

- requested tread-region count;
- one common origin;
- origin equals the actual turn-rectangle center;
- both radial endpoints lie on valid rectangle boundaries;
- no zero-area or self-intersecting polygons;
- region areas sum to the turn-rectangle area;
- number-label points remain inside their region;
- exact left/right mirroring;
- finite SVG output.

For `ZN=3`, it additionally asserts ordered bottom and side anchors, T rather than X topology,
zero pairwise overlap, sequential 1–2 and 2–3 shared boundaries, no improper 1–3 intersection,
25%/50%/25% area allocation, centered labels, and inclusion of the central transition area in
tread 2.

The four winder hashes were intentionally updated. All eight non-winder hashes remain unchanged.

`tests/winder-browser-acceptance.js` runs Chromium for every winder variant at:

- 390 × 844;
- 844 × 390;
- 768 × 1024;
- 1440 × 1000.

It checks the rendered SVG common origin, calculated center, tread count, label containment,
responsive viewBox, finite output, and editor/production polygon parity. It also writes one
print PDF per variant. Poppler inspection reports no raster images in those PDFs, and rendered
PDF pages retain the corrected vector geometry. ZN=4 and ZN=5 additionally run at the two
phone-acceptance sizes, 390×844 and 844×390.

Local first-pass evidence is under `artifacts/winder-radial-geometry/`. Owner-follow-up comparison
evidence is under `artifacts/zn3-correction/`: `before/` contains the failed equal-angle ZN=3
phone output, while `after/` contains corrected ZN=3 plus unchanged ZN=4 and ZN=5 output at
390×844 and 844×390. All eight ZN=4 phone screenshots and all eight ZN=5 phone screenshots are
byte-for-byte equal between the baseline and corrected runs; all eight ZN=3 phone screenshots
change as intended. Evidence directories are not part of the focused runtime commit.

## Acceptance state

Real-phone owner acceptance is **PENDING**. It must not be marked PASS until the owner opens a new
or existing measurement for each of the four variants on a phone and visually confirms the
radial center, labels, mirroring, and save/reopen result.
