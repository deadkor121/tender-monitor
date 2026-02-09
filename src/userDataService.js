const DatabaseService = require('./databaseService');

class UserDataService {
  constructor(db) {
    // Если передана БД, используем её, иначе создаём новую
    this.db = db || new DatabaseService();
  }

  // ==================== ИЗБРАННОЕ ====================
  
  async getFavorites() {
    try {
      const favorites = await this.db.getFavorites();
      // Преобразуем в формат { tenderId: tender }
      const result = {};
      favorites.forEach(tender => {
        result[tender.id] = tender;
      });
      return result;
    } catch (error) {
      console.error('Ошибка получения избранного:', error);
      return {};
    }
  }

  async addFavorite(tenderId, tender) {
    try {
      // Сначала сохраняем тендер в БД
      await this.db.saveTender(tender);
      // Добавляем в избранное
      await this.db.addFavorite(tenderId);
      // Возвращаем обновленный список
      return await this.getFavorites();
    } catch (error) {
      console.error('Ошибка добавления в избранное:', error);
      throw error;
    }
  }

  async removeFavorite(tenderId) {
    try {
      await this.db.removeFavorite(tenderId);
      return await this.getFavorites();
    } catch (error) {
      console.error('Ошибка удаления из избранного:', error);
      throw error;
    }
  }

  // ==================== ИСТОРИЯ ПРОСМОТРОВ ====================
  
  async getViewed() {
    try {
      const viewed = await this.db.getViewed();
      // Преобразуем в формат { tenderId: timestamp }
      const result = {};
      viewed.forEach(item => {
        result[item.tender_id] = item.viewed_at;
      });
      return result;
    } catch (error) {
      console.error('Ошибка получения просмотренных:', error);
      return {};
    }
  }

  async markAsViewed(tenderId) {
    try {
      await this.db.markAsViewed(tenderId);
      return await this.getViewed();
    } catch (error) {
      console.error('Ошибка отметки просмотра:', error);
      throw error;
    }
  }

  // ==================== ЗАМЕТКИ ====================
  
  async getNotes() {
    try {
      const notes = await this.db.getNotes();
      // Преобразуем в формат { tenderId: { text, updatedAt } }
      const result = {};
      notes.forEach(note => {
        result[note.tender_id] = {
          text: note.note_text,
          updatedAt: note.updated_at
        };
      });
      return result;
    } catch (error) {
      console.error('Ошибка получения заметок:', error);
      return {};
    }
  }

  async addNote(tenderId, note) {
    try {
      await this.db.addNote(tenderId, note);
      return await this.getNotes();
    } catch (error) {
      console.error('Ошибка добавления заметки:', error);
      throw error;
    }
  }

  async deleteNote(tenderId) {
    try {
      await this.db.deleteNote(tenderId);
      return await this.getNotes();
    } catch (error) {
      console.error('Ошибка удаления заметки:', error);
      throw error;
    }
  }

  // ==================== СТАТУСЫ ТЕНДЕРОВ ====================
  
  async getStatuses() {
    try {
      const statuses = await this.db.getStatuses();
      // Преобразуем в формат { tenderId: { status, updatedAt } }
      const result = {};
      statuses.forEach(item => {
        result[item.tender_id] = {
          status: item.status,
          updatedAt: item.updated_at
        };
      });
      return result;
    } catch (error) {
      console.error('Ошибка получения статусов:', error);
      return {};
    }
  }

  async setStatus(tenderId, status) {
    try {
      await this.db.setStatus(tenderId, status);
      return await this.getStatuses();
    } catch (error) {
      console.error('Ошибка установки статуса:', error);
      throw error;
    }
  }

  // ==================== ПОЛУЧИТЬ ВСЕ ДАННЫЕ ДЛЯ ТЕНДЕРА ====================
  
  async getTenderData(tenderId) {
    try {
      const viewed = await this.db.getViewed();
      return {
        isFavorite: await this.db.isFavorite(tenderId),
        isViewed: !!viewed.find(v => v.tender_id === tenderId),
        note: await this.db.getNotes().then(notes => notes.find(n => n.tender_id === tenderId)),
        status: await this.db.getStatuses().then(st => st.find(s => s.tender_id === tenderId)),
        priority: await this.db.getPriorities().then(pr => pr.find(p => p.tender_id === tenderId)?.priority || 'medium'),
        tags: await this.db.getTags().then(tags => tags.filter(t => t.tender_id === tenderId).map(t => t.tag_name))
      };
    } catch (error) {
      console.error('Ошибка получения данных тендера:', error);
      return {
        isFavorite: false,
        isViewed: false,
        note: null,
        status: null,
        priority: 'medium',
        tags: []
      };
    }
  }

  // ==================== ТЕГИ ====================
  
  async getTags(tenderId) {
    try {
      const allTags = await this.db.getTags();
      return allTags.filter(t => t.tender_id === tenderId).map(t => t.tag_name);
    } catch (error) {
      console.error('Ошибка получения тегов:', error);
      return [];
    }
  }

  async setTags(tenderId, tagsList) {
    try {
      // Сначала удаляем все старые теги
      const currentTags = await this.getTags(tenderId);
      for (const tag of currentTags) {
        await this.db.removeTag(tenderId, tag);
      }
      // Добавляем новые
      for (const tag of tagsList) {
        await this.db.addTag(tenderId, tag);
      }
      return { [tenderId]: tagsList };
    } catch (error) {
      console.error('Ошибка установки тегов:', error);
      throw error;
    }
  }

  async getAllTags() {
    try {
      return await this.db.getAllTags();
    } catch (error) {
      console.error('Ошибка получения всех тегов:', error);
      return [];
    }
  }

  // ==================== ПРИОРИТЕТЫ ====================
  
  async getPriority(tenderId) {
    try {
      return await this.db.getPriority(tenderId);
    } catch (error) {
      console.error('Ошибка получения приоритета:', error);
      return 'medium';
    }
  }

  async setPriority(tenderId, priority) {
    try {
      await this.db.setPriority(tenderId, priority);
      return { [tenderId]: priority };
    } catch (error) {
      console.error('Ошибка установки приоритета:', error);
      throw error;
    }
  }

  // ==================== ПРЕСЕТЫ ФИЛЬТРОВ ====================
  
  async getFilterPresets() {
    try {
      const presets = await this.db.getFilterPresets();
      // Преобразуем в формат { name: { filters, createdAt } }
      const result = {};
      presets.forEach(preset => {
        result[preset.name] = {
          filters: typeof preset.filters === 'string' ? JSON.parse(preset.filters) : preset.filters,
          createdAt: preset.created_at
        };
      });
      return result;
    } catch (error) {
      console.error('Ошибка получения пресетов:', error);
      return {};
    }
  }

  async saveFilterPreset(name, filters) {
    try {
      this.db.saveFilterPreset(name, filters);
      return await this.getFilterPresets();
    } catch (error) {
      console.error('Ошибка сохранения пресета:', error);
      throw error;
    }
  }

  async deleteFilterPreset(name) {
    try {
      this.db.deleteFilterPreset(name);
      return await this.getFilterPresets();
    } catch (error) {
      console.error('Ошибка удаления пресета:', error);
      throw error;
    }
  }
}

module.exports = UserDataService;
