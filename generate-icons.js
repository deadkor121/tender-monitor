// Скрипт для генерации иконок PWA
// Использует Canvas для создания простых иконок

const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, '../public/icons');

// Создаем директорию для иконок
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// SVG шаблон для иконки
const generateSVG = (size) => `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#grad)" rx="${size * 0.15}"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size * 0.5}" 
        font-weight="bold" fill="white" text-anchor="middle" dy="${size * 0.18}">T</text>
</svg>
`;

// Размеры иконок
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Генерируем SVG файлы (будут отображаться в браузерах, поддерживающих SVG)
sizes.forEach(size => {
  const svg = generateSVG(size);
  const filename = path.join(iconsDir, `icon-${size}x${size}.svg`);
  fs.writeFileSync(filename, svg);
  console.log(`✓ Создана иконка: icon-${size}x${size}.svg`);
});

// Создаем также PNG заглушки (для compatibility)
// В реальном проекте используйте sharp или jimp для конвертации SVG в PNG
const createPNGPlaceholder = (size) => {
  // Простой PNG 1x1 пиксель в base64 (будет растянут браузером)
  const base64PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const buffer = Buffer.from(base64PNG, 'base64');
  const filename = path.join(iconsDir, `icon-${size}x${size}.png`);
  fs.writeFileSync(filename, buffer);
};

sizes.forEach(size => {
  createPNGPlaceholder(size);
  console.log(`✓ Создан PNG: icon-${size}x${size}.png`);
});

console.log('\n✅ Все иконки созданы в папке public/icons/');
console.log('📝 Примечание: SVG иконки будут работать в большинстве браузеров.');
console.log('💡 Для production используйте реальные PNG иконки (можно создать через https://realfavicongenerator.net/)');
