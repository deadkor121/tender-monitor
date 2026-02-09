const nodemailer = require('nodemailer');
const TelegramBot = require('node-telegram-bot-api');

class NotificationService {
  constructor() {
    this.emailEnabled = process.env.EMAIL_ENABLED === 'true';
    this.telegramEnabled = process.env.TELEGRAM_ENABLED === 'true';
    
    // Email setup
    if (this.emailEnabled) {
      this.emailTransporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        }
      });
    }
    
    // Telegram setup
    if (this.telegramEnabled && process.env.TELEGRAM_BOT_TOKEN) {
      this.telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
      this.telegramChatId = process.env.TELEGRAM_CHAT_ID;
    }
  }

  async sendEmail(subject, html) {
    if (!this.emailEnabled || !this.emailTransporter) return;
    
    try {
      await this.emailTransporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_RECIPIENT,
        subject,
        html
      });
      console.log(`[Email] Отправлено: ${subject}`);
    } catch (error) {
      console.error('[Email] Ошибка:', error.message);
    }
  }

  async sendTelegram(message) {
    if (!this.telegramEnabled || !this.telegramBot || !this.telegramChatId) return;
    
    try {
      await this.telegramBot.sendMessage(this.telegramChatId, message, { parse_mode: 'HTML' });
      console.log('[Telegram] Сообщение отправлено');
    } catch (error) {
      console.error('[Telegram] Ошибка:', error.message);
    }
  }

  async notifyNewTenders(tenders, source) {
    if (tenders.length === 0) return;

    const sourceName = { anbud: 'Anbud', doffin: 'Doffin', ted: 'TED', mercell: 'Mercell' }[source] || source;
    
    // Email уведомление
    if (this.emailEnabled) {
      const subject = `🔔 ${tenders.length} новых тендеров из ${sourceName}`;
      const html = `
        <h2>Новые тендеры - ${sourceName}</h2>
        <p>Найдено тендеров: <strong>${tenders.length}</strong></p>
        <hr>
        ${tenders.slice(0, 10).map(t => `
          <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 8px;">
            <h3>${t.title}</h3>
            <p><strong>Категория:</strong> ${t.category || 'N/A'}</p>
            <p><strong>Сумма:</strong> ${t.amount || 'N/A'}</p>
            <p><strong>Дедлайн:</strong> ${t.deadline || 'N/A'}</p>
            ${t.link ? `<a href="${t.link}" style="color: #667eea;">Открыть тендер →</a>` : ''}
          </div>
        `).join('')}
        ${tenders.length > 10 ? `<p><em>... и еще ${tenders.length - 10} тендеров</em></p>` : ''}
        <p><a href="http://localhost:3000" style="color: #667eea;">Открыть мониторинг →</a></p>
      `;
      await this.sendEmail(subject, html);
    }

    // Telegram уведомление
    if (this.telegramEnabled) {
      const message = `
🔔 <b>Новые тендеры - ${sourceName}</b>

Найдено: <b>${tenders.length}</b> тендеров

${tenders.slice(0, 5).map((t, i) => `
${i + 1}. <b>${t.title.substring(0, 80)}${t.title.length > 80 ? '...' : ''}</b>
   💰 ${t.amount || 'N/A'} | 📅 ${t.deadline || 'N/A'}
   ${t.link || ''}
`).join('\n')}
${tenders.length > 5 ? `\n... и еще ${tenders.length - 5} тендеров` : ''}

<a href="http://localhost:3000">Открыть мониторинг</a>
      `.trim();
      await this.sendTelegram(message);
    }
  }

  async notifyError(source, error) {
    const message = `⚠️ Ошибка парсинга ${source}: ${error}`;
    await this.sendTelegram(message);
  }
}

module.exports = NotificationService;
