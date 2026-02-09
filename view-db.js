#!/usr/bin/env node

/**
 * Утилита для просмотра данных в SQLite базе
 * 
 * Использование:
 *   node view-db.js                    # Общая статистика
 *   node view-db.js tenders            # Показать все тендеры
 *   node view-db.js tenders 10         # Показать последние 10 тендеров
 *   node view-db.js favorites          # Показать избранное
 *   node view-db.js stats              # Детальная статистика
 *   node view-db.js search "текст"     # Поиск по тексту
 */

const DatabaseService = require('./src/databaseService');

const db = new DatabaseService();

const command = process.argv[2] || 'stats';
const arg = process.argv[3];

function printTable(data, columns) {
  if (!data || data.length === 0) {
    console.log('  (нет данных)');
    return;
  }

  // Печать заголовка
  console.log('\n  ' + columns.map(col => col.padEnd(20)).join(' | '));
  console.log('  ' + columns.map(() => '─'.repeat(20)).join('─┼─'));

  // Печать данных
  data.forEach(row => {
    const values = columns.map(col => {
      const value = row[col] || '';
      const str = String(value);
      return str.length > 20 ? str.substring(0, 17) + '...' : str.padEnd(20);
    });
    console.log('  ' + values.join(' | '));
  });
}

function showTenders(limit = 10) {
  console.log(`\n📦 Последние ${limit} тендеров:\n`);
  const tenders = db.getTenders({ limit: parseInt(limit) });
  
  if (tenders.length === 0) {
    console.log('  Тендеры не найдены');
    return;
  }

  tenders.forEach((tender, i) => {
    console.log(`\n${i + 1}. ${tender.title}`);
    console.log(`   ID: ${tender.id}`);
    console.log(`   Источник: ${tender.source}`);
    console.log(`   Категория: ${tender.category || 'н/д'}`);
    console.log(`   Дедлайн: ${tender.deadline || 'н/д'}`);
    console.log(`   Дата: ${new Date(tender.scrapedAt).toLocaleString('ru-RU')}`);
    if (tender.link) {
      console.log(`   Ссылка: ${tender.link}`);
    }
  });
}

function showFavorites() {
  console.log('\n⭐ Избранные тендеры:\n');
  const favorites = db.getFavorites();
  
  if (favorites.length === 0) {
    console.log('  Нет избранных тендеров');
    return;
  }

  favorites.forEach((tender, i) => {
    console.log(`\n${i + 1}. ${tender.title}`);
    console.log(`   ID: ${tender.id}`);
    console.log(`   Добавлено: ${new Date(tender.favoritedAt).toLocaleString('ru-RU')}`);
    console.log(`   Источник: ${tender.source}`);
  });
}

function showStats() {
  console.log('\n═══════════════════════════════════════════');
  console.log('   📊 СТАТИСТИКА БАЗЫ ДАННЫХ');
  console.log('═══════════════════════════════════════════\n');

  const stats = db.getStatistics();

  console.log(`📦 Всего тендеров: ${stats.total}`);
  console.log(`⭐ Избранных: ${stats.favoritesCount}`);

  if (stats.bySource.length > 0) {
    console.log('\n📊 По источникам:');
    stats.bySource.forEach(({ source, count }) => {
      const percent = ((count / stats.total) * 100).toFixed(1);
      console.log(`  • ${source.padEnd(15)} : ${count.toString().padStart(5)} (${percent}%)`);
    });
  }

  if (stats.byCategory.length > 0) {
    console.log('\n📊 Топ-10 категорий:');
    stats.byCategory.slice(0, 10).forEach(({ category, count }) => {
      const cat = category || 'Без категории';
      const percent = ((count / stats.total) * 100).toFixed(1);
      console.log(`  • ${cat.substring(0, 30).padEnd(32)} : ${count.toString().padStart(4)} (${percent}%)`);
    });
  }

  // Дополнительная статистика
  const allTenders = db.getTenders();
  
  // По дням
  const last7Days = allTenders.filter(t => {
    const date = new Date(t.scrapedAt);
    const now = new Date();
    const diff = now - date;
    return diff < 7 * 24 * 60 * 60 * 1000;
  });

  console.log('\n📅 Временная статистика:');
  console.log(`  • За последние 7 дней: ${last7Days.length}`);
  
  // С дедлайном
  const withDeadline = allTenders.filter(t => t.deadline);
  console.log(`  • С дедлайном: ${withDeadline.length}`);

  // Теги
  const allTags = db.getAllTags();
  if (allTags.length > 0) {
    console.log('\n🏷️ Теги:');
    console.log(`  • Всего уникальных тегов: ${allTags.length}`);
    console.log(`  • Теги: ${allTags.slice(0, 10).join(', ')}${allTags.length > 10 ? '...' : ''}`);
  }

  console.log('\n═══════════════════════════════════════════\n');
}

function searchTenders(query) {
  console.log(`\n🔍 Поиск: "${query}"\n`);
  const tenders = db.getTenders({ search: query });

  if (tenders.length === 0) {
    console.log('  Ничего не найдено');
    return;
  }

  console.log(`Найдено результатов: ${tenders.length}\n`);
  
  tenders.slice(0, 20).forEach((tender, i) => {
    console.log(`${i + 1}. ${tender.title}`);
    console.log(`   ${tender.source} | ${new Date(tender.scrapedAt).toLocaleDateString('ru-RU')}`);
    if (tender.description) {
      const desc = tender.description.substring(0, 100);
      console.log(`   ${desc}${tender.description.length > 100 ? '...' : ''}`);
    }
    console.log('');
  });

  if (tenders.length > 20) {
    console.log(`... и еще ${tenders.length - 20} результатов\n`);
  }
}

function showTables() {
  console.log('\n📋 Структура базы данных:\n');
  
  const tables = [
    { name: 'tenders', desc: 'Основная таблица тендеров' },
    { name: 'favorites', desc: 'Избранные тендеры' },
    { name: 'viewed', desc: 'Просмотренные тендеры' },
    { name: 'notes', desc: 'Заметки к тендерам' },
    { name: 'tender_statuses', desc: 'Статусы тендеров' },
    { name: 'priorities', desc: 'Приоритеты тендеров' },
    { name: 'tags', desc: 'Теги для тендеров' },
    { name: 'reminders', desc: 'Напоминания о дедлайнах' },
    { name: 'filter_presets', desc: 'Сохраненные фильтры' }
  ];

  tables.forEach(({ name, desc }) => {
    const stmt = db.db.prepare(`SELECT COUNT(*) as count FROM ${name}`);
    const { count } = stmt.get();
    console.log(`  • ${name.padEnd(20)} : ${count.toString().padStart(5)} записей - ${desc}`);
  });
  
  console.log('\n');
}

// Основная логика
try {
  switch (command) {
    case 'tenders':
      showTenders(arg || 10);
      break;
    
    case 'favorites':
      showFavorites();
      break;
    
    case 'stats':
    case 'statistics':
      showStats();
      break;
    
    case 'search':
      if (!arg) {
        console.log('\n❌ Укажите поисковый запрос: node view-db.js search "текст"\n');
      } else {
        searchTenders(arg);
      }
      break;
    
    case 'tables':
      showTables();
      break;
    
    case 'help':
    case '--help':
    case '-h':
      console.log(`
📖 Утилита просмотра базы данных

Использование:
  node view-db.js [команда] [параметры]

Команды:
  stats                      # Общая статистика (по умолчанию)
  tenders [количество]       # Показать последние тендеры (по умолчанию 10)
  favorites                  # Показать избранное
  search "текст"             # Поиск по тендерам
  tables                     # Структура БД и количество записей
  help                       # Эта справка

Примеры:
  node view-db.js                          # Статистика
  node view-db.js tenders 20               # Последние 20 тендеров
  node view-db.js search "строительство"   # Поиск
  node view-db.js favorites                # Избранное
      `);
      break;
    
    default:
      console.log(`\n❌ Неизвестная команда: ${command}`);
      console.log('Используйте: node view-db.js help\n');
  }
} catch (error) {
  console.error('\n❌ Ошибка:', error.message);
  console.error('\nСтек:', error.stack);
} finally {
  db.close();
}
