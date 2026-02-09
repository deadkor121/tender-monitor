const { Pool } = require('pg');

class PostgresService {
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'tender_monitor',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || ''
    });

    // Проверяем подключение
    this.pool.on('error', (err) => {
      console.error('❌ Ошибка PostgreSQL:', err);
    });
  }

  async saveTenders(tenders) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      for (const tender of tenders) {
        await client.query(`
          INSERT INTO tenders (id, title, description, category, deadline, link, source, scraped_at, price, location, contractor)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            category = EXCLUDED.category,
            deadline = EXCLUDED.deadline,
            price = EXCLUDED.price,
            location = EXCLUDED.location,
            contractor = EXCLUDED.contractor,
            scraped_at = EXCLUDED.scraped_at
        `, [
          tender.id,
          tender.title,
          tender.description,
          tender.category,
          tender.deadline,
          tender.link,
          tender.source,
          tender.scrapedAt || new Date().toISOString(),
          tender.price,
          tender.location,
          tender.contractor
        ]);
      }
      
      await client.query('COMMIT');
      console.log(`✅ Сохранено ${tenders.length} тендеров в PostgreSQL`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Ошибка сохранения:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  async getTenders(filters = {}) {
    let query = 'SELECT * FROM tenders WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.source) {
      query += ` AND source = $${paramIndex}`;
      params.push(filters.source);
      paramIndex++;
    }

    if (filters.search) {
      query += ` AND (title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    if (filters.category) {
      query += ` AND category = $${paramIndex}`;
      params.push(filters.category);
      paramIndex++;
    }

    query += ' ORDER BY scraped_at DESC';

    if (filters.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
    }

    const result = await this.pool.query(query, params);
    return result.rows.map(row => ({
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
    }));
  }

  async getTenderById(id) {
    const result = await this.pool.query('SELECT * FROM tenders WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
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

  async getFavorites() {
    const result = await this.pool.query(`
      SELECT t.*, f.favorited_at 
      FROM tenders t
      JOIN favorites f ON t.id = f.tender_id
      ORDER BY f.favorited_at DESC
    `);
    
    return result.rows.map(row => ({
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
      contractor: row.contractor,
      favoritedAt: row.favorited_at
    }));
  }

  async addFavorite(tenderId) {
    await this.pool.query(
      'INSERT INTO favorites (tender_id) VALUES ($1) ON CONFLICT (tender_id) DO NOTHING',
      [tenderId]
    );
  }

  async removeFavorite(tenderId) {
    await this.pool.query('DELETE FROM favorites WHERE tender_id = $1', [tenderId]);
  }

  async isFavorite(tenderId) {
    const result = await this.pool.query(
      'SELECT 1 FROM favorites WHERE tender_id = $1',
      [tenderId]
    );
    return result.rows.length > 0;
  }

  async saveTender(tender) {
    await this.pool.query(`
      INSERT INTO tenders (id, title, description, category, deadline, link, source, scraped_at, price, location, contractor)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        category = EXCLUDED.category,
        deadline = EXCLUDED.deadline,
        price = EXCLUDED.price,
        location = EXCLUDED.location,
        contractor = EXCLUDED.contractor
    `, [
      tender.id,
      tender.title,
      tender.description,
      tender.category,
      tender.deadline,
      tender.link,
      tender.source,
      tender.scrapedAt || new Date().toISOString(),
      tender.price,
      tender.location,
      tender.contractor
    ]);
  }

  async getViewed() {
    const result = await this.pool.query('SELECT * FROM viewed ORDER BY viewed_at DESC');
    return result.rows;
  }

  async markAsViewed(tenderId) {
    await this.pool.query(
      'INSERT INTO viewed (tender_id) VALUES ($1) ON CONFLICT (tender_id) DO UPDATE SET viewed_at = CURRENT_TIMESTAMP',
      [tenderId]
    );
  }

  async getNotes() {
    const result = await this.pool.query('SELECT * FROM notes');
    return result.rows;
  }

  async addNote(tenderId, noteText) {
    await this.pool.query(
      'INSERT INTO notes (tender_id, note_text) VALUES ($1, $2) ON CONFLICT (tender_id) DO UPDATE SET note_text = EXCLUDED.note_text, updated_at = CURRENT_TIMESTAMP',
      [tenderId, noteText]
    );
  }

  async deleteNote(tenderId) {
    await this.pool.query('DELETE FROM notes WHERE tender_id = $1', [tenderId]);
  }

  async getStatuses() {
    const result = await this.pool.query('SELECT * FROM tender_statuses');
    return result.rows;
  }

  async setStatus(tenderId, status) {
    await this.pool.query(
      'INSERT INTO tender_statuses (tender_id, status) VALUES ($1, $2) ON CONFLICT (tender_id) DO UPDATE SET status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP',
      [tenderId, status]
    );
  }

  async getPriorities() {
    const result = await this.pool.query('SELECT * FROM priorities');
    return result.rows;
  }

  async getPriority(tenderId) {
    const result = await this.pool.query('SELECT priority FROM priorities WHERE tender_id = $1', [tenderId]);
    return result.rows.length > 0 ? result.rows[0].priority : 'medium';
  }

  async setPriority(tenderId, priority) {
    await this.pool.query(
      'INSERT INTO priorities (tender_id, priority) VALUES ($1, $2) ON CONFLICT (tender_id) DO UPDATE SET priority = EXCLUDED.priority, updated_at = CURRENT_TIMESTAMP',
      [tenderId, priority]
    );
  }

  async getTags() {
    const result = await this.pool.query('SELECT * FROM tags ORDER BY tag_name');
    return result.rows;
  }

  async addTag(tenderId, tagName) {
    await this.pool.query(
      'INSERT INTO tags (tender_id, tag_name) VALUES ($1, $2) ON CONFLICT (tender_id, tag_name) DO NOTHING',
      [tenderId, tagName]
    );
  }

  async removeTag(tenderId, tagName) {
    await this.pool.query('DELETE FROM tags WHERE tender_id = $1 AND tag_name = $2', [tenderId, tagName]);
  }

  async getAllTags() {
    const result = await this.pool.query('SELECT DISTINCT tag_name FROM tags ORDER BY tag_name');
    return result.rows.map(row => row.tag_name);
  }

  async getFilterPresets() {
    const result = await this.pool.query('SELECT * FROM filter_presets ORDER BY name');
    return result.rows;
  }

  async saveFilterPreset(name, filters) {
    await this.pool.query(
      'INSERT INTO filter_presets (name, filters) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET filters = EXCLUDED.filters',
      [name, JSON.stringify(filters)]
    );
  }

  async deleteFilterPreset(name) {
    await this.pool.query('DELETE FROM filter_presets WHERE name = $1', [name]);
  }

  async getStatistics() {
    const totalResult = await this.pool.query('SELECT COUNT(*) FROM tenders');
    const bySourceResult = await this.pool.query(`
      SELECT source, COUNT(*) as count 
      FROM tenders 
      GROUP BY source 
      ORDER BY count DESC
    `);
    const favoritesResult = await this.pool.query('SELECT COUNT(*) FROM favorites');
    const recentResult = await this.pool.query(`
      SELECT COUNT(*) FROM tenders 
      WHERE scraped_at >= NOW() - INTERVAL '24 hours'
    `);

    return {
      total: parseInt(totalResult.rows[0].count),
      bySource: bySourceResult.rows.reduce((acc, row) => {
        acc[row.source] = parseInt(row.count);
        return acc;
      }, {}),
      favorites: parseInt(favoritesResult.rows[0].count),
      recent24h: parseInt(recentResult.rows[0].count)
    };
  }

  async search(searchTerm) {
    const result = await this.pool.query(`
      SELECT * FROM tenders
      WHERE title ILIKE $1 OR description ILIKE $1
      ORDER BY scraped_at DESC
      LIMIT 100
    `, [`%${searchTerm}%`]);

    return result.rows.map(row => ({
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
    }));
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = PostgresService;
