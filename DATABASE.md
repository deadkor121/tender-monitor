# 🗄️ База данных SQLite

## Обзор

Приложение теперь использует **SQLite** для хранения всех данных вместо JSON файлов. Это обеспечивает:

✅ **Надежность** - ACID транзакции, целостность данных  
✅ **Производительность** - быстрые запросы с индексами  
✅ **Масштабируемость** - поддержка больших объемов данных  
✅ **Гибкость** - мощные возможности фильтрации и сортировки  

## Структура базы данных

База данных находится в файле `data/tenders.db` и содержит следующие таблицы:

### 📦 tenders - Тендеры
```sql
CREATE TABLE tenders (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  deadline TEXT,
  link TEXT,
  source TEXT NOT NULL,
  scraped_at TEXT NOT NULL,
  price REAL,
  location TEXT,
  contractor TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### ⭐ favorites - Избранное
```sql
CREATE TABLE favorites (
  tender_id TEXT PRIMARY KEY,
  favorited_at TEXT NOT NULL,
  FOREIGN KEY (tender_id) REFERENCES tenders(id)
);
```

### 👁️ viewed - Просмотренные
```sql
CREATE TABLE viewed (
  tender_id TEXT PRIMARY KEY,
  viewed_at TEXT NOT NULL,
  FOREIGN KEY (tender_id) REFERENCES tenders(id)
);
```

### 📝 notes - Заметки
```sql
CREATE TABLE notes (
  tender_id TEXT PRIMARY KEY,
  note_text TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tender_id) REFERENCES tenders(id)
);
```

### 🏷️ tender_statuses - Статусы
```sql
CREATE TABLE tender_statuses (
  tender_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tender_id) REFERENCES tenders(id)
);
```

### ⭐ priorities - Приоритеты
```sql
CREATE TABLE priorities (
  tender_id TEXT PRIMARY KEY,
  priority TEXT NOT NULL DEFAULT 'medium',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (tender_id) REFERENCES tenders(id)
);
```

### 🏷️ tags - Теги
```sql
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tender_id TEXT NOT NULL,
  tag_name TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tender_id) REFERENCES tenders(id),
  UNIQUE(tender_id, tag_name)
);
```

### ⏰ reminders - Напоминания
```sql
CREATE TABLE reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tender_id TEXT NOT NULL,
  remind_before_days INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  notified INTEGER DEFAULT 0,
  FOREIGN KEY (tender_id) REFERENCES tenders(id)
);
```

### 🔍 filter_presets - Пресеты фильтров
```sql
CREATE TABLE filter_presets (
  name TEXT PRIMARY KEY,
  filters TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

## Миграция из JSON

Если у вас уже есть данные в JSON файлах, используйте утилиту миграции:

```bash
node migrate-to-db.js
```

Утилита автоматически:
- ✅ Создаст базу данных (если не существует)
- ✅ Перенесет все тендеры из JSON файлов
- ✅ Перенесет избранное, заметки, статусы, теги и приоритеты
- ✅ Покажет статистику после миграции

### Что мигрируется:

📦 **Тендеры:**
- `tenders.json` (Anbud)
- `doffin_tenders.json` (Doffin)
- `ted_tenders.json` (TED)
- `mercell_tenders.json` (Mercell)

👤 **Пользовательские данные:**
- `favorites.json` → избранное
- `viewed.json` → просмотренные
- `notes.json` → заметки
- `tender_status.json` → статусы
- `tags.json` → теги
- `priority.json` → приоритеты
- `filter_presets.json` → пресеты фильтров

## Использование в коде

### DatabaseService API

```javascript
const DatabaseService = require('./src/databaseService');
const db = new DatabaseService();

// === ТЕНДЕРЫ ===

// Сохранить один тендер
db.saveTender(tender);

// Сохранить массив тендеров
db.saveTenders([tender1, tender2, tender3]);

// Получить тендеры с фильтрацией
const tenders = db.getTenders({
  source: 'doffin',          // Фильтр по источнику
  search: 'строительство',   // Поиск по тексту
  deadlineBefore: '2026-03-01',
  scrapedAfter: '2026-02-01',
  limit: 100
});

// Получить тендер по ID
const tender = db.getTenderById('tender-123');

// Удалить тендер
db.deleteTender('tender-123');

// === ИЗБРАННОЕ ===

// Получить все избранные тендеры
const favorites = db.getFavorites();

// Проверить, в избранном ли тендер
const isFavorite = db.isFavorite('tender-123');

// Добавить в избранное
db.addFavorite('tender-123');

// Удалить из избранного
db.removeFavorite('tender-123');

// === ЗАМЕТКИ ===

// Добавить/обновить заметку
db.addNote('tender-123', 'Важный проект!');

// Получить заметку
const note = db.getNote('tender-123');

// Удалить заметку
db.deleteNote('tender-123');

// === СТАТУСЫ ===

// Установить статус
db.setStatus('tender-123', 'in_progress');

// Получить статус
const status = db.getStatus('tender-123');

// === ПРИОРИТЕТЫ ===

// Установить приоритет
db.setPriority('tender-123', 'high'); // high, medium, low

// Получить приоритет
const priority = db.getPriority('tender-123');

// === ТЕГИ ===

// Установить теги (заменяет существующие)
db.setTags('tender-123', ['строительство', 'срочно']);

// Получить теги тендера
const tags = db.getTags('tender-123');

// Получить все уникальные теги
const allTags = db.getAllTags();

// === НАПОМИНАНИЯ ===

// Добавить напоминание (за N дней до дедлайна)
db.addReminder('tender-123', 7); // Напомнить за 7 дней

// Получить напоминания для тендера
const reminders = db.getReminders('tender-123');

// Получить напоминания, которые нужно отправить
const pending = db.getPendingReminders();

// Отметить напоминание как отправленное
db.markReminderNotified(reminderId);

// === СТАТИСТИКА ===

const stats = db.getStatistics();
// Возвращает:
// {
//   total: 150,
//   bySource: [{ source: 'doffin', count: 80 }, ...],
//   byCategory: [{ category: 'Строительство', count: 50 }, ...],
//   favoritesCount: 25
// }

// === ЗАКРЫТИЕ БД ===

db.close();
```

## Производительность

### Индексы

База данных использует индексы для оптимизации запросов:

- `tenders`: по source, scraped_at, deadline
- `tender_statuses`: по status
- `priorities`: по priority
- `tags`: по tender_id, tag_name

### Write-Ahead Logging (WAL)

БД использует режим WAL для:
- ⚡ Параллельное чтение во время записи
- 🚀 Быстрые транзакции
- 💾 Надежность данных

## Бэкап

### Автоматический бэкап

База данных SQLite хранится в одном файле `data/tenders.db`. Для бэкапа просто копируйте этот файл:

```bash
# Windows
copy data\tenders.db backup\tenders_backup_2026-02-08.db

# Linux/Mac
cp data/tenders.db backup/tenders_backup_2026-02-08.db
```

### Экспорт в SQL

```bash
sqlite3 data/tenders.db .dump > backup.sql
```

### Восстановление из SQL

```bash
sqlite3 data/tenders_new.db < backup.sql
```

## Инструменты для работы с БД

### Просмотр через командную строку

```bash
sqlite3 data/tenders.db

# Внутри sqlite3:
.tables                    # Список таблиц
.schema tenders            # Схема таблицы
SELECT COUNT(*) FROM tenders;
SELECT * FROM tenders LIMIT 5;
.quit
```

### GUI инструменты

- **DB Browser for SQLite** (бесплатно) - https://sqlitebrowser.org/
- **DBeaver** (бесплатно) - https://dbeaver.io/
- **DataGrip** (платно) - https://www.jetbrains.com/datagrip/

## Troubleshooting

### База данных заблокирована

Если получаете ошибку "database is locked":
1. Закройте все приложения, использующие БД
2. Убедитесь, что используется режим WAL (уже включен по умолчанию)

### Повреждение БД

```bash
# Проверка целостности
sqlite3 data/tenders.db "PRAGMA integrity_check;"

# Восстановление из бэкапа
copy backup\tenders_backup.db data\tenders.db
```

### Очистка старых данных

```javascript
// Удалить тендеры старше 6 месяцев
const db = new DatabaseService();
db.db.exec(`
  DELETE FROM tenders 
  WHERE date(scraped_at) < date('now', '-6 months')
`);
```

## Преимущества перехода на SQL

| Аспект | JSON файлы | SQLite БД |
|--------|-----------|-----------|
| Производительность | ❌ Медленно при >1000 записях | ✅ Быстро даже при >10000 |
| Фильтрация | ❌ В памяти, неэффективно | ✅ SQL запросы с индексами |
| Целостность | ❌ Нет гарантий | ✅ ACID транзакции |
| Связи данных | ❌ Вручную | ✅ Foreign keys |
| Конкурентность | ❌ Проблемы записи | ✅ WAL режим |
| Бэкап | ❌ Множество файлов | ✅ Один файл |
| Запросы | ❌ JavaScript код | ✅ SQL - мощно и гибко |

---

**Готово!** 🎉 Ваше приложение теперь использует профессиональную SQL базу данных!
