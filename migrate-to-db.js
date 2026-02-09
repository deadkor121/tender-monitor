#!/usr/bin/env node

/**
 * Утилита миграции данных из JSON файлов в SQLite базу данных
 * 
 * Использование:
 *   node migrate-to-db.js
 */

const fs = require('fs').promises;
const path = require('path');
const DatabaseService = require('./src/databaseService');

const DATA_DIR = path.join(__dirname, 'data');

// JSON файлы для миграции
const SOURCE_FILES = {
  anbud: 'tenders.json',
  doffin: 'doffin_tenders.json',
  ted: 'ted_tenders.json',
  mercell: 'mercell_tenders.json'
};

const USER_DATA_FILES = {
  favorites: 'favorites.json',
  viewed: 'viewed.json',
  notes: 'notes.json',
  tender_status: 'tender_status.json',
  tags: 'tags.json',
  priority: 'priority.json',
  filter_presets: 'filter_presets.json'
};

async function loadJsonFile(filename) {
  try {
    const data = await fs.readFile(path.join(DATA_DIR, filename), 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.log(`  ⚠️  Файл ${filename} не найден или пуст, пропускаем...`);
    return null;
  }
}

async function migrateTenders(db) {
  console.log('\n📦 Миграция тендеров...');
  let totalMigrated = 0;

  for (const [source, filename] of Object.entries(SOURCE_FILES)) {
    console.log(`\n  Источник: ${source} (${filename})`);
    const tenders = await loadJsonFile(filename);
    
    if (!tenders || !Array.isArray(tenders) || tenders.length === 0) {
      continue;
    }

    console.log(`  Найдено тендеров: ${tenders.length}`);
    
    try {
      const count = db.saveTenders(tenders.map(t => ({
        ...t,
        source: t.source || source
      })));
      console.log(`  ✅ Мигрировано: ${count}`);
      totalMigrated += count;
    } catch (error) {
      console.error(`  ❌ Ошибка миграции ${source}:`, error.message);
    }
  }

  console.log(`\n✅ Всего мигрировано тендеров: ${totalMigrated}`);
  return totalMigrated;
}

async function migrateFavorites(db) {
  console.log('\n⭐ Миграция избранного...');
  const favorites = await loadJsonFile(USER_DATA_FILES.favorites);
  
  if (!favorites || typeof favorites !== 'object') {
    return 0;
  }

  let count = 0;
  for (const [tenderId, tender] of Object.entries(favorites)) {
    try {
      // Сначала убедимся, что тендер существует в БД
      if (tender && typeof tender === 'object') {
        db.saveTender(tender);
        db.addFavorite(tenderId);
        count++;
      }
    } catch (error) {
      console.error(`  ⚠️  Ошибка добавления в избранное ${tenderId}:`, error.message);
    }
  }

  console.log(`✅ Мигрировано записей избранного: ${count}`);
  return count;
}

async function migrateViewed(db) {
  console.log('\n👁️  Миграция просмотренных...');
  const viewed = await loadJsonFile(USER_DATA_FILES.viewed);
  
  if (!viewed || typeof viewed !== 'object') {
    return 0;
  }

  let count = 0;
  for (const tenderId of Object.keys(viewed)) {
    try {
      db.markAsViewed(tenderId);
      count++;
    } catch (error) {
      console.error(`  ⚠️  Ошибка добавления просмотра ${tenderId}:`, error.message);
    }
  }

  console.log(`✅ Мигрировано просмотров: ${count}`);
  return count;
}

async function migrateNotes(db) {
  console.log('\n📝 Миграция заметок...');
  const notes = await loadJsonFile(USER_DATA_FILES.notes);
  
  if (!notes || typeof notes !== 'object') {
    return 0;
  }

  let count = 0;
  for (const [tenderId, noteData] of Object.entries(notes)) {
    try {
      const noteText = typeof noteData === 'object' ? noteData.text : noteData;
      if (noteText) {
        db.addNote(tenderId, noteText);
        count++;
      }
    } catch (error) {
      console.error(`  ⚠️  Ошибка добавления заметки ${tenderId}:`, error.message);
    }
  }

  console.log(`✅ Мигрировано заметок: ${count}`);
  return count;
}

async function migrateStatuses(db) {
  console.log('\n🏷️  Миграция статусов...');
  const statuses = await loadJsonFile(USER_DATA_FILES.tender_status);
  
  if (!statuses || typeof statuses !== 'object') {
    return 0;
  }

  let count = 0;
  for (const [tenderId, statusData] of Object.entries(statuses)) {
    try {
      const status = typeof statusData === 'object' ? statusData.status : statusData;
      if (status) {
        db.setStatus(tenderId, status);
        count++;
      }
    } catch (error) {
      console.error(`  ⚠️  Ошибка добавления статуса ${tenderId}:`, error.message);
    }
  }

  console.log(`✅ Мигрировано статусов: ${count}`);
  return count;
}

async function migrateTags(db) {
  console.log('\n🏷️  Миграция тегов...');
  const tags = await loadJsonFile(USER_DATA_FILES.tags);
  
  if (!tags || typeof tags !== 'object') {
    return 0;
  }

  let count = 0;
  for (const [tenderId, tagsList] of Object.entries(tags)) {
    try {
      if (Array.isArray(tagsList) && tagsList.length > 0) {
        db.setTags(tenderId, tagsList);
        count++;
      }
    } catch (error) {
      console.error(`  ⚠️  Ошибка добавления тегов ${tenderId}:`, error.message);
    }
  }

  console.log(`✅ Мигрировано тегов для тендеров: ${count}`);
  return count;
}

async function migratePriorities(db) {
  console.log('\n⭐ Миграция приоритетов...');
  const priorities = await loadJsonFile(USER_DATA_FILES.priority);
  
  if (!priorities || typeof priorities !== 'object') {
    return 0;
  }

  let count = 0;
  for (const [tenderId, priority] of Object.entries(priorities)) {
    try {
      if (priority) {
        db.setPriority(tenderId, priority);
        count++;
      }
    } catch (error) {
      console.error(`  ⚠️  Ошибка добавления приоритета ${tenderId}:`, error.message);
    }
  }

  console.log(`✅ Мигрировано приоритетов: ${count}`);
  return count;
}

async function migrateFilterPresets(db) {
  console.log('\n🔍 Миграция пресетов фильтров...');
  const presets = await loadJsonFile(USER_DATA_FILES.filter_presets);
  
  if (!presets || typeof presets !== 'object') {
    return 0;
  }

  let count = 0;
  for (const [name, presetData] of Object.entries(presets)) {
    try {
      const filters = typeof presetData === 'object' ? presetData.filters : presetData;
      if (filters) {
        db.saveFilterPreset(name, filters);
        count++;
      }
    } catch (error) {
      console.error(`  ⚠️  Ошибка добавления пресета ${name}:`, error.message);
    }
  }

  console.log(`✅ Мигрировано пресетов: ${count}`);
  return count;
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('   🚀 МИГРАЦИЯ ДАННЫХ ИЗ JSON В SQLite');
  console.log('═══════════════════════════════════════════');

  const db = new DatabaseService();
  console.log('\n✅ База данных инициализирована');

  try {
    // Миграция тендеров
    await migrateTenders(db);

    // Миграция пользовательских данных
    await migrateFavorites(db);
    await migrateViewed(db);
    await migrateNotes(db);
    await migrateStatuses(db);
    await migrateTags(db);
    await migratePriorities(db);
    await migrateFilterPresets(db);

    // Статистика
    const stats = db.getStatistics();
    console.log('\n═══════════════════════════════════════════');
    console.log('   📊 СТАТИСТИКА ПОСЛЕ МИГРАЦИИ');
    console.log('═══════════════════════════════════════════');
    console.log(`\n📦 Всего тендеров в БД: ${stats.total}`);
    console.log(`⭐ Избранных: ${stats.favoritesCount}`);
    
    console.log('\n📊 По источникам:');
    stats.bySource.forEach(({ source, count }) => {
      console.log(`  • ${source}: ${count}`);
    });

    if (stats.byCategory.length > 0) {
      console.log('\n📊 Топ-5 категорий:');
      stats.byCategory.slice(0, 5).forEach(({ category, count }) => {
        console.log(`  • ${category || 'Без категории'}: ${count}`);
      });
    }

    console.log('\n═══════════════════════════════════════════');
    console.log('   ✅ МИГРАЦИЯ ЗАВЕРШЕНА УСПЕШНО!');
    console.log('═══════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Критическая ошибка миграции:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Запуск миграции
main().catch(error => {
  console.error('Критическая ошибка:', error);
  process.exit(1);
});
