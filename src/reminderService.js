const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');

class ReminderService {
  constructor(notificationService) {
    this.notificationService = notificationService;
    this.dataDir = path.join(__dirname, '../data');
    this.remindersFile = path.join(this.dataDir, 'reminders.json');
    this.sentRemindersFile = path.join(this.dataDir, 'sent_reminders.json');
    this.initialize();
  }

  async initialize() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Проверка напоминаний каждый день в 9:00
      cron.schedule('0 9 * * *', () => {
        this.checkReminders();
      });

      // Также проверяем каждый час
      cron.schedule('0 * * * *', () => {
        this.checkReminders();
      });

      console.log('[Reminders] Сервис напоминаний запущен');
    } catch (error) {
      console.error('[Reminders] Ошибка инициализации:', error);
    }
  }

  async getReminders() {
    try {
      const data = await fs.readFile(this.remindersFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  async saveReminders(reminders) {
    await fs.writeFile(this.remindersFile, JSON.stringify(reminders, null, 2));
  }

  async getSentReminders() {
    try {
      const data = await fs.readFile(this.sentRemindersFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  async saveSentReminders(sent) {
    await fs.writeFile(this.sentRemindersFile, JSON.stringify(sent, null, 2));
  }

  async setReminder(tenderId, daysBeforeList) {
    const reminders = await this.getReminders();
    reminders[tenderId] = {
      daysBeforeList,
      createdAt: new Date().toISOString()
    };
    await this.saveReminders(reminders);
    return true;
  }

  async removeReminder(tenderId) {
    const reminders = await this.getReminders();
    delete reminders[tenderId];
    await this.saveReminders(reminders);
    return true;
  }

  async checkReminders() {
    try {
      console.log('[Reminders] Проверка напоминаний о дедлайнах...');
      
      const reminders = await this.getReminders();
      const sentReminders = await this.getSentReminders();
      const now = new Date();
      
      // Загружаем все тендеры
      const tenders = await this.loadAllTenders();
      let sentCount = 0;

      for (const [tenderId, reminderData] of Object.entries(reminders)) {
        const tender = tenders.find(t => t.id === tenderId);
        if (!tender || !tender.deadline) continue;

        const deadline = new Date(tender.deadline);
        const daysUntilDeadline = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));

        // Проверяем каждый день из списка напоминаний
        for (const daysBefore of reminderData.daysBeforeList) {
          const reminderKey = `${tenderId}_${daysBefore}`;
          
          // Если уже отправляли это напоминание, пропускаем
          if (sentReminders[reminderKey]) continue;

          // Если пришло время напомнить
          if (daysUntilDeadline <= daysBefore && daysUntilDeadline > 0) {
            await this.sendReminderNotification(tender, daysUntilDeadline);
            sentReminders[reminderKey] = new Date().toISOString();
            sentCount++;
          }
        }
      }

      if (sentCount > 0) {
        await this.saveSentReminders(sentReminders);
        console.log(`[Reminders] Отправлено напоминаний: ${sentCount}`);
      } else {
        console.log('[Reminders] Напоминаний для отправки не найдено');
      }
    } catch (error) {
      console.error('[Reminders] Ошибка проверки напоминаний:', error);
    }
  }

  async loadAllTenders() {
    const dataDir = path.join(__dirname, '../data');
    const files = ['tenders.json', 'doffin_tenders.json', 'ted_tenders.json', 'mercell_tenders.json'];
    let allTenders = [];

    for (const file of files) {
      try {
        const data = await fs.readFile(path.join(dataDir, file), 'utf8');
        const tenders = JSON.parse(data);
        allTenders.push(...tenders);
      } catch (e) { /* файл не существует */ }
    }

    return allTenders;
  }

  async sendReminderNotification(tender, daysLeft) {
    const message = `⏰ Напоминание о дедлайне!\n\n` +
      `Тендер: ${tender.title}\n` +
      `Осталось дней: ${daysLeft}\n` +
      `Дедлайн: ${tender.deadline}\n` +
      `Ссылка: ${tender.link}`;

    if (this.notificationService) {
      await this.notificationService.sendTelegram(
        `⏰ Напоминание: осталось ${daysLeft} ${this.getDaysWord(daysLeft)}`,
        message
      );
    }
  }

  getDaysWord(days) {
    if (days === 1) return 'день';
    if (days >= 2 && days <= 4) return 'дня';
    return 'дней';
  }

  getUrgencyLevel(deadline) {
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const daysLeft = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));

    if (daysLeft <= 3) return 'urgent';
    if (daysLeft <= 7) return 'warning';
    return 'normal';
  }
}

module.exports = ReminderService;
