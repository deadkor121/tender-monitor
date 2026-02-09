const Database = require('better-sqlite3');
const path = require('path');

class DatabaseService {
  constructor() {
    const dbPath = path.join(__dirname, '../data/tenders.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Включаем Write-Ahead Logging для лучшей производительности
    this.initDatabase();
  }

  initDatabase() {
    // Таблица тендеров
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tenders (
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

      CREATE INDEX IF NOT EXISTS idx_tenders_source ON tenders(source);
      CREATE INDEX IF NOT EXISTS idx_tenders_scraped_at ON tenders(scraped_at);
      CREATE INDEX IF NOT EXISTS idx_tenders_deadline ON tenders(deadline);
    `);

    // Таблица избранного
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS favorites (
        tender_id TEXT PRIMARY KEY,
        favorited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE CASCADE
      );
    `);

    // Таблица просмотренных
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS viewed (
        tender_id TEXT PRIMARY KEY,
        viewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE CASCADE
      );
    `);

    // Таблица заметок
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        tender_id TEXT PRIMARY KEY,
        note_text TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE CASCADE
      );
    `);

    // Таблица статусов
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tender_statuses (
        tender_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_tender_statuses_status ON tender_statuses(status);
    `);

    // Таблица приоритетов
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS priorities (
        tender_id TEXT PRIMARY KEY,
        priority TEXT NOT NULL DEFAULT 'medium',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_priorities_priority ON priorities(priority);
    `);

    // Таблица тегов
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id TEXT NOT NULL,
        tag_name TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE CASCADE,
        UNIQUE(tender_id, tag_name)
      );

      CREATE INDEX IF NOT EXISTS idx_tags_tender_id ON tags(tender_id);
      CREATE INDEX IF NOT EXISTS idx_tags_tag_name ON tags(tag_name);
    `);

    // Таблица напоминаний
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id TEXT NOT NULL,
        remind_before_days INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        notified INTEGER DEFAULT 0,
        FOREIGN KEY (tender_id) REFERENCES tenders(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_reminders_tender_id ON reminders(tender_id);
      CREATE INDEX IF NOT EXISTS idx_reminders_notified ON reminders(notified);
    `);

    // Таблица пресетов фильтров
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS filter_presets (
        name TEXT PRIMARY KEY,
        filters TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('[Database] База данных инициализирована');
  }

  // ==================== ТЕНДЕРЫ ====================

  saveTender(tender) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tenders 
      (id, title, description, category, deadline, link, source, scraped_at, price, location, contractor)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      tender.id,
      tender.title,
      tender.description || null,
      tender.category || null,
      tender.deadline || null,
      tender.link || null,
      tender.source,
      tender.scrapedAt,
      tender.price || null,
      tender.location || null,
      tender.contractor || null
    );
  }

  saveTenders(tenders) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tenders 
      (id, title, description, category, deadline, link, source, scraped_at, price, location, contractor)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((tendersList) => {
      for (const tender of tendersList) {
        stmt.run(
          tender.id,
          tender.title,
          tender.description || null,
          tender.category || null,
          tender.deadline || null,
          tender.link || null,
          tender.source,
          tender.scrapedAt,
          tender.price || null,
          tender.location || null,
          tender.contractor || null
        );
      }
    });

    transaction(tenders);
    return tenders.length;
  }

  getTenders(filters = {}) {
    let query = 'SELECT * FROM tenders WHERE 1=1';
    const params = [];

    if (filters.source && filters.source !== 'all') {
      query += ' AND source = ?';
      params.push(filters.source);
    }

    if (filters.search) {
      query += ' AND (title LIKE ? OR description LIKE ? OR category LIKE ?)';
      const searchPattern = `%${filters.search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    if (filters.deadlineBefore) {
      query += ' AND deadline <= ?';
      params.push(filters.deadlineBefore);
    }

    if (filters.scrapedAfter) {
      query += ' AND scraped_at >= ?';
      params.push(filters.scrapedAfter);
    }

    query += ' ORDER BY scraped_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    const stmt = this.db.prepare(query);
    return stmt.all(...params).map(this.mapTenderFromDb);
  }

  getTenderById(tenderId) {
    const stmt = this.db.prepare('SELECT * FROM tenders WHERE id = ?');
    const tender = stmt.get(tenderId);
    return tender ? this.mapTenderFromDb(tender) : null;
  }

  deleteTender(tenderId) {
    const stmt = this.db.prepare('DELETE FROM tenders WHERE id = ?');
    return stmt.run(tenderId);
  }

  mapTenderFromDb(row) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      category: row.category,
      deadline: row.deadline,
      link: row.link,
      source: row.source,
      scrapedAt: row.scraped_at,
      price: row.price,
      location: row.location,
      contractor: row.contractor
    };
  }

  // ==================== ИЗБРАННОЕ ====================

  getFavorites() {
    const stmt = this.db.prepare(`
      SELECT t.*, f.favorited_at 
      FROM favorites f 
      JOIN tenders t ON f.tender_id = t.id 
      ORDER BY f.favorited_at DESC
    `);
    return stmt.all().map(row => ({
      ...this.mapTenderFromDb(row),
      favoritedAt: row.favorited_at
    }));
  }

  isFavorite(tenderId) {
    const stmt = this.db.prepare('SELECT 1 FROM favorites WHERE tender_id = ?');
    return !!stmt.get(tenderId);
  }

  addFavorite(tenderId) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO favorites (tender_id, favorited_at) 
      VALUES (?, datetime('now'))
    `);
    return stmt.run(tenderId);
  }

  removeFavorite(tenderId) {
    const stmt = this.db.prepare('DELETE FROM favorites WHERE tender_id = ?');
    return stmt.run(tenderId);
  }

  // ==================== ПРОСМОТРЕННЫЕ ====================

  getViewed() {
    const stmt = this.db.prepare(`
      SELECT tender_id, viewed_at FROM viewed ORDER BY viewed_at DESC
    `);
    return stmt.all();
  }

  markAsViewed(tenderId) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO viewed (tender_id, viewed_at) 
      VALUES (?, datetime('now'))
    `);
    return stmt.run(tenderId);
  }

  // ==================== ЗАМЕТКИ ====================

  getNotes() {
    const stmt = this.db.prepare('SELECT * FROM notes');
    return stmt.all();
  }

  getNote(tenderId) {
    const stmt = this.db.prepare('SELECT note_text FROM notes WHERE tender_id = ?');
    const result = stmt.get(tenderId);
    return result ? result.note_text : null;
  }

  addNote(tenderId, noteText) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO notes (tender_id, note_text, updated_at) 
      VALUES (?, ?, datetime('now'))
    `);
    return stmt.run(tenderId, noteText);
  }

  deleteNote(tenderId) {
    const stmt = this.db.prepare('DELETE FROM notes WHERE tender_id = ?');
    return stmt.run(tenderId);
  }

  // ==================== СТАТУСЫ ====================

  getStatuses() {
    const stmt = this.db.prepare('SELECT * FROM tender_statuses');
    return stmt.all();
  }

  getStatus(tenderId) {
    const stmt = this.db.prepare('SELECT status FROM tender_statuses WHERE tender_id = ?');
    const result = stmt.get(tenderId);
    return result ? result.status : null;
  }

  setStatus(tenderId, status) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tender_statuses (tender_id, status, updated_at) 
      VALUES (?, ?, datetime('now'))
    `);
    return stmt.run(tenderId, status);
  }

  // ==================== ПРИОРИТЕТЫ ====================

  getPriority(tenderId) {
    const stmt = this.db.prepare('SELECT priority FROM priorities WHERE tender_id = ?');
    const result = stmt.get(tenderId);
    return result ? result.priority : 'medium';
  }

  setPriority(tenderId, priority) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO priorities (tender_id, priority, updated_at) 
      VALUES (?, ?, datetime('now'))
    `);
    return stmt.run(tenderId, priority);
  }

  // ==================== ТЕГИ ====================

  getTags(tenderId) {
    const stmt = this.db.prepare('SELECT tag_name FROM tags WHERE tender_id = ? ORDER BY tag_name');
    return stmt.all(tenderId).map(row => row.tag_name);
  }

  getAllTags() {
    const stmt = this.db.prepare('SELECT DISTINCT tag_name FROM tags ORDER BY tag_name');
    return stmt.all().map(row => row.tag_name);
  }

  setTags(tenderId, tagsList) {
    // Удаляем старые теги
    const deleteStmt = this.db.prepare('DELETE FROM tags WHERE tender_id = ?');
    deleteStmt.run(tenderId);

    // Добавляем новые теги
    const insertStmt = this.db.prepare(`
      INSERT INTO tags (tender_id, tag_name) VALUES (?, ?)
    `);

    const transaction = this.db.transaction((tags) => {
      for (const tag of tags) {
        insertStmt.run(tenderId, tag);
      }
    });

    transaction(tagsList);
    return tagsList;
  }

  // ==================== НАПОМИНАНИЯ ====================

  getReminders(tenderId) {
    const stmt = this.db.prepare(`
      SELECT * FROM reminders WHERE tender_id = ? ORDER BY remind_before_days DESC
    `);
    return stmt.all(tenderId);
  }

  addReminder(tenderId, days) {
    const stmt = this.db.prepare(`
      INSERT INTO reminders (tender_id, remind_before_days) 
      VALUES (?, ?)
    `);
    return stmt.run(tenderId, days);
  }

  deleteReminders(tenderId) {
    const stmt = this.db.prepare('DELETE FROM reminders WHERE tender_id = ?');
    return stmt.run(tenderId);
  }

  getPendingReminders() {
    const stmt = this.db.prepare(`
      SELECT r.*, t.title, t.deadline 
      FROM reminders r 
      JOIN tenders t ON r.tender_id = t.id 
      WHERE r.notified = 0 
        AND t.deadline IS NOT NULL
        AND julianday(t.deadline) - julianday('now') <= r.remind_before_days
    `);
    return stmt.all();
  }

  markReminderNotified(reminderId) {
    const stmt = this.db.prepare('UPDATE reminders SET notified = 1 WHERE id = ?');
    return stmt.run(reminderId);
  }

  // ==================== ПРЕСЕТЫ ФИЛЬТРОВ ====================

  getFilterPresets() {
    const stmt = this.db.prepare('SELECT * FROM filter_presets');
    return stmt.all().map(row => ({
      name: row.name,
      filters: JSON.parse(row.filters),
      createdAt: row.created_at
    }));
  }

  saveFilterPreset(name, filters) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO filter_presets (name, filters, created_at) 
      VALUES (?, ?, datetime('now'))
    `);
    return stmt.run(name, JSON.stringify(filters));
  }

  deleteFilterPreset(name) {
    const stmt = this.db.prepare('DELETE FROM filter_presets WHERE name = ?');
    return stmt.run(name);
  }

  // ==================== СТАТИСТИКА ====================

  getStatistics() {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as total FROM tenders');
    const bySourceStmt = this.db.prepare(`
      SELECT source, COUNT(*) as count 
      FROM tenders 
      GROUP BY source 
      ORDER BY count DESC
    `);
    const byCategoryStmt = this.db.prepare(`
      SELECT category, COUNT(*) as count 
      FROM tenders 
      WHERE category IS NOT NULL 
      GROUP BY category 
      ORDER BY count DESC 
      LIMIT 10
    `);
    const favoritesCountStmt = this.db.prepare('SELECT COUNT(*) as count FROM favorites');

    return {
      total: totalStmt.get().total,
      bySource: bySourceStmt.all(),
      byCategory: byCategoryStmt.all(),
      favoritesCount: favoritesCountStmt.get().count
    };
  }

  // ==================== ЗАКРЫТИЕ БД ====================

  close() {
    this.db.close();
  }
}

module.exports = DatabaseService;
