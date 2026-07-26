# Photo reopen compatibility — isolated acceptance

Дата проверки: 2026-07-26

Проверенная база: `main` после merge PR #88 (`decbd7e`)

## Результат

Статус: **BLOCKED — backend acceptance не запускался**.

Изолированный TEMP → sync → reopen сценарий нельзя безопасно выполнить в текущем окружении.
Репозиторий и доступные подключения не содержат owner-approved Zamery staging/test backend.
Создание замера или загрузка фото через текущий browser runtime затронули бы активный Supabase
project, используемый приложением.

Поэтому не создавались:

- synthetic client или measurement row;
- строка `measurement_photos`;
- offline/TEMP photo для последующей отправки;
- Storage object;
- Auth user или session;
- deployment или production configuration.

## Проверенная исходная точка

- локальный `main` чистый и совпадает с `origin/main`;
- merge commit PR #88 присутствует;
- общий `photo-path.js` подключён в main editor и production view;
- merged regression fixtures проходят: 8/8;
- `node --check` проходит для `photo-path.js`, `app.js`, `production.js` и
  `service-worker.js`;
- PR #88 не изменил SVG runtime files.

Эти проверки подтверждают merged code и regression contract, но не заменяют browser/backend
acceptance с реальным изолированным signed URL.

## Аудит безопасного acceptance path

Найденный локальный путь `python3 -m http.server 4173` безопасен только для проверки статического
app shell без входа. Он не предоставляет локальные Auth, PostgREST и Storage, поэтому не может
проверить TEMP synchronization, signed URL или production view для синхронизированного замера.

Не найдены:

- `supabase/config.toml` и локальный Supabase stack;
- staging-specific app configuration;
- staging deployment manifest или documented staging URL;
- owner-approved test account/project;
- документированная безопасная cleanup procedure для synthetic rows и Storage objects.

Доступный активный Supabase project является тем же project, который напрямую настроен в
`app.js` и `production.js`. Другой доступный project неактивен и не документирован как Zamery
test environment. Он не активировался и не изменялся.

## Acceptance matrix

| Проверка | Статус | Причина |
|---|---|---|
| Synthetic TEMP measurement | NOT RUN | нет approved isolated backend |
| Exactly one TEMP photo | NOT RUN | Storage write небезопасен без isolation |
| TEMP photo synchronization | NOT RUN | потребовал бы mutation активного backend |
| Editor reopen photo visible | UNKNOWN | scenario не создан |
| Production photo visible | UNKNOWN | scenario не создан |
| Duplicate gallery entries | UNKNOWN | только regression fixture PASS |
| Cross-measurement leakage | UNKNOWN | только regression fixture PASS |
| Pending/syncing recovery | UNKNOWN | backend flow не запускался |
| Signed URL resolves | UNKNOWN | synthetic Storage object не создавался |
| Measurement SVG after reopen | UNKNOWN | synthetic measurement не создавался |
| Synthetic cleanup | NOT SAFE | synthetic data не создавались; cleanup contract отсутствует |

## Точный prerequisite для разблокировки

Owner должен предоставить и явно одобрить один из вариантов:

1. отдельный Supabase staging/test project с Zamery schema, RLS, Auth test credentials,
   `measurement-photos` bucket, staging app configuration/URL и cleanup procedure; или
2. воспроизводимый локальный Supabase stack с теми же schema/policies, локальным test user,
   Storage bucket и инструкцией запуска приложения против local endpoints.

После этого выполнить ровно один synthetic сценарий:

1. создать TEMP measurement и одно synthetic photo;
2. синхронизировать;
3. записать server measurement id, photo row id и Storage path без секретов;
4. reload/reopen в editor и production view;
5. проверить одну gallery entry, отсутствие leakage/stuck state, signed URL и SVG;
6. удалить только записанные synthetic ids/objects по approved cleanup procedure;
7. приложить обезличенные screenshots и итоговый evidence matrix.

## Safety confirmation

- real customer data не читались и не изменялись;
- Supabase schema, RLS, Auth users и environment values не изменялись;
- Storage objects не создавались, не перемещались и не удалялись;
- production configuration и deployment не изменялись;
- SVG runtime files и drawing behavior не изменялись.
