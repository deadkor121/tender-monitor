# 🚀 Оптимизация развертывания на Render

## Проблема: Exit Code 143

**Симптомы:**
- Развертывание падает с ошибкой "Exited with status 143"
- Процесс сборки занимает 5-10+ минут
- Превышается лимит времени бесплатного плана

**Причина:**
```
Exit code 143 = SIGTERM (принудительное завершение процесса)
```

На бесплатном плане Render:
- ⏰ Лимит времени сборки: ~10-15 минут
- 💾 Лимит памяти: 512MB
- Установка `puppeteer` + Chrome занимает 5-10 минут
- Chrome binary весит ~300MB+

## ✅ Решение: puppeteer-core + @sparticuz/chromium

### Что изменено:

#### 1. **package.json**
```json
// ❌ БЫЛО (медленно, 300MB+)
"puppeteer": "^21.6.0"

// ✅ СТАЛО (быстро, ~50MB)
"puppeteer-core": "^21.6.0",
"@sparticuz/chromium": "^131.0.0",
"devDependencies": {
  "puppeteer": "^21.6.0"  // только для локальной разработки
}
```

#### 2. **render.yaml**
```yaml
# ❌ БЫЛО (долгая установка Chrome)
buildCommand: |
  npm install
  npx puppeteer browsers install chrome

# ✅ СТАЛО (только зависимости)
buildCommand: npm install --omit=dev
```

#### 3. **Скраперы** (anbudScraper.js, doffinScraper.js, mercellScraper.js)

Добавлена функция `getBrowserConfig()`:

```javascript
async function getBrowserConfig() {
  if (process.env.NODE_ENV === 'production') {
    // На Render используем легковесный Chromium
    const chromium = require('@sparticuz/chromium');
    return {
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    };
  } else {
    // Локально используем установленный Chrome
    const puppeteerLocal = require('puppeteer');
    return {
      executablePath: puppeteerLocal.executablePath(),
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: 'new'
    };
  }
}

// Использование в init()
async init() {
  const config = await getBrowserConfig();
  this.browser = await puppeteer.launch(config);
  // ...
}
```

## 📊 Сравнение

| Характеристика | Puppeteer | puppeteer-core + chromium |
|----------------|-----------|---------------------------|
| Время установки | 5-10 мин | 1-2 мин |
| Размер | ~300MB | ~50MB |
| Совместимость с Render Free | ⚠️ Часто таймаут | ✅ Работает стабильно |
| Локальная разработка | ✅ Работает | ✅ Работает |

## 🎯 Как это работает

1. **На Render (production):**
   - `NODE_ENV=production`
   - Используется `@sparticuz/chromium` (легковесный Chrome для AWS Lambda/Render)
   - Автоматически скачивается оптимизированный binary (~50MB)

2. **Локально (development):**
   - `NODE_ENV` не установлен или `development`
   - Используется полный `puppeteer` из devDependencies
   - Использует локально установленный Chrome

## 🔧 Установка зависимостей

### Для локальной разработки:
```bash
npm install
```

### Для production (Render):
```bash
npm install --omit=dev
```

## ✅ Что делать дальше

1. **Закоммитьте изменения:**
```bash
git add .
git commit -m "Fix Render deployment: optimize Puppeteer, use chromium"
git push origin main
```

2. **Очистите кеш на Render:**
   - Перейдите в Dashboard → Ваш сервис
   - Manual Deploy → Clear build cache & deploy

3. **Подождите 2-3 минуты** - развертывание должно пройти успешно!

## 🐛 Отладка

### Если все еще ошибка Exit 143:

1. **Проверьте логи сборки:**
   - Какой шаг занимает больше всего времени?
   - Есть ли ошибки памяти?

2. **Проверьте переменные окружения:**
```
NODE_ENV=production  ✅ Должна быть установлена
```

3. **Убедитесь, что изменения применились:**
```bash
# Проверьте package.json
cat package.json | grep puppeteer-core

# Проверьте render.yaml  
cat render.yaml | grep buildCommand
```

### Полезные команды для отладки на Render:

В Shell на Render можно проверить:
```bash
# Версия Node
node --version

# Установленные пакеты
npm list --depth=0

# Переменные окружения
env | grep NODE_ENV
```

## 📚 Ссылки

- [@sparticuz/chromium](https://github.com/Sparticuz/chromium) - оптимизированный Chromium для serverless
- [Render Deploy Hooks](https://render.com/docs/deploy-hooks) - автодеплой
- [Puppeteer Troubleshooting](https://pptr.dev/troubleshooting) - решение проблем

## 💡 Дополнительные оптимизации

Если нужно еще ускорить:

1. **Кеширование node_modules** (Render делает автоматически)
2. **Предкомпиляция** (в нашем случае не нужна)
3. **Health check timeout** - увеличить если сервис медленно стартует:
```yaml
healthCheckPath: /
healthCheckTimeout: 30  # секунд
```

4. **Graceful shutdown** - добавлено в server.js:
```javascript
process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Process terminated');
  });
});
```
