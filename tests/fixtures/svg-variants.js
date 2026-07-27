"use strict";

const BASE_FIELDS = Object.freeze({
  height_clean_to_clean_mm: "2860",
  slab_thickness_mm: "220",
  opening_length_mm: "3320",
  opening_width_mm: "1180",
  flight1_length_mm: "2750",
  flight1_width_mm: "980",
  flight1_steps_count: "11",
  flight2_length_mm: "2250",
  flight2_width_mm: "920",
  flight2_steps_count: "9",
  corner_zone_length_mm: "1120",
  corner_zone_width_mm: "1040",
  winder_steps_count: "3",
  riser_height_mm: "178",
  tread_depth_mm: "250",
  tread_depth_flight1_mm: "250",
  tread_depth_flight2_mm: "245",
});

function fixture(type, formSelection, expected) {
  return Object.freeze({
    type,
    fields: Object.freeze({ ...BASE_FIELDS, ...formSelection }),
    project: Object.freeze({
      schemaVersion: 2,
      type,
      units: "mm",
      measurementMode: "detailed",
      showFields: true,
      activeParam: "",
      activeZone: "",
      autoCalc: { flight1Length: false, flight2Length: false },
      treadMode: { sameTread: false, b1: 250, b2: 245 },
      walls: {
        flight1: { left: false, right: false },
        flight2: { left: false, right: false },
        turn: { left: false, right: false, top: false, bottom: false },
      },
      hasWindows: false,
      windows: [],
      ascent: { show: true, flight1: "start_to_turn", flight2: "turn_to_exit" },
      topBalustrade: { enabled: false, sides: ["top"], length_mm: 0, height_mm: 900, material: "", comment: "" },
      edgeExtensions: [],
      obstacles: [],
      notes: [],
      params: {},
    }),
    expected: Object.freeze(expected),
  });
}

const SVG_VARIANT_FIXTURES = Object.freeze([
  fixture(
    "empty_straight",
    { site_situation: "Пустой проём", opening_type: "Прямой", turn_type: "", stair_direction: "" },
    { title: "Пустой прямой проём", dimensions: ["L", "W", "H", "T"], rects: 1, route: false, winderSteps: 0, geometryHash: "4f438a257426ebcd" },
  ),
  fixture(
    "empty_l_left",
    { site_situation: "Пустой проём", opening_type: "Г-образный левый", turn_type: "", stair_direction: "Старт слева" },
    { title: "Пустой Г-проём левый", dimensions: ["M2", "B2", "M1", "B1"], rects: 3, route: false, winderSteps: 0, orientation: "left", geometryHash: "831c72980b2e8422" },
  ),
  fixture(
    "empty_l_right",
    { site_situation: "Пустой проём", opening_type: "Г-образный правый", turn_type: "", stair_direction: "Старт справа" },
    { title: "Пустой Г-проём правый", dimensions: ["M2", "B2", "M1", "B1"], rects: 3, route: false, winderSteps: 0, orientation: "right", geometryHash: "0cbc99fed36d80d8" },
  ),
  fixture(
    "ready_straight",
    { site_situation: "Готовый металлокаркас", opening_type: "Прямой", turn_type: "", stair_direction: "" },
    { title: "Прямая лестница", dimensions: ["B1", "N1"], rects: 1, route: true, winderSteps: 0, geometryHash: "a0f945919ef91efe" },
  ),
  fixture(
    "ready_l_left_landing",
    { site_situation: "Готовый металлокаркас", opening_type: "Г-образный левый", turn_type: "Площадка", stair_direction: "Старт слева" },
    { title: "Г-образная левая", dimensions: ["B1", "B2"], rects: 3, route: true, winderSteps: 0, orientation: "left", geometryHash: "aa465714be69f694" },
  ),
  fixture(
    "ready_l_right_landing",
    { site_situation: "Готовый металлокаркас", opening_type: "Г-образный правый", turn_type: "Площадка", stair_direction: "Старт справа" },
    { title: "Г-образная правая", dimensions: ["B1", "B2"], rects: 3, route: true, winderSteps: 0, orientation: "right", geometryHash: "7e98a260ecd7de45" },
  ),
  fixture(
    "ready_l_left_winder",
    { site_situation: "Готовый металлокаркас", opening_type: "Г-образный левый", turn_type: "Забежные", stair_direction: "Старт слева" },
    { title: "Г-образная левая", dimensions: ["B1", "B2", "ZN"], rects: 3, route: true, winderSteps: 3, orientation: "left", geometryHash: "c138ae5572e05cd1" },
  ),
  fixture(
    "ready_l_right_winder",
    { site_situation: "Готовый металлокаркас", opening_type: "Г-образный правый", turn_type: "Забежные", stair_direction: "Старт справа" },
    { title: "Г-образная правая", dimensions: ["B1", "B2", "ZN"], rects: 3, route: true, winderSteps: 3, orientation: "right", geometryHash: "a203ffb8b8b0d86b" },
  ),
  fixture(
    "ready_u_landing_left",
    { site_situation: "Готовый металлокаркас", opening_type: "П-образный", turn_type: "Площадка", stair_direction: "Старт слева" },
    { title: "П-образная лестница", dimensions: ["B1", "B2", "ZL", "ZW"], rects: 3, route: true, winderSteps: 0, orientation: "left", geometryHash: "91feb6fafdf622c0" },
  ),
  fixture(
    "ready_u_landing_right",
    { site_situation: "Готовый металлокаркас", opening_type: "П-образный", turn_type: "Площадка", stair_direction: "Старт справа" },
    { title: "П-образная лестница", dimensions: ["B1", "B2", "ZL", "ZW"], rects: 3, route: true, winderSteps: 0, orientation: "right", geometryHash: "91f1b17557369258" },
  ),
  fixture(
    "ready_u_winder_left",
    { site_situation: "Готовый металлокаркас", opening_type: "П-образный", turn_type: "Забежные", stair_direction: "Старт слева" },
    { title: "П-образная лестница", dimensions: ["B1", "B2", "ZN"], rects: 3, route: true, winderSteps: 3, orientation: "left", geometryHash: "04a0aeebf6054900" },
  ),
  fixture(
    "ready_u_winder_right",
    { site_situation: "Готовый металлокаркас", opening_type: "П-образный", turn_type: "Забежные", stair_direction: "Старт справа" },
    { title: "П-образная лестница", dimensions: ["B1", "B2", "ZN"], rects: 3, route: true, winderSteps: 3, orientation: "right", geometryHash: "4a284b0c6c16cde4" },
  ),
]);

module.exports = {
  BASE_FIELDS,
  SVG_VARIANT_FIXTURES,
};
