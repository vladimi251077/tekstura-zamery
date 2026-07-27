# Безопасное удаление и защита локальных данных

## Единый контракт

`deletion-safety.js` — единственное место, которое классифицирует замер перед удалением:

- `SAFE_TO_DELETE` — удалённый замер подтверждён, локальных изменений и фото нет;
- `REQUIRES_CONFIRMATION` — удалённый замер подтверждён, синхронизированные фото не создают ложную блокировку, но пользователь видит обычное подтверждение;
- `BLOCKED_UNTIL_SYNC_OR_EXPORT` — есть данные, которые нельзя терять без синхронизации или локальной резервной копии.

Защищёнными считаются TEMP без подтверждённого server mapping, `pending`, активный
`syncing`, retryable `sync_error`/`error`, несохранённая форма, выбранные и ещё не
сохранённые фото, локальный `Blob`/`File`, несинхронизированное фото и активная
локальная операция.

Наличие `id`, Storage path или старта операции само по себе не считается доказательством
синхронизации. Для фото нужны согласованные remote identity, measurement ownership,
Storage path и отсутствие локального бинарного файла без подтверждения.

## Пользовательский поток

Обычный синхронизированный замер удаляется после одного русского подтверждения с
описанием состава, количества несинхронизированных фото, состояния синхронизации и
возможности восстановления.

Для защищённого замера немедленное удаление остановлено. Пользователь должен:

1. согласиться сохранить резервную JSON-копию;
2. отдельно сохранить локальные фото, если они нужны (бинарные файлы не встраиваются в JSON);
3. ввести точную фразу `УДАЛИТЬ БЕЗ ВОССТАНОВЛЕНИЯ`.

Backup содержит поля замера, client/form metadata, `drawing_project_json`,
`finish_dimensions_json` и неизменённое сохранённое `drawing_svg`. Он не содержит
пароли, credentials, auth tokens, signed URLs или фото binaries. Функция восстановления
input-данных протестирована; импорт через UI в этой фазе не добавлялся. Кнопка
«Скачать JSON» использует тот же безопасный формат и доступна до начала удаления.

## Проверенные destructive/data-loss paths

- soft delete в корзину, permanent delete, bulk delete и очистка корзины проходят через контракт;
- локальный draft удаляется только после safety authorization; прямой вызов IndexedDB API без него отклоняется;
- удаление локального фото одной IndexedDB-транзакцией сначала отменяет связанную очередь и проверяет draft ownership;
- server photo повторно читается по текущему measurement, а Storage object удаляется только при единственной согласованной DB-ссылке и корректном photo-path ownership;
- cross-measurement и ambiguous Storage ownership останавливаются до удаления;
- клиент удаляется только после повторной server-проверки отсутствия замеров;
- logout, открытие/создание другого замера, reload и navigation предупреждают только при защищённом состоянии;
- `pagehide` и `beforeunload` запускают сохранение открытого TEMP, но браузер не гарантирует завершение async IndexedDB при аварийном закрытии;
- service-worker update меняет только app-shell cache, не очищает IndexedDB и не перезагружает страницу автоматически;
- diagnostics удаляет только versioned app-shell caches, не measurement data;
- IndexedDB upgrade создаёт недостающие stores и не выполняет cleanup/migration удаления;
- прямой browser/site-data clear невозможно перехватить приложением, поэтому boot UI явно запрещает очистку до sync/export;
- production view не редактирует и не хранит локальные drafts, поэтому его logout не создаёт ложного предупреждения.

## Ограничения

JSON не является резервной копией локальных photo binaries. До подтверждённой загрузки
в Storage эти файлы требуется сохранить отдельно. Приложение не утверждает, что данные
синхронизированы, пока нет completion evidence.

Изменений схемы Supabase, RLS, Auth, Storage policies, production config и SVG runtime
в этой работе нет. `drawing-bridge.js` не изменялся.

## Детерминированные проверки

`node --test` покрывает clean/TEMP/pending/syncing/retryable-error states,
unsynced/synced photos, cross-measurement/ambiguous ownership, dirty/clean navigation,
secret-free backup и round-trip SVG inputs. Существующие photo reopen, stale-sync и
SVG regression suites запускаются тем же вызовом.
