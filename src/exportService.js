const ExcelJS = require('exceljs');
const { Parser } = require('json2csv');

class ExportService {
  async exportToExcel(tenders) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Тендеры');

    // Заголовки
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 30 },
      { header: 'Название', key: 'title', width: 50 },
      { header: 'Категория', key: 'category', width: 20 },
      { header: 'Описание', key: 'description', width: 60 },
      { header: 'Сумма', key: 'amount', width: 15 },
      { header: 'Опубликовано', key: 'published', width: 15 },
      { header: 'Дедлайн', key: 'deadline', width: 15 },
      { header: 'Источник', key: 'source', width: 15 },
      { header: 'Ссылка', key: 'link', width: 50 },
      { header: 'Дата парсинга', key: 'scrapedAt', width: 20 }
    ];

    // Данные
    tenders.forEach(tender => {
      worksheet.addRow({
        id: tender.id,
        title: tender.title,
        category: tender.category || '',
        description: tender.description || '',
        amount: tender.amount || '',
        published: tender.published || '',
        deadline: tender.deadline || '',
        source: tender.source || '',
        link: tender.link || '',
        scrapedAt: tender.scrapedAt || ''
      });
    });

    // Стили
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF667EEA' }
    };
    worksheet.getRow(1).font.color = { argb: 'FFFFFFFF' };

    return await workbook.xlsx.writeBuffer();
  }

  exportToCSV(tenders) {
    const fields = [
      'id', 'title', 'category', 'description', 'amount',
      'published', 'deadline', 'source', 'link', 'scrapedAt'
    ];
    const parser = new Parser({ fields, delimiter: ';' });
    return parser.parse(tenders);
  }

  exportToJSON(tenders) {
    return JSON.stringify(tenders, null, 2);
  }
}

module.exports = ExportService;
