#!/usr/bin/env python3
"""Apply photo + PWA file repair via the previously copied OFFLINE bundle.

Default: read-only. The --apply flag is required to change homelab files.
All source snapshots are local; GitHub/DNS is not required on homelab.
"""
import argparse
import base64
import datetime
import difflib
import os
from pathlib import Path
import runpy
import shutil
import subprocess
import sys
import tempfile

DEFAULT_BUNDLE = Path("/tmp/photo-fix-offline-bundle.py")
DEFAULT_ROOT = Path("/home/vladimir/zamery-production-20261007/frontend-public")
WEB_FILES = ("app.js", "production.js", "index.html", "production.html", "service-worker.js")
REQUIRED_PRESENT = ("offline-db.js", "manifest.webmanifest", "vendor/supabase-js.js",
                    "styles.css", "photo-path.js", "sync-state.js",
                    "deletion-safety.js", "icon-192.png")
EXTRA_TEXT = {"offline-fallback.html":"<!doctype html>\n<html lang=\"ru\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n    <meta name=\"theme-color\" content=\"#f6f1e8\" />\n    <title>Tekstura Замеры — офлайн</title>\n    <style>\n      :root { color-scheme: light; font-family: system-ui, sans-serif; }\n      body {\n        min-height: 100vh;\n        margin: 0;\n        display: grid;\n        place-items: center;\n        background: #f6f1e8;\n        color: #26231f;\n      }\n      main {\n        width: min(34rem, calc(100% - 2rem));\n        padding: 2rem;\n        border: 1px solid #d8cfc2;\n        border-radius: 1rem;\n        background: #fffdf9;\n        box-sizing: border-box;\n      }\n      h1 { margin-top: 0; font-size: 1.5rem; }\n      p { line-height: 1.5; }\n      a { color: inherit; font-weight: 700; }\n    </style>\n  </head>\n  <body>\n    <main>\n      <h1>Нет подключения к интернету</h1>\n      <p>Если приложение уже открывалось на этом устройстве, вернитесь на главный экран: локальный TEMP-черновик и фото останутся в памяти телефона.</p>\n      <p>Не очищайте данные сайта до успешной синхронизации или экспорта резервной копии.</p>\n      <p><a href=\"/\">Вернуться в приложение</a></p>\n    </main>\n  </body>\n</html>\n","offline-diagnostics.html":"<!doctype html>\n<html lang=\"ru\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>Tekstura offline diagnostics</title>\n    <style>\n      :root {\n        color: #111827;\n        background: #f8fafc;\n        font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif;\n      }\n      body {\n        margin: 0;\n        padding: 18px;\n      }\n      h1 {\n        color: #071a49;\n        font-size: 24px;\n        margin: 0 0 6px;\n      }\n      p {\n        margin: 6px 0 14px;\n      }\n      .actions {\n        display: grid;\n        gap: 8px;\n        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));\n        margin: 14px 0;\n      }\n      button {\n        background: #2563eb;\n        border: 0;\n        border-radius: 8px;\n        color: #fff;\n        font-size: 14px;\n        font-weight: 700;\n        padding: 11px 12px;\n      }\n      button.secondary {\n        background: #e5e7eb;\n        color: #111827;\n      }\n      .panel {\n        background: #fff;\n        border: 1px solid #d1d5db;\n        border-radius: 8px;\n        margin-top: 12px;\n        padding: 12px;\n      }\n      .ok { color: #047857; font-weight: 700; }\n      .bad { color: #b91c1c; font-weight: 700; }\n      .muted { color: #6b7280; }\n      pre {\n        background: #111827;\n        border-radius: 8px;\n        color: #f9fafb;\n        font-size: 12px;\n        line-height: 1.45;\n        overflow: auto;\n        padding: 12px;\n        white-space: pre-wrap;\n      }\n      table {\n        border-collapse: collapse;\n        font-size: 13px;\n        width: 100%;\n      }\n      td, th {\n        border-bottom: 1px solid #e5e7eb;\n        padding: 7px 5px;\n        text-align: left;\n        vertical-align: top;\n      }\n    </style>\n  </head>\n  <body>\n    <h1>Tekstura offline diagnostics</h1>\n    <p class=\"muted\">Эта страница не подключает app.js, Supabase или styles.css.</p>\n\n    <div class=\"actions\">\n      <button id=\"check-cache-btn\" type=\"button\">Проверить кэш</button>\n      <button id=\"update-sw-btn\" type=\"button\">Обновить service worker</button>\n      <button id=\"clear-shell-btn\" class=\"secondary\" type=\"button\">Очистить только app-shell cache</button>\n      <button id=\"copy-report-btn\" class=\"secondary\" type=\"button\">Скопировать отчёт</button>\n    </div>\n\n    <div id=\"summary\" class=\"panel\">Готовлю отчёт...</div>\n    <div class=\"panel\">\n      <h2>Проверяемые ключи</h2>\n      <div id=\"cache-table\"></div>\n    </div>\n    <div class=\"panel\">\n      <h2>Первые 100 ключей app-shell cache</h2>\n      <pre id=\"cache-keys\">нет данных</pre>\n    </div>\n    <div class=\"panel\">\n      <h2>Полный отчёт</h2>\n      <pre id=\"report\">нет данных</pre>\n    </div>\n\n    <script>\n      (function() {\n        var EXPECTED_CACHE = \"tekstura-offline-shell-v40-app-shell\";\n        var APP_JS_QUERY = \"20260802-supabase-cutover\";\n        var CHECK_KEYS = [\n          \"/\",\n          \"./\",\n          \"/index.html\",\n          \"./index.html\",\n          \"/app.js?v=\" + APP_JS_QUERY,\n          \"./app.js?v=\" + APP_JS_QUERY,\n          \"/vendor/supabase-js.js\",\n          \"./vendor/supabase-js.js\",\n          \"/offline-fallback.html\",\n          \"./offline-fallback.html\",\n          \"/sw-precache-report.json\",\n          \"./sw-precache-report.json\",\n          \"/offline-diagnostics.html\",\n          \"./offline-diagnostics.html\"\n        ];\n        var lastReportText = \"\";\n        var registrationResult = {\n          attempted: false,\n          ok: false,\n          scope: \"\",\n          error: \"\"\n        };\n\n        function text(value) {\n          if (value === true) return \"да\";\n          if (value === false) return \"нет\";\n          if (value === undefined || value === null || value === \"\") return \"нет\";\n          return String(value);\n        }\n\n        function stateOf(worker) {\n          return worker ? worker.state : \"нет\";\n        }\n\n        async function readAppJsConstants() {\n          try {\n            var response = await fetch(\"./app.js?v=\" + APP_JS_QUERY, { cache: \"no-store\" });\n            var source = await response.text();\n            return {\n              ok: response.ok,\n              status: response.status,\n              cacheName: (source.match(/OFFLINE_SHELL_CACHE_NAME\\s*=\\s*\"([^\"]+)\"/) || [])[1] || \"не найдено\",\n              version: (source.match(/TEKSTURA_APP_JS_VERSION\\s*=\\s*\"([^\"]+)\"/) || [])[1] || \"не найдено\"\n            };\n          } catch (error) {\n            return {\n              ok: false,\n              status: \"ошибка\",\n              cacheName: \"не прочитан\",\n              version: \"не прочитан\",\n              error: error && error.message ? error.message : String(error)\n            };\n          }\n        }\n\n        async function registerServiceWorker() {\n          if (!(\"serviceWorker\" in navigator)) {\n            registrationResult = {\n              attempted: false,\n              ok: false,\n              scope: \"\",\n              error: \"serviceWorker не поддерживается\"\n            };\n            return null;\n          }\n          if (!window.isSecureContext) {\n            registrationResult = {\n              attempted: false,\n              ok: false,\n              scope: \"\",\n              error: \"страница не в secure context\"\n            };\n            return null;\n          }\n          registrationResult.attempted = true;\n          try {\n            var registration = await navigator.serviceWorker.register(\"./service-worker.js\");\n            registrationResult.ok = true;\n            registrationResult.scope = registration.scope || \"\";\n            registrationResult.error = \"\";\n            await registration.update();\n            return registration;\n          } catch (error) {\n            registrationResult.ok = false;\n            registrationResult.error = error && error.message ? error.message : String(error);\n            return null;\n          }\n        }\n\n        function renderTable(rows) {\n          var html = \"<table><thead><tr><th>Ключ</th><th>Expected cache</th><th>Любой app-shell cache</th></tr></thead><tbody>\";\n          rows.forEach(function(row) {\n            html += \"<tr><td><code>\" + row.key + \"</code></td><td class=\\\"\" + (row.expected ? \"ok\" : \"bad\") + \"\\\">\" + text(row.expected) + \"</td><td>\" + (row.anyCache || \"нет\") + \"</td></tr>\";\n          });\n          html += \"</tbody></table>\";\n          document.getElementById(\"cache-table\").innerHTML = html;\n        }\n\n        async function matchAnyCache(cacheNames, key) {\n          for (var index = 0; index < cacheNames.length; index += 1) {\n            var cacheName = cacheNames[index];\n            var cache = await caches.open(cacheName);\n            if (await cache.match(key, { ignoreSearch: true })) return cacheName;\n          }\n          return \"\";\n        }\n\n        async function buildReport() {\n          var swSupported = \"serviceWorker\" in navigator;\n          var registration = swSupported ? await navigator.serviceWorker.getRegistration() : null;\n          var cacheNames = \"caches\" in window ? await caches.keys() : [];\n          var appShellCacheNames = cacheNames.filter(function(name) {\n            return name.indexOf(\"tekstura-offline-shell-\") === 0;\n          });\n          var appJsConstants = await readAppJsConstants();\n          var expectedCache = \"caches\" in window ? await caches.open(EXPECTED_CACHE) : null;\n          var checked = [];\n\n          for (var index = 0; index < CHECK_KEYS.length; index += 1) {\n            var key = CHECK_KEYS[index];\n            var expected = expectedCache ? Boolean(await expectedCache.match(key, { ignoreSearch: true })) : false;\n            var anyCache = \"caches\" in window ? await matchAnyCache(appShellCacheNames, key) : \"\";\n            checked.push({ key: key, expected: expected, anyCache: anyCache });\n          }\n\n          var firstKeys = [];\n          var precacheReport = null;\n          if (expectedCache) {\n            var requests = await expectedCache.keys();\n            firstKeys = requests.slice(0, 100).map(function(request) { return request.url; });\n            var precacheResponse = await expectedCache.match(\"/sw-precache-report.json\", { ignoreSearch: true });\n            if (precacheResponse) {\n              try {\n                precacheReport = await precacheResponse.json();\n              } catch (error) {\n                precacheReport = { parseError: error && error.message ? error.message : String(error) };\n              }\n            }\n          }\n\n          return {\n            generatedAt: new Date().toISOString(),\n            expectedCacheName: EXPECTED_CACHE,\n            appJsQuery: APP_JS_QUERY,\n            appJsConstants: appJsConstants,\n            locationHref: location.href,\n            locationOrigin: location.origin,\n            navigatorOnline: navigator.onLine,\n            serviceWorkerSupported: swSupported,\n            registrationAttempted: registrationResult.attempted,\n            registrationOk: registrationResult.ok,\n            registrationError: registrationResult.error,\n            pageControlled: Boolean(navigator.serviceWorker && navigator.serviceWorker.controller),\n            registrationScope: registration ? registration.scope : \"\",\n            activeState: registration ? stateOf(registration.active) : \"нет\",\n            waitingState: registration ? stateOf(registration.waiting) : \"нет\",\n            installingState: registration ? stateOf(registration.installing) : \"нет\",\n            cacheNames: cacheNames,\n            appShellCacheNames: appShellCacheNames,\n            precacheReport: precacheReport,\n            checkedKeys: checked,\n            first100AppShellKeys: firstKeys\n          };\n        }\n\n        function renderReport(report) {\n          var missing = report.checkedKeys.filter(function(row) { return !row.expected; }).length;\n          var precacheSummary = report.precacheReport\n            ? \"ok=\" + (report.precacheReport.ok ? report.precacheReport.ok.length : 0) + \" · missing=\" + (report.precacheReport.missing ? report.precacheReport.missing.length : 0) + \" · errors=\" + (report.precacheReport.errors ? report.precacheReport.errors.length : 0)\n            : \"нет\";\n          document.getElementById(\"summary\").innerHTML =\n            \"<p><b>Expected cache:</b> \" + report.expectedCacheName + \"</p>\" +\n            \"<p><b>app.js:</b> query=\" + report.appJsQuery + \" · version=\" + report.appJsConstants.version + \" · expectedCache=\" + report.appJsConstants.cacheName + \"</p>\" +\n            \"<p><b>Location:</b> \" + report.locationHref + \"</p>\" +\n            \"<p><b>Online:</b> \" + text(report.navigatorOnline) + \" · <b>Service worker:</b> \" + text(report.serviceWorkerSupported) + \" · <b>Controlled:</b> \" + text(report.pageControlled) + \"</p>\" +\n            \"<p><b>Registration:</b> attempted=\" + text(report.registrationAttempted) + \" · ok=\" + text(report.registrationOk) + (report.registrationError ? \" · error=\" + report.registrationError : \"\") + \"</p>\" +\n            \"<p><b>Scope:</b> \" + (report.registrationScope || \"нет\") + \"</p>\" +\n            \"<p><b>SW states:</b> active=\" + report.activeState + \" · waiting=\" + report.waitingState + \" · installing=\" + report.installingState + \"</p>\" +\n            \"<p><b>Precache report:</b> \" + precacheSummary + \"</p>\" +\n            \"<p><b>Missing expected keys:</b> <span class=\\\"\" + (missing ? \"bad\" : \"ok\") + \"\\\">\" + missing + \"</span></p>\";\n          renderTable(report.checkedKeys);\n          document.getElementById(\"cache-keys\").textContent = report.first100AppShellKeys.length ? report.first100AppShellKeys.join(\"\\n\") : \"нет ключей\";\n          lastReportText = JSON.stringify(report, null, 2);\n          document.getElementById(\"report\").textContent = lastReportText;\n        }\n\n        async function checkCache() {\n          try {\n            renderReport(await buildReport());\n          } catch (error) {\n            lastReportText = \"Ошибка диагностики: \" + (error && error.message ? error.message : String(error));\n            document.getElementById(\"summary\").innerHTML = \"<span class=\\\"bad\\\">\" + lastReportText + \"</span>\";\n            document.getElementById(\"report\").textContent = lastReportText;\n          }\n        }\n\n        async function updateServiceWorker() {\n          var registration = \"serviceWorker\" in navigator ? await navigator.serviceWorker.getRegistration() : null;\n          if (!registration) {\n            registration = await registerServiceWorker();\n          }\n          if (!registration) {\n            await checkCache();\n            return;\n          }\n          await registration.update();\n          await checkCache();\n        }\n\n        async function clearShellCache() {\n          if (!(\"caches\" in window)) return;\n          var names = await caches.keys();\n          var shellNames = names.filter(function(name) {\n            return name.indexOf(\"tekstura-offline-shell-\") === 0;\n          });\n          await Promise.all(shellNames.map(function(name) { return caches.delete(name); }));\n          await checkCache();\n        }\n\n        async function copyReport() {\n          if (!lastReportText) await checkCache();\n          if (navigator.clipboard && navigator.clipboard.writeText) {\n            await navigator.clipboard.writeText(lastReportText);\n            return;\n          }\n          var textarea = document.createElement(\"textarea\");\n          textarea.value = lastReportText;\n          document.body.appendChild(textarea);\n          textarea.select();\n          document.execCommand(\"copy\");\n          textarea.remove();\n        }\n\n        document.getElementById(\"check-cache-btn\").addEventListener(\"click\", checkCache);\n        document.getElementById(\"update-sw-btn\").addEventListener(\"click\", function() {\n          updateServiceWorker().catch(function(error) {\n            document.getElementById(\"summary\").innerHTML = \"<span class=\\\"bad\\\">Не удалось обновить service worker: \" + (error && error.message ? error.message : String(error)) + \"</span>\";\n          });\n        });\n        document.getElementById(\"clear-shell-btn\").addEventListener(\"click\", function() {\n          clearShellCache().catch(function(error) {\n            document.getElementById(\"summary\").innerHTML = \"<span class=\\\"bad\\\">Не удалось очистить app-shell cache: \" + (error && error.message ? error.message : String(error)) + \"</span>\";\n          });\n        });\n        document.getElementById(\"copy-report-btn\").addEventListener(\"click\", function() {\n          copyReport().catch(function(error) {\n            document.getElementById(\"summary\").innerHTML = \"<span class=\\\"bad\\\">Не удалось скопировать отчёт: \" + (error && error.message ? error.message : String(error)) + \"</span>\";\n          });\n        });\n\n        registerServiceWorker().then(checkCache);\n      })();\n    </script>\n  </body>\n</html>\n","offline-test.html":"<!doctype html>\n<html lang=\"ru\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>Tekstura offline test</title>\n    <meta name=\"robots\" content=\"noindex,nofollow\" />\n    <meta name=\"theme-color\" content=\"#071a49\" />\n    <style>\n      body {\n        margin: 0;\n        min-height: 100vh;\n        display: grid;\n        place-items: center;\n        font-family: system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif;\n        background: #f3f6fb;\n        color: #071a49;\n      }\n\n      main {\n        max-width: 560px;\n        padding: 32px;\n      }\n    </style>\n  </head>\n  <body>\n    <main>\n      <h1>Tekstura offline test</h1>\n      <p>Если эта страница открылась в авиарежиме, service worker cache работает.</p>\n    </main>\n  </body>\n</html>\n"}
EXTRA_ICON_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAIAAAB7GkOtAAAIE0lEQVR4nO3dsW1TYRRA4QRZimeIF2EBhGKJMuloIgaAFTIADEAZqlBGshSFAbKId3BJiShQiLD5/d75vgGsm+roWvePT8/OL04A6Hk1egAAxhAAgCgBAIgSAIAoAQCIEgCAKAEAiBIAgCgBAIgSAIAoAQCIEgCAKAEAiBIAgCgBAIgSAIAoAQCIEgCAKAEAiBIAgCgBAIgSAIAoAQCIEgCAKAEAiBIAgCgBAIgSAIAoAQCIEgCAKAEAiBIAgCgBAIgSAIAoAQCIEgCAKAEAiBIAgCgBAIgSAIAoAQCIEgCAKAEAiBIAgCgBAIgSAIAoAQCIEgCAKAEAiBIAgCgBAIgSAIAoAQCIEgCAKAEAiBIAgCgBAIgSAIAoAQCIEgCAKAEAiBIAgCgBAIgSAIAoAQCIEgCAKAEAiBIAgCgBAIgSAIAoAQCIEgCAKAEAiBIAgCgBAIgSAIAoAQCIEgCAKAEAiBIAgCgBAIgSAIAoAQCIEgCAKAEAiBIAgCgBAIgSAIAoAQCIWowegLT3V2++fvk0eoqRvn3/8eHj59FTEGUDAIiyAcC07bab0SMc0HK1Hj3CnNkAAKIEACBKAACiBAAgSgAAogQAIEoAAKK8A4B5mtYF/bxfMxwtGwBAlAAARAkAQJQAAEQJAECUAABECQBAlHcAjHR793h793igD9/Xz43dPzxdXt/8++fAsbEBAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQtRg8AHMRuuxk9AsfOBgAQJQAAUQIAECUAAFECABAlAABRzkDhGe/evnZSySwJAEzecrUePQKT5CsggCgBAIgSAIAoAQCIEgCAKAEAiHIGCs+4f3i6vL4ZPcXJif/wzL7ZAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAok7Pzi9GzwAH96c3tNP6KZV5/BUcDxsAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBA1GL0ADDSbrsZPQIMYwMAiBIAgCgBAIgSAIAoAQCIEgCAKGeg/OImElIEgIrlaj16BDguvgICiBIAgCgBAIgSAIAoAQCIEgCAKGegPG9aB5ReM8BfsgEARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQtRg/ABOy2m9EjAPtnAwCIEgCAKAEAiBIAgCgBAIgSAIAoZ6Av5iYSmAcB4DfL1Xr0CMB/4isggCgBAIgSAIAoAQCIEgCAKAEAiHIGujfTOqD0mgGwAQBECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARAkAQJQAAEQJAECUAABECQBAlAAARC1GDzAfu+1m9AgAL2ADAIgSAIAoAQCIEgCAKAEAiBIAgCgBAIg6PTu/GD0DAAPYAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACBKAACiBAAgSgAAogQAIEoAAKIEACDqJySaQYaDsmpLAAAAAElFTkSuQmCC"

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", type=Path, default=DEFAULT_BUNDLE)
    parser.add_argument("--dir", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--apply", action="store_true",
                        help="backup and apply only after all preflight checks")
    args = parser.parse_args()
    root = args.dir.resolve()
    bundle_path = args.bundle.resolve()
    if not root.is_dir():
        raise RuntimeError("Web folder does not exist: " + str(root))
    if not bundle_path.is_file():
        raise RuntimeError("Old offline bundle not found: " + str(bundle_path))
    if not shutil.which("git"):
        raise RuntimeError("git is needed to merge local modifications safely")
    for name in REQUIRED_PRESENT:
        if not (root / name).is_file():
            raise RuntimeError("Required frontend file missing: " + name)
    for name in WEB_FILES:
        if name != "service-worker.js" and not (root / name).is_file():
            raise RuntimeError("Important application file missing: " + name)
    for name in WEB_FILES + tuple(EXTRA_TEXT) + ("icon-512.png",):
        p = root / name
        if p.is_symlink():
            raise RuntimeError("Refusing symlink: " + str(p))
    bundle = runpy.run_path(str(bundle_path), run_name="_photo_source_bundle_")
    print("Mode:", "APPLY WITH BACKUP" if args.apply else "CHECK ONLY; NO CHANGES")
    print("Web directory:", root)
    print("Existing service-worker.js:", (root / "service-worker.js").is_file())

    old_bytes = {}
    updates = {}
    merged = {}
    with tempfile.TemporaryDirectory(prefix="tekstura-safe-photo-") as td:
        temp = Path(td)
        for name in WEB_FILES:
            p = root / name
            old_bytes[name] = p.read_bytes() if p.exists() else None
            if old_bytes[name] is None and name == "service-worker.js":
                # The missing service worker can be restored from the embedded fixed snapshot.
                data = bundle["FIX_FILES"][name]
                merged[name] = bundle["cache_version"](data, name)
            else:
                current = old_bytes[name].decode("utf-8")
                merged[name] = bundle["make_merged"](name, current, temp)
            updates[name] = merged[name].encode("utf-8")
            change = "NEW" if old_bytes[name] is None else "MERGE"
            print(change + ":", name)
        original_text = {
            name: old_bytes[name].decode("utf-8") for name in ("app.js", "production.js")
        }
        bundle["verify"](merged, original_text)

        for name in ("app.js", "production.js", "service-worker.js"):
            script = temp / ("check-" + name)
            script.write_text(merged[name], encoding="utf-8")
            node = shutil.which("node")
            if node:
                check = subprocess.run([node, "--check", str(script)],
                                       capture_output=True, text=True)
                if check.returncode:
                    raise RuntimeError("JS syntax error in " + name + ": " + check.stderr[-400:])
            elif args.apply:
                raise RuntimeError("Node.js required for syntax checks before APPLY")
        if not shutil.which("node"):
            print("WARNING: node missing; JS syntax was not verified")

        for name, data in EXTRA_TEXT.items():
            p = root / name
            old_bytes[name] = p.read_bytes() if p.exists() else None
            if old_bytes[name] is None:
                updates[name] = data.encode("utf-8")
                print("NEW:", name)
            else:
                print("KEEP existing:", name)

        name = "icon-512.png"
        p = root / name
        old_bytes[name] = p.read_bytes() if p.exists() else None
        if old_bytes[name] is None:
            icon = base64.b64decode(EXTRA_ICON_BASE64)
            if not icon.startswith(b"\x89PNG\r\n\x1a\n"):
                raise RuntimeError("Embedded icon is not a valid PNG header")
            updates[name] = icon
            print("NEW:", name)
        else:
            print("KEEP existing:", name)

        # Verify all missing PWA assets will be available after installation.
        for name in ("service-worker.js", "offline-fallback.html",
                     "offline-diagnostics.html", "offline-test.html", "icon-512.png"):
            if old_bytes[name] is None and name not in updates:
                raise RuntimeError("Missing required asset not repaired: " + name)

        total = sum(1 for name, data in updates.items() if data != old_bytes.get(name))
        print("Ready to update/create", total, "files.")
        if not args.apply:
            print("CHECK PASSED; NO WORKING FILES MODIFIED")
            return

        timestamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = root.parent / "photo-fix-backups" / timestamp
        backup.mkdir(parents=True, exist_ok=False)
        for name, old in old_bytes.items():
            if old is not None:
                dest = backup / name
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(root / name, dest)
        print("BACKUP CREATED:", backup)
        changed = []
        try:
            for name, data in updates.items():
                if data == old_bytes.get(name):
                    continue
                dst = root / name
                dst.parent.mkdir(parents=True, exist_ok=True)
                fd, staging = tempfile.mkstemp(prefix=".photo-pwa-", dir=dst.parent)
                try:
                    with os.fdopen(fd, "wb") as stream:
                        stream.write(data)
                    if old_bytes[name] is not None:
                        shutil.copymode(dst, staging)
                    else:
                        os.chmod(staging, 0o644)
                    os.replace(staging, dst)
                finally:
                    if os.path.exists(staging):
                        os.unlink(staging)
                changed.append(name)
        except BaseException:
            for name in reversed(changed):
                dst = root / name
                if old_bytes[name] is None:
                    dst.unlink(missing_ok=True)
                else:
                    shutil.copy2(backup / name, dst)
            raise
        print("APPLIED:", ", ".join(changed))
        print("ROLLBACK BACKUP:", backup)
        print("Do NOT clear website storage/IndexedDB. Test images and offline creation separately.")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("SAFE STOP:", exc, file=sys.stderr)
        sys.exit(1)
