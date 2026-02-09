const { Client } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');

// Проверка валидности даты
function isValidDate(dateString) {
  if (!dateString) return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime()) && dateString.length > 8;
}

async function migrateData() {
  console.log('🚀 Начинаем миграцию данных из SQLite в PostgreSQL...\n');

  // Подключаемся к SQLite
  const sqlitePath = path.join(__dirname, 'data', 'tenders.db');
  console.log('📂 Открываем SQLite базу:', sqlitePath);
  const sqlite = new Database(sqlitePath, { readonly: true });
  console.log('✅ SQLite подключена\n');

  // Подключаемся к PostgreSQL
  console.log('📡 Подключаемся к PostgreSQL...');
  const pgClient = new Client({
    host: 'localhost',
    port: 5432,
    database: 'tender_monitor',
    user: 'postgres',
    password: ''
  });

  try {
    await pgClient.connect();
    console.log('✅ PostgreSQL подключена\n');

    // Читаем данные из SQLite
    console.log('📊 Читаем данные из SQLite...');
    
    const tenders = sqlite.prepare('SELECT * FROM tenders').all();
    const favorites = sqlite.prepare('SELECT * FROM favorites').all();
    const viewed = sqlite.prepare('SELECT * FROM viewed').all();
    const notes = sqlite.prepare('SELECT * FROM notes').all();
    const statuses = sqlite.prepare('SELECT * FROM tender_statuses').all();
    const priorities = sqlite.prepare('SELECT * FROM priorities').all();
    const tags = sqlite.prepare('SELECT * FROM tags').all();
    const reminders = sqlite.prepare('SELECT * FROM reminders').all();

    console.log(`  📦 Тендеров: ${tenders.length}`);
    console.log(`  ⭐ Избранных: ${favorites.length}`);
    console.log(`  👁️  Просмотренных: ${viewed.length}`);
    console.log(`  📝 Заметок: ${notes.length}`);
    console.log(`  🎯 Статусов: ${statuses.length}`);
    console.log(`  🔔 Приоритетов: ${priorities.length}`);
    console.log(`  🏷️  Тегов: ${tags.length}`);
    console.log(`  ⏰ Напоминаний: ${reminders.length}\n`);

    // Начинаем транзакцию
    await pgClient.query('BEGIN');

    // Очищаем существующие данные
    console.log('🧹 Очищаем существующие данные...');
    await pgClient.query('TRUNCATE tenders CASCADE');
    console.log('✅ Данные очищены\n');

    // Переносим тендеры
    if (tenders.length > 0) {
      console.log('📥 Переносим тендеры...');
      let migrated = 0;
      let errors = 0;
      
      for (const tender of tenders) {
        try {
          // Проверяем и исправляем даты
          const scrapedAt = isValidDate(tender.scraped_at) 
            ? tender.scraped_at 
            : new Date().toISOString();
          
          const deadline = isValidDate(tender.deadline) 
            ? tender.deadline 
            : null;
          
          const createdAt = isValidDate(tender.created_at) 
            ? tender.created_at 
            : scrapedAt;

          await pgClient.query(`
            INSERT INTO tenders (
              id, title, description, category, deadline, link, 
              source, scraped_at, price, location, contractor, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (id) DO NOTHING
          `, [
            tender.id,
            tender.title,
            tender.description,
            tender.category,
            deadline,
            tender.link,
            tender.source,
            scrapedAt,
            tender.price,
            tender.location,
            tender.contractor,
            createdAt
          ]);
          migrated++;
        } catch (error) {
          errors++;
          console.error(`\n  ⚠️  Ошибка для тендера ${tender.id}: ${error.message}`);
        }
      }
      console.log(`✅ Перенесено ${migrated} тендеров (ошибок: ${errors})\n`);
    }

    // Переносим избранное
    if (favorites.length > 0) {
      console.log('📥 Переносим избранное...');
      for (const fav of favorites) {
        await pgClient.query(`
          INSERT INTO favorites (tender_id, favorited_at)
          VALUES ($1, $2)
          ON CONFLICT (tender_id) DO NOTHING
        `, [fav.tender_id, fav.favorited_at]);
      }
      console.log(`✅ Перенесено ${favorites.length} избранных\n`);
    }

    // Переносим просмотренные
    if (viewed.length > 0) {
      console.log('📥 Переносим просмотренные...');
      for (const view of viewed) {
        await pgClient.query(`
          INSERT INTO viewed (tender_id, viewed_at)
          VALUES ($1, $2)
          ON CONFLICT (tender_id) DO NOTHING
        `, [view.tender_id, view.viewed_at]);
      }
      console.log(`✅ Перенесено ${viewed.length} просмотренных\n`);
    }

    // Переносим заметки
    if (notes.length > 0) {
      console.log('📥 Переносим заметки...');
      for (const note of notes) {
        await pgClient.query(`
          INSERT INTO notes (tender_id, note_text, updated_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (tender_id) DO NOTHING
        `, [note.tender_id, note.note_text, note.updated_at]);
      }
      console.log(`✅ Перенесено ${notes.length} заметок\n`);
    }

    // Переносим статусы
    if (statuses.length > 0) {
      console.log('📥 Переносим статусы...');
      for (const status of statuses) {
        await pgClient.query(`
          INSERT INTO tender_statuses (tender_id, status, updated_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (tender_id) DO NOTHING
        `, [status.tender_id, status.status, status.updated_at]);
      }
      console.log(`✅ Перенесено ${statuses.length} статусов\n`);
    }

    // Переносим приоритеты
    if (priorities.length > 0) {
      console.log('📥 Переносим приоритеты...');
      for (const priority of priorities) {
        await pgClient.query(`
          INSERT INTO priorities (tender_id, priority, updated_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (tender_id) DO NOTHING
        `, [priority.tender_id, priority.priority, priority.updated_at]);
      }
      console.log(`✅ Перенесено ${priorities.length} приоритетов\n`);
    }

    // Переносим теги
    if (tags.length > 0) {
      console.log('📥 Переносим теги...');
      for (const tag of tags) {
        await pgClient.query(`
          INSERT INTO tags (tender_id, tag_name, created_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (tender_id, tag_name) DO NOTHING
        `, [tag.tender_id, tag.tag_name, tag.created_at]);
      }
      console.log(`✅ Перенесено ${tags.length} тегов\n`);
    }

    // Переносим напоминания
    if (reminders.length > 0) {
      console.log('📥 Переносим напоминания...');
      for (const reminder of reminders) {
        await pgClient.query(`
          INSERT INTO reminders (tender_id, remind_before_days, created_at, notified)
          VALUES ($1, $2, $3, $4)
        `, [
          reminder.tender_id,
          reminder.remind_before_days,
          reminder.created_at,
          reminder.notified || false
        ]);
      }
      console.log(`✅ Перенесено ${reminders.length} напоминаний\n`);
    }

    // Фиксируем транзакцию
    await pgClient.query('COMMIT');
    console.log('💾 Транзакция зафиксирована\n');

    // Проверяем результат
    console.log('🔍 Проверяем результат миграции...\n');
    
    const result = await pgClient.query(`
      SELECT 
        (SELECT COUNT(*) FROM tenders) as tenders_count,
        (SELECT COUNT(*) FROM favorites) as favorites_count,
        (SELECT COUNT(*) FROM viewed) as viewed_count,
        (SELECT COUNT(*) FROM notes) as notes_count,
        (SELECT COUNT(*) FROM tender_statuses) as statuses_count,
        (SELECT COUNT(*) FROM priorities) as priorities_count,
        (SELECT COUNT(*) FROM tags) as tags_count,
        (SELECT COUNT(*) FROM reminders) as reminders_count
    `);

    const counts = result.rows[0];
    console.log('📊 Данные в PostgreSQL:');
    console.log(`  📦 Тендеров: ${counts.tenders_count}`);
    console.log(`  ⭐ Избранных: ${counts.favorites_count}`);
    console.log(`  👁️  Просмотренных: ${counts.viewed_count}`);
    console.log(`  📝 Заметок: ${counts.notes_count}`);
    console.log(`  🎯 Статусов: ${counts.statuses_count}`);
    console.log(`  🔔 Приоритетов: ${counts.priorities_count}`);
    console.log(`  🏷️  Тегов: ${counts.tags_count}`);
    console.log(`  ⏰ Напоминаний: ${counts.reminders_count}\n`);

    // Показываем примеры
    const samples = await pgClient.query(`
      SELECT id, title, source, deadline 
      FROM tenders 
      ORDER BY scraped_at DESC 
      LIMIT 5
    `);

    console.log('📝 Примеры перенесенных тендеров:');
    samples.rows.forEach((t, i) => {
      console.log(`  ${i + 1}. [${t.source}] ${t.title.substring(0, 60)}...`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('🎉 МИГРАЦИЯ ЗАВЕРШЕНА УСПЕШНО!');
    console.log('='.repeat(60));
    console.log('\n📋 Следующие шаги:');
    console.log('1. Обновите pgAdmin (F5) чтобы увидеть данные');
    console.log('2. Создайте PostgreSQL DatabaseService для приложения');
    console.log('3. Обновите .env для подключения к PostgreSQL');
    console.log('4. Запустите приложение: npm start\n');

  } catch (error) {
    console.error('\n❌ ОШИБКА:', error.message);
    console.error(error.stack);
    
    // Откатываем транзакцию
    try {
      await pgClient.query('ROLLBACK');
      console.log('↩️  Транзакция откачена');
    } catch (e) {
      console.error('Ошибка отката:', e.message);
    }
    
    process.exit(1);
  } finally {
    sqlite.close();
    await pgClient.end();
  }
}

// Запускаем миграцию
migrateData();
