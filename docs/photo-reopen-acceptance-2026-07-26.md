# Photo reopen compatibility — isolated acceptance

Дата проверки: 2026-07-26

Проверенная база: `main` после merge PR #88 (`decbd7e`)

## Результат

Статус: **PASS**.

На существующем owner-approved self-hosted Supabase staging выполнен полный изолированный сценарий:

```text
TEMP-001
→ одно synthetic фото
→ sync measurement + photo
→ reload/reopen editor
→ production view
→ signed URL
→ SVG save/reopen
→ полный cleanup
```

Cloud Supabase, production configuration, реальные клиенты, `tekstura.shop`, рабочий сайт и
tracked SVG runtime не изменялись.

## Изоляция

- target: `tekstura-supabase-staging` на `homelab`;
- gateway оставался только на `127.0.0.1:18000`;
- браузер подключался через временный SSH loopback tunnel;
- приложение запускалось из временной локальной копии;
- временная копия использовала private bucket `zamery-measurement-photos-test`;
- создан один marked test Auth user;
- создан ровно один synthetic client, measurement, photo row и Storage object;
- production URL/key в tracked `app.js` и `production.js` не менялись;
- публичный Supabase ingress не создавался.

## Acceptance evidence

Synthetic measurement:

- number: `KZN-ZM-2026-998680`;
- id: `94e69ead-8e33-4ed9-bcf3-6bcdb76f4a39`;
- photo path:
  `measurements/94e69ead-8e33-4ed9-bcf3-6bcdb76f4a39/photo_local_9bc4e9fa-7493-416a-8134-d4b6c3a53bcc.jpg`.

| Проверка | Результат |
|---|---|
| TEMP measurement создан | PASS |
| Ровно одно TEMP фото добавлено | PASS |
| TEMP measurement синхронизирован | PASS |
| TEMP photo sync | `1 из 1` |
| Pending/syncing после завершения | нет |
| Server client / measurement / photo row / object | `1 / 1 / 1 / 1` |
| Editor photo после reload/reopen | PASS, одна карточка |
| Editor image | PASS, `192×192` |
| Production photo | PASS, одна карточка |
| Production image | PASS, `192×192` |
| Signed URL | PASS, HTTP 200 `image/jpeg` |
| Duplicate photo entries | нет |
| Cross-measurement leakage | нет; isolated dataset содержал один measurement/row/object |
| Editor SVG после второго reopen | PASS, 111 элементов, `viewBox="0 0 1100 760"` |
| Production SVG после reload | PASS, 111 элементов, `viewBox="0 0 1100 760"` |

Первый production open корректно показал пустой `drawing_svg`, потому что TEMP был синхронизирован
до первого открытия вкладки размеров. После штатных drawing Save и form Save второй reopen в editor
и production отрисовал сохранённый SVG. Исходники renderer, формулы, размерные линии, labels,
scaling, redraw, print и export не менялись.

## Auth prerequisite

Self-hosted staging изначально вернул `email_provider_disabled`. Для единственного approved test
user был временно включён только staging email/password provider:

- restricted env предварительно сохранён с mode `0600`;
- пересоздан только staging Auth container;
- остальные container identities не изменились;
- browser signup оставался disabled;
- после acceptance исходный env восстановлен byte-for-byte;
- Auth пересоздан, provider снова disabled, все services healthy.

## Cleanup

Удалены только записанные synthetic identifiers:

1. локальная TEMP-копия и локальное фото;
2. один Storage object через Storage API;
3. private test bucket после подтверждения zero objects;
4. четыре временные Zamery tables и `zamery_test_%` policies guarded SQL cleanup;
5. один marked Auth user;
6. временная app copy и credentials;
7. локальный HTTP server, SSH tunnel и browser tabs.

Финальная проверка:

- Zamery test tables: 0;
- Zamery policies: 0;
- marked Auth users: 0;
- test buckets/objects: 0/0;
- исходные website tables: 8;
- `project-photos-staging`: сохранён;
- staging services: 10 healthy, 0 unhealthy, 0 restarts;
- gateway: loopback-only;
- `tekstura.shop` и `/calculator`: HTTP 200;
- real customer data touched: no;
- tracked SVG runtime changed: no.

## Решение

Photo reopen compatibility PR #88 принят для TEMP sync path
`measurements/<measurement-id>/...` в main editor и production view.

Следующая безопасная задача: отдельный focused PR для recovery measurement-level stale `syncing`
и idempotency design без SVG изменений.
