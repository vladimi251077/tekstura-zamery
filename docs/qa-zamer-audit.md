# QA zamer audit

Дата: 2026-06-03

База проверки: `main` после merge PR #61 (`5d4e020`, `Simplify measurement workflow and save as ready`).

Ветка аудита: `codex/audit-zamer-workflow-offline-startup`.

## Резюме

Приложение после PR #61 действительно убрало рабочий workflow "Черновик -> На проверке -> Принять": новый online-замер сохраняется как "Готовый замер", кнопок "Отправить на проверку" и "Принять замер" в UI нет, в списке статусов остались "Готовый замер", производственные статусы, "Архив" и "Корзина".

Главная найденная проблема по offline/PWA: healthcheck в `app.js` проверял старый cache `tekstura-offline-shell-v14-app-shell`, хотя `service-worker.js` после PR #61 создавал `tekstura-offline-shell-v15-app-shell`. Из-за этого "Технические действия -> Проверить офлайн-доступ" мог показывать ложное "Офлайн-режим ещё не подготовлен". В этом PR исправлено и поднято до `v16`.

Главная архитектурная причина долгого/неровного открытия: online `init()` всё ещё ждёт `supabase.auth.getSession()`, затем `loadProfile()`, затем `loadMeasurements()` до полного рабочего состояния. При отсутствии сохранённой локальной сессии это корректно показывает login, но при медленной сети UX остаётся зависимым от Supabase. Нужен отдельный небольшой auth bootstrap PR.

## Что проверено локально

Окружение:

- статический сервер: `python3 -m http.server 4173`;
- URL: `http://localhost:4173/`;
- Browser DOM-check через Codex in-app Browser;
- без реального логина в Supabase и без изменения production-данных.

Результаты локального cold start без сохранённого входа:

- приложение показывает интерфейс входа, белого экрана после `DOMContentLoaded` не наблюдалось;
- `auth-view` видим, `main-view` скрыт;
- сообщение: "Сначала войдите один раз при интернете. Потом приложение будет открываться без интернета.";
- загружается `./app.js?v=20260603-audit-healthcheck`;
- старых кнопок "Отправить на проверку" и "Принять замер" нет;
- статусы в форме: "Готовый замер", "Передан в расчёт", "Смета готова", "Заказ принят", "Архив";
- статусы в фильтре: "Рабочие", "Все", "Готовый замер", "Передан в расчёт", "Смета готова", "Заказ принят", "Архив", "Корзина".

Console:

- критичных JS errors не зафиксировано;
- warning Supabase `Multiple GoTrueClient instances detected` появлялся в тестовом browser context после нескольких reload. Это не пользовательская ошибка, но стоит перепроверить на чистом телефоне.

## Этап 1. Тест как замерщик

### 1. Онлайн-старт

Статус: частично проверено локально без реального логина.

Наблюдения:

- первый видимый интерфейс появляется быстро после загрузки HTML/CSS/JS;
- без сохранённого входа login показывается сразу после `init()`;
- белый экран в локальном сценарии не пойман;
- список замеров без логина не загружается;
- вход после перезагрузки вручную не проверен, потому что в тестовой среде не было рабочих credentials.

Кодовые выводы:

- `registerServiceWorker()` регистрирует SW только после `window.load`;
- `init()` в offline/no-Supabase ветке сначала читает Supabase session/local remembered auth, показывает UI, потом offline notice;
- `init()` в online ветке ждёт `supabase.auth.getSession()` до решения, показывать ли login;
- `loadProfile()` и `loadMeasurements()` выполняются последовательно после определения пользователя.

Риск:

- при медленном `getSession()` пользователь может ждать решения auth;
- если Supabase CDN или auth временно недоступны, важно не считать это "точно не вошёл".

### 2. Новый замер online

Статус: статически и UI-проверкой после PR #61.

Подтверждено:

- `newMeasurement()` создаёт замер со статусом "Готовый замер";
- `saveMeasurement()` перед insert/update принудительно ставит `measurement.status = "Готовый замер"`;
- локальный TEMP в `getFormData()` остаётся "Офлайн-черновик";
- кнопок "Отправить на проверку" и "Принять замер" в HTML нет;
- старые handlers остались optional-safe для старого HTML из cache, но не переводят в "На проверке".

Не проверено на Supabase:

- реальное создание пяти вариантов "Что есть на объекте";
- реальное создание пяти типов проёма;
- повторное открытие и сохранение на боевой базе.

Рекомендация для телефона:

- проверить один реальный тестовый замер и удалить/архивировать его по штатной процедуре;
- отдельно пройти варианты "Пустой проём", "Готовый металлокаркас", "Бетонная лестница", "Старая лестница / демонтаж", "Нестандартная ситуация".

### 3. Размеры и SVG

Статус: статический audit.

Кодовые выводы:

- `drawing_svg`, `drawing_project_json`, `finish_dimensions_json` входят в `dynamicMeasurementFields`;
- `saveMeasurement()` сохраняет эти поля через общий payload;
- preview и production используют `drawing_svg` и `drawing_project_json`;
- production mode рендерит SVG через `enhanceProductionSvg(...)`.

Риск:

- вкладка "Проверка" больше не блокирует сохранение, но всё ещё показывает ошибки обязательных размеров. Это теперь подсказки, а не workflow gate.

Нужно проверить на телефоне:

- открыть/сохранить схему;
- убедиться, что SVG не чёрный, не пустой, корректно виден в preview;
- открыть тот же замер через `production.html?id=...`.

### 4. Фото online

Статус: статический audit.

Кодовые выводы:

- фото с камеры и галереи представлены отдельными input;
- upload online сначала сохраняет замер, если `measurement.id` ещё нет;
- запись создаётся в `measurement_photos`;
- preview использует signed URL;
- delete проверяет принадлежность фото текущему замеру.

Не выполнено:

- реальная загрузка фото в Storage;
- удаление случайно добавленного фото;
- проверка signed URL на телефоне.

Причина: не выполнялись действия, которые меняют production Supabase/Storage.

### 5. Offline TEMP-черновик

Статус: статический audit и частичная PWA-проверка.

Подтверждено кодом:

- TEMP-черновик создаётся в IndexedDB как `Офлайн-черновик`;
- offline-фото хранятся в `offline_photos`;
- при sync TEMP payload теперь получает `status: "Готовый замер"`;
- локальный TEMP до sync не открывается в production mode.

Найденная проблема:

- healthcheck проверял старый cache name, из-за чего offline-ready мог диагностироваться неправильно. Исправлено.

Нужно проверить на телефоне:

- открыть сайт online;
- нажать "Обновить" 2-3 раза;
- открыть "Технические действия -> Проверить офлайн-доступ";
- ожидать "Service Worker: active ... Cache shell: есть ... Офлайн-режим готов";
- включить авиарежим;
- создать TEMP, добавить фото, закрыть/открыть;
- выключить авиарежим и синхронизировать;
- проверить в Supabase `measurements.status = "Готовый замер"` и строки `measurement_photos`.

### 6. Корзина

Статус: статический audit.

Кодовые выводы:

- перенос в корзину использует soft delete (`is_deleted`, `deleted_at`, `deleted_by`);
- восстановление снимает `is_deleted`;
- полное удаление требует пароль `PERMANENT_DELETE_PASSWORD`;
- массовое удаление работает только по выбранным замерам из фильтра "Корзина";
- локальные TEMP не удаляются из Supabase.

Не выполнялось:

- удаление одного замера навсегда;
- массовое удаление;
- очистка всей корзины.

Причина: это destructive production-действия.

### 7. Режим "Для изготовителя"

Статус: статический audit.

Кодовые выводы:

- `production.js` показывает только статусы production-ready, включая "Готовый замер";
- схема берётся из `drawing_svg`;
- фото берутся из `measurement_photos` + signed URL;
- производственные статусы меняются отдельно от редактирования замера;
- локальный TEMP получает ссылку `#` вместо `production.html`, пока не синхронизирован.

Риск:

- `production.js` имеет отдельный auth bootstrap и напрямую ждёт `supabase.auth.getSession()`. Если production mode тоже должен быть offline-tolerant, нужен отдельный PR; сейчас production mode не входит в app shell cache.

## Этап 2. Анализ авторизации и медленного открытия

### Ответы на вопросы

1. Блокирует ли `supabase.auth.getSession()` первый рендер?

Частично. HTML/CSS уже видны, но решение "login или main" в online ветке принимается только после `getSession()`. При медленной сети это может задержать переход к main UI.

2. Блокирует ли `loadProfile()` первый рендер?

Для authed online-сценария да: `showApp(true)` вызывается после `await loadProfile()`. Если profile медленный, main UI показывается позже, хотя fallback profile уже возможен.

3. Блокирует ли `loadMeasurements()` интерфейс?

После `showApp(true)` список замеров загружается последовательно. Main UI уже виден, но список и рабочее состояние зависят от `loadMeasurements()`.

4. Может ли приложение сначала показать shell, а потом догружать Supabase?

Да. Текущая структура уже близка, но online ветку можно улучшить: сначала применить remembered auth/stored session и показать main, затем параллельно обновлять auth/profile/measurements.

5. Почему при offline/медленном интернете показывается экран входа?

Если нет Supabase local session и нет `REMEMBERED_AUTH_KEY`, приложение считает, что пользователь не входил, и показывает login. При медленном online auth без network error login может появиться после `getSession()` с пустой session.

6. Почему сохранённый вход может не подхватываться?

`REMEMBERED_AUTH_KEY` сохраняется только после успешного `loadProfile()`/login/init с user. Если пользователь вошёл, но profile/network упали до `saveRememberedAuth()`, fallback может не сохраниться. Также remembered auth содержит минимум данных и не хранит "last known profile" отдельно.

7. Достаточно ли данных в `REMEMBERED_AUTH_KEY`?

Для показа локального main UI достаточно: `user.id`, `email`, `full_name`, `role`, `login`. Для более устойчивого UX лучше добавить timestamp и last known profile/source status в отдельную metadata-запись или расширить объект.

8. Нужно ли сохранять локальный "last known profile"?

Да, маленьким PR. Это позволит показать роль/имя без ожидания `profiles` и не откатываться в generic fallback.

9. Нужно ли отделить "пользователь не вошёл" от "Supabase временно недоступен"?

Да. Это ключевая UX-проблема. Network/auth timeout не должен превращаться в "Не вошли".

10. Нужно ли показывать локальный режим даже без ответа Supabase?

Да. Если есть remembered auth или stored session, main UI + локальные TEMP должны показываться сразу, с offline notice и кнопкой refresh.

### Вариант A. Маленький hotfix

Рекомендуется отдельным PR:

- в начале `init()` применить `readStoredSupabaseSession()` или `readRememberedAuth()` и сразу вызвать `showApp(true)`;
- `loadProfile()` запускать после первого paint, с fallback profile;
- `loadMeasurements()` запускать после показа shell;
- если `getSession()`/profile/measurements падают network error, оставлять main UI и показывать offline notice;
- сохранять last known profile сразу после любого успешного profile fetch;
- добавить короткий статус "Загружаю данные..." в список замеров.

Риск: низкий/средний. Нужно аккуратно не показывать main UI, если точно нет remembered auth.

### Вариант B. Средний PR

Не внедрять без согласования:

- выделить `bootstrapLocalAuth()`;
- выделить `refreshRemoteAuth()`;
- выделить `refreshProfile()`;
- выделить `refreshMeasurements()`;
- ввести явные states: `auth: unknown/local/remote/none`, `network: online/offline/degraded`.

Риск: средний. Затрагивает startup и auth, нужна проверка на телефоне.

### Вариант C. Будущий рефакторинг

Не внедрять сейчас:

- `auth.js`;
- `offline-start.js`;
- `supabase-api.js`;
- `measurements-store.js`.

Риск: высокий для одного PR. Делать только после маленьких стабилизирующих PR.

## Этап 3. Мусорные файлы и чистка

Команды выполнены:

```bash
git status
find . -name ".DS_Store" -o -name "*.bak" -o -name "*.tmp" -o -name "*~"
find . -maxdepth 3 -type f | sort
git ls-files
```

Результат:

- `.DS_Store`, `*.bak`, `*.tmp`, `*~` не найдены;
- `node_modules`, `dist`, `build`, `coverage` в tracked files не найдены;
- явных временных Codex-файлов в репозитории нет;
- `svg-constructor/embedded.html`, иконки, PWA assets и docs выглядят рабочими, не удалять;
- `scheme-enhance.js`, `sizes-smart.js`, `scheme-sketch.js`, `details-enhance.js` требуют подтверждения владельца перед любой чисткой, потому что могут быть подключены косвенно или сохранены для совместимости.

Очевидный мусор для удаления не найден.

## Найденные проблемы

### Критичные

1. Healthcheck offline смотрел старый cache name.

Влияние: пользователь мог видеть "Офлайн-режим ещё не подготовлен" после успешного обновления service worker.

Статус: исправлено в этом PR.

2. Startup online всё ещё зависит от последовательного Supabase auth/profile.

Влияние: при медленной сети пользователь может видеть login/ожидание вместо локального рабочего shell.

Статус: не исправлялось, нужен отдельный auth bootstrap PR.

### Некритичные

1. Вкладка "Проверка" содержала тексты старого workflow "принять/принятие".

Статус: исправлено в этом PR.

2. Production mode имеет отдельный auth bootstrap и не является offline-first.

Статус: оставить как есть, если offline production не является требованием.

3. Документация `docs/architecture.md`, `docs/roles-and-access.md`, `docs/refactoring-plan.md` всё ещё описывает старый workflow принятия/проверки.

Статус: не правил в этом PR, чтобы не расширять scope. Можно сделать отдельный docs-only PR.

## Что исправлено

- `app.js`: `OFFLINE_SHELL_CACHE_NAME` обновлён до `tekstura-offline-shell-v16-app-shell`;
- `app.js`: тексты вкладки "Проверка" больше не говорят "Нельзя принять замер" и "блокирует принятие";
- `index.html`: cache-bust для `app.js` обновлён до `20260603-audit-healthcheck`;
- `service-worker.js`: `CACHE_VERSION` обновлён до `tekstura-offline-shell-v16`;
- `service-worker.js`: `APP_SHELL_URLS` и `REQUIRED_APP_SHELL_URLS` используют новый `app.js` query version.

## Проверки

Выполнить перед PR:

```bash
git diff --check
node --check app.js
node --check service-worker.js
```

Дополнительно локально проверено через Browser:

- загружается `./app.js?v=20260603-audit-healthcheck`;
- старых кнопок review/accept нет;
- старых workflow statuses в UI нет;
- критичных JS errors в локальном browser check не найдено.

## Что требует отдельного PR

1. Auth/offline startup hotfix по варианту A.
2. Docs-only обновление старых текстов про "принятие/проверку".
3. Отдельная ручная QA-задача на телефоне с реальным тестовым аккаунтом и тестовым замером.
4. Production auth/offline behavior, только если production mode должен открываться без сети.

## Что проверить на телефоне

Обязательно:

- Safari iPhone и Chrome Android;
- fresh install/first open;
- открыть online, нажать "Обновить" 2-3 раза;
- проверить "Технические действия -> Проверить офлайн-доступ";
- авиарежим: открыть приложение, создать TEMP, добавить фото, закрыть/открыть;
- online sync TEMP: проверить `measurements.status = "Готовый замер"`;
- открыть synced замер в основном preview и `production.html`;
- загрузить/удалить online-фото;
- проверить корзину только на тестовом замере.
