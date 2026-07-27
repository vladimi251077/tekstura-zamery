# SVG drawing regression suite

Status: deterministic characterization coverage is active for all 12 production stair variants.

The suite protects existing behavior. It does not redesign the drawings and does not change `drawing-bridge.js`, formulas, geometry, labels, scaling, redraw, persistence, production rendering, or print behavior.

## Protected variants and fixtures

All fixtures use the same deliberately asymmetric representative dimensions so that left/right errors and accidental field swaps are visible:

- height `2860`;
- slab thickness `220`;
- opening `3320 × 1180`;
- flight 1 `2750 × 980`, `11` steps;
- flight 2 `2250 × 920`, `9` steps;
- turn zone `1120 × 1040`;
- winder count `3`;
- riser `178`;
- common tread `250`, per-flight treads `250` and `245`.

| Variant | Expected title | Characterized dimensions | Orientation | Normalized geometry hash |
| --- | --- | --- | --- | --- |
| `empty_straight` | Пустой прямой проём | L, W, H, T | straight | `4f438a257426ebcd` |
| `empty_l_left` | Пустой Г-проём левый | M2, B2, M1, B1 | left | `831c72980b2e8422` |
| `empty_l_right` | Пустой Г-проём правый | M2, B2, M1, B1 | right | `0cbc99fed36d80d8` |
| `ready_straight` | Прямая лестница | B1, N1 | straight | `a0f945919ef91efe` |
| `ready_l_left_landing` | Г-образная левая | B1, B2 | left | `aa465714be69f694` |
| `ready_l_right_landing` | Г-образная правая | B1, B2 | right | `7e98a260ecd7de45` |
| `ready_l_left_winder` | Г-образная левая | B1, B2, ZN | left | `c138ae5572e05cd1` |
| `ready_l_right_winder` | Г-образная правая | B1, B2, ZN | right | `a203ffb8b8b0d86b` |
| `ready_u_landing_left` | П-образная лестница | B1, B2, ZL, ZW | left | `91feb6fafdf622c0` |
| `ready_u_landing_right` | П-образная лестница | B1, B2, ZL, ZW | right | `91f1b17557369258` |
| `ready_u_winder_left` | П-образная лестница | B1, B2, ZN | left | `04a0aeebf6054900` |
| `ready_u_winder_right` | П-образная лестница | B1, B2, ZN | right | `4a284b0c6c16cde4` |

The empty L variants intentionally render label-only M/B dimension text. The tests preserve that exact production behavior instead of inventing numeric text that the current renderer does not show.

## Pipeline inventory

### Runtime entry points

`drawing-bridge.js` is an IIFE loaded after the measurement application. It exposes only:

- `window.TeksturaDrawingBridge.render()`;
- `window.TeksturaDrawingBridge.refresh()`;
- `window.TeksturaDrawingBridge.setMeasurementMode()`;
- read-only accessors for current project and finish state.

It also subscribes to:

- document clicks on the Sizes tab, measurement rows, and New Measurement;
- `tekstura:measurement-loaded`;
- `tekstura:measurement-mode-changed`;
- `DOMContentLoaded`;
- window `load`.

### State and variant selection

The editable source is `drawing_project_json`, schema version 2. `refreshState()` merges it with `DEFAULT_PROJECT`, hydrates ordinary measurement fields from `project.params`, restores `finish_dimensions_json`, normalizes tread settings, and infers a variant only when no valid persisted type exists.

Form inference uses:

- `site_situation` to distinguish empty from ready/concrete/frame;
- `opening_type` for straight, L, U, and left/right;
- `turn_type` for landing or winder;
- `stair_direction` as the U-shape left/right fallback.

The tests exercise the actual `inferVariantKeyFromForm()` rules for every fixture and separately confirm that the explicit schema-v2 `type` remains selected after save/reopen.

### Measurement inputs

The primary dimension fields consumed by `collectParams()` are:

- `height_clean_to_clean_mm`;
- `slab_thickness_mm`;
- `opening_length_mm`, `opening_width_mm`;
- `flight1_length_mm`, `flight1_width_mm`, `flight1_steps_count`;
- `flight2_length_mm`, `flight2_width_mm`, `flight2_steps_count`;
- `corner_zone_length_mm`, `corner_zone_width_mm`;
- `winder_steps_count`;
- `riser_height_mm`;
- `tread_depth_mm`;
- `tread_depth_flight1_mm`, `tread_depth_flight2_mm`.

Additional project state controls walls, windows, ascent arrows, top balustrade, edge extensions, obstacles, active field/zone, detailed/simple mode, and automatic flight-length calculation. Finish state is stored separately in `finish_dimensions_json`.

### Geometry and SVG generators

The protected generator chain is:

1. `collectParams()` normalizes measurement values.
2. `visibleParams()` selects the dimensions visible for variant and mode.
3. `buildGeometry()` creates rectangles, tread lines, turn/winder polygons, route points, dimensions, step labels, flight directions, and outer bounds.
4. `turningCenter()`, `buildWinderPolygons()`, and `rayRectIntersection()` generate the
   rectangular winder envelope and individual radial tread regions from one shared turn center.
5. `fitMargins()` reserves room for dimension labels and site markers.
6. `fitTransform()` scales and centers geometry proportionally.
7. `renderSvg()` writes the final SVG.
8. Specialized renderers write rectangles, lines, winders, routes, dimensions, walls, windows, ascent arrows, balustrades, edge extensions, obstacles, and step-count labels.

The complete geometry/render helper inventory is:

- primitive and geometry: `makeRect`, `buildGeometry`, `clamp`, `turningCenter`,
  `rayRectIntersection`, `positiveAngle`, `angularProgress`, `polygonSignedArea`,
  `segmentCross`, `properSegmentIntersection`, `simplePolygon`, `lineIntersection`,
  `convexIntersection`, `validateThreeWinderTopology`, `buildThreeWinderPolygons`,
  `buildWinderPolygons`;
- viewport and fitting: `drawingViewport`, `fitTransform`, `fitMargins`;
- core SVG: `renderSvg`, `renderRect`, `renderStepLabels`, `renderLine`, `renderWinder`,
  `renderWinderTopLabels`, `renderRoute`, `renderDimension`;
- sides and walls: `sideSegment`, `flightSideSegment`, `renderWalls`;
- windows: `sideLengthForWindow`, `windowSegment`, `renderWindows`;
- directional/site layers: `zoneRect`, `renderAscent`, `isOuterSideWalled`,
  `renderTopBalustrade`, `sideUnit`, `normalForSide`, `renderOneObstacleOnSegment`,
  `renderEdgeExtensions`, `renderObstacles`.

The selection/input helpers on the same path are `readField`, `writeField`, `numberField`,
`intField`, `containsAny`, `inferVariantKeyFromForm`, `currentVariantKeyFromForm`, `variant`,
`measurementMode`, `isDetailedMode`, `shouldRenderSiteMarks`, `shouldRenderAscent`,
`refreshState`, `hydrateFieldsFromProjectParams`, `normalizeTreadMode`, `treadValues`,
`collectParams`, `applyAutoCalc`, `isReadyULandingVariant`, `withReadyULandingFields`,
`expandMatrixFields`, and `visibleParams`.

The final SVG always contains:

- an SVG namespace, role and accessible label;
- one `viewBox`;
- `db-arrow`, `db-ascent-arrow`, and `db-tick` marker definitions;
- a white background and grid;
- generated geometry;
- semantic CSS classes and `data-param`/`data-zone` ownership.

Dimension extension lines, dimension hit lines, labels, route arrows, ascent arrows, and tick markers are release-contract elements.

### ViewBox and responsive sizing

`drawingViewport()` selects:

- desktop: `0 0 1100 760`;
- tablet (`max-width: 1000px`): `0 0 960 780`;
- phone (`max-width: 430px`): `0 0 820 1100`.

The editor CSS keeps the SVG at `width: 100%`, uses viewport-height sizing on tablet/phone, and does not replace the proportional viewBox. Tests render all 12 fixtures in all three viewports, require the same semantic dimensions and orientation, and prove generated coordinates stay inside the selected bounds.

### Redraw

Field editing updates the hidden measurement field immediately. Change, blur, and Enter commit through `commitField()`, persist state, and schedule a redraw. Variant, automatic calculation, tread mode, wall, site mark, window, finish, and measurement-mode changes also schedule redraw.

Deterministic redraw tests change:

- opening length on `empty_straight`;
- flight-1 width on `ready_u_winder_right`.

The corresponding dimension text and geometry must change while unrelated width values remain stable.

### Save and reopen

`saveState()` writes:

- schema-v2 `drawing_project_json`;
- `finish_dimensions_json`;
- exact serialized `drawing_svg`.

The main form persists those three representations with the measurement. Reopen loads the measurement fields, restores project state, selects the persisted variant, and redraws from the editable source.

Every fixture is serialized, cleared from the VM state, reopened from its saved measurement fields and JSON, and compared by:

- variant key;
- dimension label/value map;
- left/right orientation;
- normalized geometry hash;
- exact saved SVG field before reopen.

### Editor, production, and print consumers

The editor preview consumes `m.drawing_svg` through `enhanceMainPreviewSvg()` and keeps it inside `.preview-scheme`.

The production view consumes the same `m.drawing_svg` through `enhanceProductionSvg()` and inserts the result directly inside `.production-svg`. Its hardening pass adds safe paint styles and production step-count labels; it does not select another drawing variant or rasterize the SVG.

Both preview and production provide `window.print()` actions. Their print styles hide controls while leaving the SVG containers present. Tests guard these source and CSS contracts and reject Canvas/data-URL rasterization in the production consumer.

## Assertion strategy

Most checks are semantic:

- exact variant inventory and form-selection outcome;
- valid SVG envelope and expected viewBox;
- finite geometry and serialized coordinates;
- no `NaN`, `Infinity`, `undefined`, or `null` text;
- coordinate and polygon bounds;
- expected dimension IDs, labels, and fixture values;
- dimension, extension, hit, route, tread, opening, and winder structures;
- a common winder-ray origin equal to the center of the actual turn rectangle;
- ZN 2/3/4/5 region counts, boundary hits, non-zero area, no self-intersection, full rectangular
  coverage, contained number labels, and exact left/right mirroring;
- dedicated ZN=3 ordered T-fan anchors, pairwise zero-overlap, 1–2/2–3 adjacency, no crossed
  separators, centered labels, and a middle region containing the geometric transition area;
- fixed accepted-geometry hashes for ZN=4 and ZN=5;
- marker definitions and marker CSS contracts;
- left/right flight placement;
- unique critical marker IDs;
- redraw behavior;
- save/reopen parity;
- editor/production/print source contracts.

Full SVG string snapshots are intentionally not used. Each fixture instead has a 16-character SHA-256 prefix over a normalized stable geometry structure: title, outer bounds, rectangles, tread lines, dimensions, winder polygons, route, and step labels. Rendering whitespace, grid serialization, and unrelated UI markup do not affect these hashes.

## Test harness and runtime integrity

No runtime test seam was added.

The Node test reads the unmodified `drawing-bridge.js`, inserts a private export object into the IIFE string only in memory, and evaluates that instrumented string in an isolated VM with deterministic form fields and media-query results. The repository and browser never load the instrumented string.

The protected runtime file must remain byte-for-byte equal to `main` in this PR. If the IIFE terminator or protected internal function names change, the harness fails explicitly and requires deliberate review.

## Known visual limitations

The deterministic suite does not replace:

- real-phone touch, zoom, keyboard, and safe-area acceptance;
- pixel-level comparison of line weight and label overlap;
- browser print preview and generated PDF visual inspection;
- printer-specific margins and pagination;
- visual approval by the estimator/production owner.

Responsive layout, production consumption, and print retention are characterized semantically. Real-device and print/PDF visual acceptance remain separate release evidence.

## Mandatory migration parity gate

Migration into `tekstura-platform/apps/estimator-app` must not be accepted until all of the following are true:

1. The 12 fixture inputs are copied without changing units or interpretation.
2. The migrated renderer returns the same variant for every fixture.
3. Normalized geometry hashes match all 12 baselines, or every intentional difference has explicit owner approval.
4. Desktop, tablet, and phone viewBoxes match.
5. Dimension IDs, labels, values, extension lines, tick markers, routes, ascent arrows, tread geometry, winder polygons, and left/right orientation match.
6. Field-change redraw and save/reopen parity tests pass against the migrated persistence adapter.
7. Editor and production consumers retain editable schema-v2 state plus serialized SVG.
8. Print/export remains SVG and passes browser print/PDF visual acceptance.
9. Real-phone visual acceptance passes for representative straight, L-landing, L-winder, U-landing, and U-winder fixtures in both orientations.
10. `drawing-bridge.js` remains the release reference until the owner explicitly signs off the parity report.

Any mismatch is a migration blocker; it must not be normalized away by simplifying formulas or replacing the output with a static image.
