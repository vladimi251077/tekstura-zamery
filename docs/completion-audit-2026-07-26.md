# Tekstura Замеры — completion audit

Дата аудита: 2026-07-26

Проверенная ветка: `main`

Проверенный commit: `9deaf286f049dd0ed7dd2eb10c957b1f9ad90f05`

Последний включённый photo/offline fix: PR #85

## Решение по готовности

Приложение является рабочим статическим PWA-прототипом, который уже содержит большую часть
полевого сценария, но считать его завершённым или безопасным для миграции пока нельзя.

Главные причины:

1. Фото, синхронизированные из TEMP-черновика, записываются по пути
   `measurements/<measurement-id>/<local-photo-id>.<ext>`, но основной и производственный экраны
   после повторного открытия принимают только пути
   `<measurement-number>_<measurement-id>/...` и `<measurement-number>/...`. Строка
   `measurement_photos` и файл могут существовать, но фото будет скрыто как «чужое/старое».
2. TEMP-замер, прерванный в состоянии `syncing`, нельзя повторно синхронизировать через UI.
   PR #85 восстановил повторную обработку `syncing` для фото, но не для самого замера.
3. Создание клиента и замера не является идемпотентным. Прерывание после серверного insert, но до
   записи server id в IndexedDB, может породить повторного клиента или повторный замер.
4. Проверка обязательных размеров вычисляется, но `requireWorkflowReady()` всегда возвращает
   `true`; любое обычное сохранение принудительно ставит `Готовый замер`. Реального разделения
   черновика, завершения и передачи дальше нет.
5. Репозиторий не содержит полного DDL, RLS, Storage policies или тестов действующей cloud-схемы.
   Надёжность `created_by`, `added_by`, `profiles` и role access нельзя доказать из Git.
6. Каноническая self-hosted схема `tekstura-platform` сейчас содержит восемь website/CRM/SEO
   таблиц и намеренно не содержит `profiles`, `clients`, `measurements` и
   `measurement_photos`. Текущее приложение с ней несовместимо.

До закрытия этих пунктов статус completion: **BLOCKED**.

## Границы и метод

Проверены все tracked-файлы репозитория: README и `docs/`, основной HTML/runtime, IndexedDB,
drawing bridge, service worker, production view, вспомогательные/диагностические файлы,
единственная Supabase migration, manifest и отсутствие deployment/test configuration.

Также read-only сопоставлены:

- канонический восьмитабличный schema-rehearsal в `tekstura-platform`;
- каркас `apps/estimator-app`;
- текущие типы `packages/stair-domain`.

Не выполнялись:

- вход в production Supabase;
- чтение или изменение production-данных;
- Storage upload/delete;
- проверка Auth users;
- deploy;
- изменение schema/RLS;
- физическая проверка Android/iOS.

Поэтому `WORKING` ниже означает «реализовано и статически согласовано в коде», а не подтверждение
production/mobile acceptance test.

## Текущая архитектура

- Статическое приложение без build step: `index.html`, CSS и browser JavaScript.
- `app.js` — монолитный runtime: auth, роли, клиенты, замеры, фото, offline sync, корзина и export.
- `drawing-bridge.js` — второй крупный stateful runtime, который генерирует SVG и хранит
  `drawing_project_json` schemaVersion 2 и `finish_dimensions_json`.
- `offline-db.js` — IndexedDB `tekstura-offline-shell`, version 3, stores `metadata`,
  `offline_drafts`, `sync_queue`, `offline_photos`.
- `service-worker.js` — versioned app-shell cache, network-first для document/script/style,
  cache-first для manifest/image; Supabase и production view не перехватываются.
- Supabase browser client напрямую обращается к Auth, PostgREST и private Storage bucket
  `measurement-photos`.
- `production.html`/`production.js` — отдельный online-only экран изготовителя с самостоятельным
  auth bootstrap и browser print.
- Deployment описан как Vercel, но в репозитории нет `vercel.json`, CI, environment build,
  preview verification или release manifest.

## Инвентарь пользовательского сценария

### Вход и доступ

Реализовано:

- online password login через Supabase Auth;
- короткие логины, преобразуемые в email;
- загрузка `profiles`;
- локально remembered identity для offline startup;
- logout;
- скрытая signup-кнопка, хотя handler остаётся в runtime;
- отдельный production login.

Ограничения:

- offline remembered identity открывает локальный UI, но не является действующей серверной
  сессией;
- при отсутствии/ошибке profile роль откатывается к `zamer` или к hard-coded identity;
- role checks в browser не являются авторизацией;
- корзина и permanent-delete UI разрешены любому вошедшему пользователю
  (`canUseTrashActions()`), а hard-delete дополнительно защищён паролем, находящимся в browser
  source; безопасность полностью зависит от неизвестных RLS policies;
- signup скрыт визуально, но код создания Auth user остаётся;
- production mode при отсутствии profile по умолчанию даёт browser-role `production`.

Статус: **PARTIAL**.

### Клиенты

Реализовано:

- при первом сохранении нового замера создаётся клиент;
- при редактировании замера обновляется связанный клиент;
- поля: имя, телефон, адрес, фиксированный город `Казань`;
- при hard delete последнего замера предпринимается удаление клиента.

Не реализовано или рискованно:

- нет поиска и выбора существующего клиента;
- нет дедупликации по телефону/адресу;
- создание клиента и замера не транзакционно: ошибка measurement insert оставляет клиента;
- `created_by` всегда отправляется из browser, но его FK/RLS контракт в Git отсутствует;
- редактирование клиента из одного замера меняет общий client row для всех связанных замеров.

Статус: **PARTIAL**.

### Новый замер и поля

Реализовано:

- выбор простого или детального режима;
- общие сведения об объекте и клиенте;
- основные размеры проёма, маршей и зоны поворота;
- препятствия, материалы стен/перекрытия, тёплый пол, трубы, электрика, вентиляция;
- динамические размеры и параметры чертежа;
- дополнительная вкладка ограждений/деталей.

Не завершено:

- детальные поля временно сериализуются внутрь `general_comment` с marker-текстом;
- нет versioned, shared DTO для формы;
- нет серверной validation schema;
- UI validation показывает ошибки, но не блокирует завершение;
- обычное сохранение всегда ставит `Готовый замер`;
- номер строится в browser из времени и не имеет доказанной unique/idempotency гарантии;
- нет conflict detection при одновременном редактировании.

Статус: **PARTIAL**.

### Схемы лестницы и проёма

Реализовано:

- активный `drawing-bridge.js` создаёт/восстанавливает project JSON, finish JSON и SVG;
- варианты прямых, Г- и П-образных схем, площадок и забежных ступеней;
- simple/detailed modes, стены, окна, препятствия, ограждения и чистовые параметры;
- preview в основном приложении и production view;
- JSON/SVG сохраняются вместе с measurement.

Риски:

- `drawing-bridge.js` — 2 400+ строк без unit/fixture tests;
- доменная схема локальная и не соответствует напрямую `@tekstura/stair-domain`;
- JSON migration/version upgrade отсутствует, кроме записи `schemaVersion: 2`;
- сохранённый SVG вставляется обратно в DOM как markup; trust/sanitization contract не определён;
- `scheme-enhance.js` и `sizes-smart.js` являются альтернативными крупными UI-реализациями, но
  не подключены;
- `scheme-sketch.js` подключён, но состоит только из сообщения «временно отключено»;
- `svg-constructor/embedded.html` не используется активным runtime.

Статус: **PARTIAL**.

### Сохранение, повторное открытие и редактирование

Реализовано:

- online insert/update клиента и замера;
- список, поиск и status filters;
- preview и возврат в edit mode;
- повторное заполнение form fields, drawing JSON, finish JSON и SVG;
- soft delete, restore, archive и hard delete;
- production view по query `?id=...`.

Не завершено:

- нет сохранённого online draft status;
- нет явного finalization action/immutable revision;
- проверки обязательных полей не блокируют готовность;
- фото TEMP-sync скрываются после reopen из-за несовместимого path predicate;
- производственный экран повторяет тот же дефект photo path;
- offline открыть можно только локальные TEMP; ранее загруженные server measurements не кэшируются.

Статус: **PARTIAL**.

### Offline draft и autosave

Реализовано:

- создание TEMP draft;
- autosave формы через 500 ms;
- сохранение JSON/SVG в IndexedDB;
- повторное открытие после restart;
- локальное удаление draft вместе с фото;
- отображение sync status/error.

Риски:

- async save в `beforeunload` не гарантируется браузером;
- нет `visibilitychange`/`pagehide` flush и подтверждения завершившейся IndexedDB transaction;
- нет dirty revision или serial write queue; несколько save операций могут завершиться не по
  порядку;
- draft в `syncing` после crash/restart остаётся без кнопки retry;
- store `sync_queue` создан, но фактически не используется;
- нет Storage persistence request, quota telemetry или защиты от eviction;
- нет локального encrypted/user namespace; drafts остаются на shared device после logout;
- пользователь может удалить draft с unsynced photos без recovery.

Статус: **PARTIAL**.

### Фото: capture, local save, upload и delete

Реализовано:

- Android-style camera input: `accept="image/*" capture="environment"`;
- отдельный gallery input с multiple selection;
- автоматическое сохранение после выбора;
- offline compression и Blob в IndexedDB;
- online Storage upload и insert в `measurement_photos`;
- signed URL preview;
- online и local delete;
- защита UI от показа rows другого `measurement_id`.

Риски:

- camera/gallery behavior не проверен на реальном Android Chrome/PWA после PR #85;
- HEIC/JFIF разрешены, но browser decode/canvas compression не гарантированы;
- online photos не получают durable local queue; закрытие вкладки теряет выбранный `File`;
- ambiguous network result или повторный выбор может создать duplicate file/row;
- single-photo delete сначала удаляет DB row, затем Storage object; Storage failure оставляет orphan;
- hard delete сначала удаляет Storage objects, затем DB rows; DB failure оставляет rows с
  отсутствующими файлами;
- signed URLs живут час и не обновляются автоматически на долго открытом экране;
- raw Storage path показывается пользователю.

Статус capture: **PARTIAL**.

Статус online upload/delete: **PARTIAL**.

### TEMP photo sync

Реализовано:

- deterministic local-photo Storage path;
- повторная обработка local statuses `local_only`, `sync_error`, `syncing`;
- reuse `server_file_path` после успешного upload;
- lookup существующей `measurement_photos` row перед insert;
- подробный per-photo status/error и retry button;
- local Blob сохраняется после ошибки.

Блокирующие дефекты:

- итоговый Storage path не принимается reopen filters;
- upload success + crash до сохранения `server_file_path` приводит к конфликту `upsert:false` на
  retry без recovery;
- network timeout после фактически успешного upload имеет тот же риск;
- measurement sync помечается `synced` до завершения photos, поэтому общий status не выражает
  partial completion;
- нет единого durable operation id и server-side unique constraint для exactly-once semantics;
- local `synced` не перепроверяется по фактической DB row/object;
- диагностический `raw_response` и metadata логируются в production console.

Статус: **BROKEN** до исправления reopen path и retry reconciliation.

### Завершение и документы

Есть:

- browser print основного preview;
- browser print production card;
- JSON export;
- минимальный CSV только с номером, статусом и контактами.

Нет:

- сформированного PDF;
- versioned measurement report;
- полного structured export;
- подписи/подтверждения замерщика и клиента;
- финального lock/revision;
- надёжного статуса «черновик → готов → передан/принят».

Статус: **PARTIAL**; генерация PDF **NOT IMPLEMENTED**.

### Администратор и производство

Есть role-dependent UI, archive/trash/restore/hard delete, production list/status update и print.

Доказать безопасность нельзя: полный DDL/RLS отсутствует, browser checks широкие и противоречивые,
а hard-delete password публичен в bundle. Administrator workflow должен считаться **PARTIAL** и
не должен мигрировать без server-side authorization contract.

## Матрица функций

| Функция | Статус | Что нужно для DONE |
| --- | --- | --- |
| Online auth | Partial | Auth/RLS tests, profile provisioning, explicit role contract |
| Offline startup identity | Partial | expiry/revocation UX, local user namespace, phone test |
| Client create/update | Partial | selection, deduplication, transactional/idempotent save |
| New measurement | Partial | actual draft lifecycle and shared validation |
| Measurement fields | Partial | typed DTO, migrations, required-field enforcement |
| Drawings | Partial | fixtures, schema adapter, SVG trust policy |
| Online save/edit | Partial | conflict handling, transaction/idempotency |
| TEMP drafts | Partial | stale-state recovery, ordered durable autosave |
| Offline app shell | Partial | automated cache/update tests and real mobile acceptance |
| Camera/gallery selection | Partial | Android/iOS device matrix |
| Online photo upload | Partial | durable queue, idempotency, reconciliation |
| TEMP photo sync | Broken | path fix, conflict recovery, exactly-once contract |
| Photo after reopen | Broken for TEMP-synced photos | accept canonical offline-sync path in both views |
| Photo deletion | Partial | server transaction/cleanup job and tests |
| Measurement reopen/edit | Partial | photo fix and regression/E2E coverage |
| Finalization | Broken as workflow | validation gate, statuses, immutable revision |
| JSON/CSV | Partial | shared export schema, full data |
| Print | Partial | snapshot tests and document metadata |
| PDF | Not implemented | approved template and generated artifact |
| Admin operations | Partial | server permissions and audit history |
| Production view | Partial | local SDK, authorization tests, photo path fix |

## Cloud Supabase dependencies

Текущий runtime жёстко зависит от:

- Supabase Auth session/password login;
- `profiles(id, role, full_name, ...)`;
- `clients` с `created_by`;
- `measurements` со всеми form/drawing/status/archive/trash/measurer columns;
- `measurement_photos` с `measurement_id`, `file_path`, `photo_type`, `is_required`, `added_by` и
  необязательными `file_name`, `size_bytes`;
- private bucket `measurement-photos`;
- working SELECT/INSERT/UPDATE/DELETE RLS и Storage policies;
- FK-совместимости `auth.uid()`, `profiles.id`, `created_by`, `measurer_id`,
  `measurer_user_id`, `added_by`, `deleted_by`, `archived_by`.

В Git есть только migration, добавляющая три measurer columns. Полный baseline schema, constraints,
indexes, triggers, grants, RLS и Storage policies отсутствуют. Поэтому cloud compatibility и
referential integrity имеют статус **UNKNOWN**, пока не появится Git-safe schema contract и
isolated test environment.

## Совместимость с canonical self-hosted 8-table schema

Статус: **FAIL**.

Восьмитабличный schema-rehearsal содержит:

- `settings`;
- `services`;
- `projects`;
- `calculator_requests`;
- `seo_sync_runs`;
- `seo_query_stats`;
- `seo_tracked_queries`;
- `project_images`.

Он намеренно не содержит operational measurement tables. В canonical migration plan
`profiles`, `clients`, `measurements` и `measurement_photos` отложены до отдельного Phase 8
operational design. Текущий browser runtime не сможет загрузить profile, список замеров, клиентов
или фото на этой схеме.

Дополнительные несовместимости:

- canonical auth использует trusted JWT roles/assignments, а приложение читает свободное поле
  `profiles.role` и делает substring checks;
- canonical `projects` — public portfolio concept и не может быть заменой operational measurement;
- `calculator_requests.dimensions_json` не является measurement aggregate;
- `@tekstura/stair-domain` использует typed English DTO, а приложение хранит отдельный
  `drawing_project_json` schemaVersion 2;
- photo/storage contract и offline idempotency key в platform ещё не определены;
- `apps/estimator-app` пока только пустой Next.js foundation page.

Миграция в `apps/estimator-app` заблокирована до утверждения operational schema и adapter
contracts. Копировать `app.js` в Next.js как есть нельзя.

## Dead, duplicate и временный код

- `scheme-enhance.js` — альтернативный редактор схемы, не подключён.
- `sizes-smart.js` — альтернативный редактор размеров, не подключён.
- `svg-constructor/embedded.html` — не используется активным runtime.
- `sync_queue` IndexedDB store — CRUD подготовлен, но sync workflow его не использует.
- `scheme-sketch.js` подключён, но только сообщает, что временно отключён.
- hidden signup handler остаётся в production bundle.
- `requireWorkflowReady()` — фактически dead validation gate, всегда возвращает `true`.
- `canDeleteMeasurements()` объявлен, но trash/hard-delete UI использует более широкий
  `canUseTrashActions()`.
- README/docs местами описывают workflow «проверка/принятие», тогда как handlers сейчас просто
  повторно сохраняют `Готовый замер`.
- основной и production runtimes дублируют Supabase config, auth, photo path, signed URL, SVG
  enhancement и status logic.

Удалять это можно только отдельными маленькими PR после characterization tests.

## Диагностика, видимая пользователям

- «Технические действия → Проверить офлайн-доступ» выводит длинную строку с cache names, URLs,
  auth/profile ids, role, `created_by` и последней Supabase ошибкой.
- photo cards показывают raw Storage path и число «скрытых чужих/старых записей».
- TEMP photo sync может показать bucket, path и measurement id внутри error text.
- вкладка ограждений показывает текст о временном хранении данных в комментарии.
- boot fallback предлагает `offline-test.html` и очистку site data.
- `offline-diagnostics.html` и `offline-test.html` доступны как отдельные production pages.
- production console содержит подробные PR #85 trace payloads, включая Blob metadata и raw
  Supabase response.

Перед завершением diagnostics должны стать role-gated structured support report с кнопкой
копирования, redaction и отдельным debug flag. В обычном UI должны остаться только понятные
status/retry сообщения.

## Риски потери или расхождения данных

1. Скрытие успешно синхронизированных TEMP photos после reopen.
2. Duplicate clients/measurements после неопределённого результата insert.
3. Stuck TEMP measurement в `syncing`.
4. Stuck photo после успешного Storage upload, если local checkpoint не записан.
5. Orphan Storage object или DB row из-за разного порядка non-transactional delete.
6. Потеря последних 500 ms изменений при kill/background transition.
7. IndexedDB eviction/quota exhaustion без предупреждения.
8. Потеря выбранных online File objects при закрытии приложения.
9. Last-write-wins без revision check при параллельном редактировании.
10. Сохранение неполного замера как `Готовый замер`.
11. Удаление local draft вместе с unsynced photos без recovery/export.
12. Недоступность фото после истечения signed URL на долго открытом экране.

## Отсутствующие проверки

В репозитории нет package/test runner, CI или automated tests. Нужны:

- unit tests для path ownership, status transitions, queue selection, retry reconciliation,
  payload mapping, validation matrix и roles;
- IndexedDB tests: upgrade v1→v3, ordered autosave, Blob persistence, stale `syncing`, quota/error;
- Supabase integration tests в isolated project: all CRUD/RLS/FK paths для каждой роли;
- Storage tests: upload ambiguity, existing object, row-only/object-only recovery, signed URL,
  delete partial failure;
- E2E tests: login, create/save/reopen/edit/finalize, drawings, camera/gallery mock, TEMP restart,
  reconnect and retry;
- service-worker tests: first install, update from prior versions, offline cold start, corrupted/
  partial cache, scope/subpath behavior;
- Android Chrome installed-PWA acceptance test и iOS Safari/Home Screen acceptance test;
- production print/photo/status tests;
- schema/DTO contract tests against `@tekstura/stair-domain` and future operational schema;
- accessibility and small-screen layout checks.

Текущая автоматическая проверка ограничена успешным `node --check` всех JavaScript-файлов.

## Точный план завершения

### Phase A — стабилизировать standalone application

Порядок обязателен:

1. Добавить минимальный test harness без runtime refactor и characterization tests для:
   photo path ownership, offline status predicates и measurement payload.
2. Исправить единый photo path contract в основном и production views; принять online,
   legacy и `measurements/<id>/...` paths, сохранив обязательную проверку `measurement_id`.
3. Добавить regression test: TEMP → server measurement → photo sync → reload/reopen → main preview
   и production view видят ту же row/path.
4. Ввести recoverable sync state machine:
   `local_only → syncing → measurement_synced → photos_partial|synced|error`; при startup
   переводить stale `syncing` в recoverable state после reconciliation.
5. Ввести durable `operation_id`/idempotency contract. Сначала утвердить schema/RPC migration;
   затем одна server transaction создаёт/находит client+measurement по operation id.
6. Добавить photo reconciliation для object-only, row-only и local-checkpoint-only состояний;
   duplicate key/existing object не должен быть terminal error.
7. Сериализовать IndexedDB writes per draft, flush на `visibilitychange/pagehide`, показать
   сохранённую revision и quota/persistence warning.
8. Исправить delete semantics: server-side authorized operation или compensating cleanup queue;
   исключить публичный browser password и ограничить UI реальной permission.
9. Определить один release version для HTML query strings, app diagnostics и service worker
   cache; добавить update test с предыдущей версией.
10. Redact/gate diagnostics; удалить временный disabled script и после tests классифицировать
    альтернативные editors как delete/archive/reuse.

Exit criteria:

- повторный retry не создаёт duplicate client/measurement/photo;
- crash на каждом sync checkpoint восстанавливается;
- все synced photos видны после restart;
- local data не удаляется до verified completion;
- unit/integration tests зелёные.

### Phase B — завершить measurement workflow

1. Утвердить versioned MeasurementDraft/Measurement/Client/Photo/Attachment DTO.
2. Реализовать выбор существующего клиента и явное создание нового, с dedup hint.
3. Ввести lifecycle:
   `draft → ready_for_review → approved/ready_for_production → production statuses → archived`.
4. Сделать required-field matrix реальным blocking validation; фото requirements задавать по
   типу замера.
5. Разделить Save draft, Finalize и Reopen for correction; записывать revisions/status history.
6. Перенести временные detail markers из comment в typed JSON/child records через migration.
7. Добавить complete preview/report и versioned JSON export.
8. Утвердить PDF template, server/client generation strategy, filename, revision and retention;
   реализовать PDF только после approval.
9. Проверить production access/status transitions и audit trail server-side.

Exit criteria:

- замер можно безопасно начать, сохранить, закрыть, открыть, изменить и финализировать;
- incomplete measurement нельзя случайно отправить как ready;
- PDF/print/export воспроизводят одну immutable revision;
- роли проверяются сервером.

### Phase C — проверка на телефоне реальными замерами

1. Подготовить isolated test account/project и заранее согласованный набор без production data.
2. Android Chrome browser: camera single capture, gallery multi-select, rotate/large image,
   background/kill, weak LTE, airplane mode, reconnect.
3. Android installed PWA: fresh install, cache update from previous release, cold start offline,
   TEMP+5–10 photos, repeated retry, reopen after 1/8/24 hours.
4. iPhone Safari/Home Screen: те же critical flows с отдельно зафиксированными platform limits.
5. Сделать минимум три полных реальных сценария: empty straight, L/U landing, winder/detailed.
6. На каждом сценарии сверить UI, DB rows, Storage objects, reopen, production print/PDF и cleanup
   только в isolated environment.
7. Записать device/OS/browser/version, screenshots без PII, timings, failures и acceptance sign-off.

Exit criteria:

- ноль потерянных/скрытых/duplicate photos;
- restart/retry проходит на каждом устройстве;
- замерщик подписал удобство формы;
- release checklist воспроизводим.

### Phase D — миграция в `tekstura-platform`

1. Утвердить Phase 8 operational schema отдельно от восьми website/SEO tables:
   identities/role assignments, clients, measurements/revisions, photos/attachments, comments,
   status history и idempotency operations.
2. Зафиксировать privacy, retention, RLS, Storage path/policy, audit and backup/restore contracts.
3. Создать shared TypeScript DTO/Zod schemas и compatibility fixtures из реальных обезличенных
   standalone payloads.
4. Написать adapters:
   legacy measurement row ↔ canonical aggregate;
   drawing schema v2 ↔ stair-domain input;
   legacy/offline photo paths ↔ canonical attachment contract.
5. Реализовать server API в platform; browser не должен напрямую выполнять privileged multi-table
   mutations.
6. Переносить UI вертикальными slices в `apps/estimator-app`, начиная с read-only reopen, затем
   draft/save, drawing, photos, offline sync, finalization и admin/production.
7. Запустить dual-read comparison, затем owner-approved migration rehearsal; dual-write только
   если отдельно спроектированы idempotency и rollback.
8. Переключение выполнять после parity report, backup/restore test и mobile acceptance.

Текущий статус: **BLOCKED**, потому что operational schema/API отсутствуют, а estimator app пуст.

### Phase E — shared domain для website и будущего AI stair assistant

1. Сделать `@tekstura/stair-domain` единственным vocabulary для layout/turn/dimensions/warnings и
   добавить adapter текущего `drawing_project_json` schemaVersion 2.
2. Добавить shared `MeasurementInput`, `MeasurementRevision`, `PhotoAttachment`,
   `PhotoSyncOperation`, `PricingInput/Quote` contracts с version ids и units.
3. Хранить raw measurement evidence отдельно от derived calculations/pricing and AI output.
4. Website calculator, estimator app и AI assistant должны вызывать одну deterministic calculation
   service/package и сохранять calculation/pricing version.
5. AI assistant может предлагать/объяснять, но не изменять approved measurement или цену без
   explicit user confirmation и server authorization.
6. Добавить provenance: source photo/field, confidence, warnings, human override, prompt/model/tool
   version и audit event.
7. Общие photo contracts должны описывать ownership, checksum, MIME, dimensions, variants,
   retention, signed access и offline idempotency key.

## Exact first implementation task

Создать маленький PR **только для photo reopen compatibility**:

1. вынести pure predicate `photoPathBelongsToMeasurement(photo, measurement)` в один shared browser
   module, используемый `app.js` и `production.js`;
2. сохранить обязательное равенство `photo.measurement_id === measurement.id`;
3. разрешить ровно три path families:
   `<number>_<id>/...`, `<number>/...`, `measurements/<id>/...`;
4. добавить unit fixtures для accepted/rejected paths, включая другой measurement id и похожие
   prefix;
5. добавить regression fixture для path, который создаёт `offlinePhotoStoragePath()`;
6. не менять upload paths, Supabase, schema, Storage objects или production data;
7. manual acceptance в isolated environment: синхронизировать одно TEMP photo, перезагрузить,
   открыть замер в main и production view, убедиться, что фото отображается.

После этого отдельным PR выполнить stale `syncing` recovery и idempotency design; не смешивать эти
риски с первым path fix.

## Owner action

До runtime-работы owner должен подтвердить:

1. этот порядок Phase A;
2. что первый PR исправляет только photo reopen path и добавляет tests;
3. что любая будущая cloud schema/RPC/RLS работа требует отдельного approval и isolated project;
4. operational measurement schema остаётся отдельной Phase 8 частью `tekstura-platform`, а не
   расширением public portfolio `projects`.
