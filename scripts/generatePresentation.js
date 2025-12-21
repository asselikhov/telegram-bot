const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Определяем путь к системному шрифту Windows (Arial поддерживает кириллицу)
let fontPath = null;
if (process.platform === 'win32') {
    // Стандартные пути к шрифтам Windows
    const windir = process.env.WINDIR || process.env.windir || 'C:/Windows';
    const possiblePaths = [
        path.join(windir, 'Fonts', 'arial.ttf'),
        path.join(windir, 'Fonts', 'ARIAL.TTF'),
        'C:/Windows/Fonts/arial.ttf',
        'C:/Windows/Fonts/ARIAL.TTF'
    ];
    
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            fontPath = p;
            console.log(`Используется шрифт: ${fontPath}`);
            break;
        }
    }
}

// Создаем PDF документ
const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 70, left: 50, right: 50 },
    autoFirstPage: true
});

// Регистрируем шрифты для кириллицы
if (fontPath && fs.existsSync(fontPath)) {
    // Используем системный шрифт Arial для кириллицы
    doc.registerFont('default', fontPath);
    doc.registerFont('bold', fontPath);
    doc.registerFont('italic', fontPath);
} else {
    // Если шрифт не найден, используем стандартные (может не работать с кириллицей)
    console.warn('Предупреждение: Системный шрифт Arial не найден. Кириллица может отображаться некорректно.');
    doc.registerFont('default', 'Helvetica');
    doc.registerFont('bold', 'Helvetica-Bold');
    doc.registerFont('italic', 'Helvetica-Oblique');
}

// Путь для сохранения файла
const timestamp = new Date().getTime();
const outputPath = path.join(__dirname, '..', `presentation_${timestamp}.pdf`);
const finalPath = path.join(__dirname, '..', 'presentation.pdf');

// Создаем поток для записи файла
const stream = fs.createWriteStream(outputPath);
doc.pipe(stream);

// Цвета
const primaryColor = '#2C3E50';
const secondaryColor = '#3498DB';
const accentColor = '#E74C3C';
const textColor = '#34495E';
const lightGray = '#ECF0F1';

let pageNumber = 1;

// Функция для заголовка
function addTitle(text, fontSize = 28) {
    // Фоновая линия под заголовком
    const yPos = doc.y;
    doc.moveDown(0.3);
    doc.rect(50, doc.y - 5, doc.page.width - 100, 3)
       .fill(secondaryColor);
    doc.y = yPos;
    
    doc.fontSize(fontSize)
       .fillColor(primaryColor)
       .font('bold')
       .text(text, { align: 'center' })
       .moveDown(1);
}

// Функция для подзаголовка
function addSubtitle(text, fontSize = 18) {
    const yPos = doc.y;
    doc.moveDown(0.2);
    
    doc.fontSize(fontSize)
       .fillColor(secondaryColor)
       .font('bold')
       .text(text, { align: 'left' });
    
    // Подчеркивание для подзаголовка
    const textWidth = doc.widthOfString(text, { font: 'bold', fontSize: fontSize });
    doc.rect(50, doc.y + 2, textWidth + 5, 1.5)
       .fill(secondaryColor);
    
    doc.moveDown(0.7);
}

// Функция для обычного текста
function addText(text, fontSize = 12, options = {}) {
    doc.fontSize(fontSize)
       .fillColor(textColor)
       .font('default')
       .text(text, { ...options, lineGap: 2 })
       .moveDown(0.4);
}

// Функция для выделенного текста (важная информация)
function addHighlightedText(text, fontSize = 11) {
    const oldX = doc.x;
    const oldY = doc.y;
    
    // Фоновая рамка
    const padding = 10;
    const textWidth = doc.widthOfString(text, { font: 'bold', fontSize: fontSize });
    const boxWidth = Math.min(textWidth + padding * 2, doc.page.width - 100);
    const boxHeight = fontSize * 1.5 + padding;
    
    doc.rect(50, oldY - padding / 2, boxWidth, boxHeight)
       .fill('#FFF9E6')
       .stroke('#FFD700');
    
    doc.fontSize(fontSize)
       .fillColor('#B8860B')
       .font('bold')
       .text(text, 50 + padding, oldY, { width: boxWidth - padding * 2 });
    
    doc.moveDown(0.5);
}

// Функция для маркированного списка
function addBulletPoint(text, fontSize = 11, indent = 0) {
    const x = 50 + indent;
    const y = doc.y;
    
    // Маркер
    doc.circle(x + 5, y + 4, 3)
       .fill(secondaryColor);
    
    // Текст
    doc.fontSize(fontSize)
       .fillColor(textColor)
       .font('default')
       .text(text, x + 15, y - 2, { width: doc.page.width - x - 65, lineGap: 2 })
       .moveDown(0.3);
}

// Функция для нумерованного списка
function addNumberedItem(number, text, fontSize = 11) {
    const x = doc.x;
    const y = doc.y;
    
    // Номер в кружке
    doc.circle(x + 10, y + 4, 8)
       .fill(secondaryColor);
    
    doc.fontSize(fontSize - 1)
       .fillColor('#FFFFFF')
       .font('bold')
       .text(number.toString(), x + 6, y, { width: 20, align: 'center' });
    
    // Текст
    doc.fontSize(fontSize)
       .fillColor(textColor)
       .font('default')
       .text(text, x + 25, y - 2, { width: 500, align: 'left' })
       .moveDown(0.5);
}

// Функция для добавления новой страницы с номером
function addPageWithNumber() {
    if (pageNumber > 1) {
        // Добавляем номер страницы на текущую страницу
        const oldY = doc.y;
        doc.fontSize(10)
           .fillColor('#95A5A6')
           .font('default')
           .text(`Страница ${pageNumber}`, 50, doc.page.height - 30, { align: 'center', width: doc.page.width - 100 });
        doc.y = oldY;
    }
    pageNumber++;
    doc.addPage();
}

// Титульная страница
// Градиентный фон
doc.rect(0, 0, doc.page.width, doc.page.height)
   .fill(lightGray);

// Верхняя полоса
doc.rect(0, 0, doc.page.width, 80)
   .fill(secondaryColor);

doc.y = 100;

// Основной заголовок
doc.fontSize(36)
   .fillColor(primaryColor)
   .font('bold')
   .text('ИНСТРУКЦИЯ ПО РАБОТЕ', { align: 'center' })
   .moveDown(0.5);

doc.fontSize(36)
   .fillColor(primaryColor)
   .font('bold')
   .text('С TELEGRAM БОТОМ', { align: 'center' })
   .moveDown(2);

// Подзаголовок
doc.fontSize(18)
   .fillColor(textColor)
   .font('bold')
   .text('Руководство пользователя', { align: 'center' })
   .moveDown(1);

doc.fontSize(14)
   .fillColor('#7F8C8D')
   .font('default')
   .text('Регистрация, создание и выгрузка отчетов', { align: 'center' })
   .moveDown(3);

// Разделительная линия
doc.rect(100, doc.y, doc.page.width - 200, 2)
   .fill(secondaryColor);

doc.y = doc.page.height - 150;
doc.fontSize(12)
   .fillColor('#7F8C8D')
   .font('default')
   .text(new Date().getFullYear().toString(), { align: 'center' });

addPageWithNumber();

// Содержание
addTitle('Содержание', 24);
doc.moveDown(1);

addNumberedItem('1', 'Регистрация в боте', 14);
addNumberedItem('2', 'Создание отчета', 14);
addNumberedItem('3', 'Выгрузка отчетов', 14);
addNumberedItem('4', 'Просмотр и редактирование отчетов', 14);

addPageWithNumber();

// Раздел 1: Регистрация
addTitle('1. Регистрация в боте', 24);
doc.moveDown(1);

addSubtitle('Шаг 1: Получение пригласительного кода', 16);
addText('Для начала работы с ботом вам понадобится пригласительный код. Его может предоставить администратор вашей организации.', 11);
doc.moveDown(0.5);

addSubtitle('Шаг 2: Запуск бота', 16);
addText('1. Найдите бота в Telegram', 11, { indent: 20 });
addText('2. Нажмите кнопку "START" или отправьте команду /start', 11, { indent: 20 });
doc.moveDown(0.5);

addSubtitle('Шаг 3: Ввод пригласительного кода', 16);
addText('Бот попросит вас ввести пригласительный код. Скопируйте и отправьте код, который вам предоставил администратор.', 11);
doc.moveDown(0.5);

addSubtitle('Шаг 4: Выбор объектов', 16);
addText('После успешного ввода кода бот предложит выбрать объекты, с которыми вы работаете. Выберите нужные объекты из предложенного списка.', 11);
doc.moveDown(0.5);

addSubtitle('Шаг 5: Выбор должности', 16);
addText('Затем выберите вашу должность из списка должностей вашей организации.', 11);
doc.moveDown(0.5);

addSubtitle('Шаг 6: Ввод персональных данных', 16);
addText('Вам будет предложено ввести:', 11);
addBulletPoint('ФИО (полное имя)', 11, 0);
addBulletPoint('Контактный телефон', 11, 0);
doc.moveDown(0.5);

addSubtitle('Шаг 7: Ожидание одобрения', 16);
addText('После заполнения всех данных ваша заявка будет отправлена администратору на рассмотрение. Дождитесь одобрения, после чего вы сможете полноценно работать с ботом.', 11);

addPageWithNumber();

// Раздел 2: Создание отчета
addTitle('2. Создание отчета', 24);
doc.moveDown(1);

addSubtitle('Важное условие', 16);
addHighlightedText('Примечание: Кнопка "Создать отчет" доступна только пользователям, которые указаны администратором в настройках отчетов для конкретных объектов.');

doc.fontSize(11)
   .fillColor(textColor)
   .font('default');

addSubtitle('Шаг 1: Открытие главного меню', 16);
addText('После одобрения заявки администратором, при запуске бота вы увидите главное меню с доступными опциями.', 11);
doc.moveDown(0.5);

addSubtitle('Шаг 2: Выбор создания отчета', 16);
addText('Нажмите на кнопку "Создать отчет" в главном меню.', 11);
doc.moveDown(0.5);

addSubtitle('Шаг 3: Выбор объекта', 16);
addText('Из списка доступных объектов выберите тот, по которому вы хотите создать отчет.', 11);
doc.moveDown(0.5);

addSubtitle('Шаг 4: Ввод информации о выполненных работах', 16);
addText('Бот попросит вас ввести информацию о выполненных работах. Опишите детально, что было сделано на объекте.', 11);
doc.fontSize(10)
   .fillColor('#7F8C8D')
   .font('italic')
   .text('Пример: "Выполнена укладка асфальта на участке 100-150 метров. Проведена разметка дорожного полотна."', { indent: 20, encoding: 'UTF-8' });
doc.moveDown(0.3);
doc.fontSize(11)
   .fillColor(textColor)
   .font('default');
doc.moveDown(0.5);

addSubtitle('Шаг 5: Ввод информации о материалах', 16);
addText('Затем укажите информацию о поставленных материалах.', 11);
doc.fontSize(10)
   .fillColor('#7F8C8D')
   .font('italic')
   .text('Пример: "Поставлено: асфальт - 50 тонн, щебень - 30 тонн"', { indent: 20, encoding: 'UTF-8' });
doc.moveDown(0.3);
doc.fontSize(11)
   .fillColor(textColor)
   .font('default');
doc.moveDown(0.5);

addSubtitle('Шаг 6: Прикрепление фотографий (опционально)', 16);
addText('При необходимости прикрепите фотографии к отчету. Можно прикрепить несколько фотографий.', 11);
addText('После прикрепления всех фотографий нажмите кнопку "Готово".', 11, { indent: 20 });
doc.moveDown(0.5);

addSubtitle('Шаг 7: Завершение создания отчета', 16);
addText('После завершения всех шагов отчет будет создан и сохранен в системе. Вы получите подтверждение об успешном создании отчета.', 11);

addPageWithNumber();

// Раздел 3: Выгрузка отчетов
addTitle('3. Выгрузка отчетов', 24);
doc.moveDown(1);

addSubtitle('Доступ к выгрузке', 16);
addText('Функция выгрузки отчетов доступна всем одобренным пользователям.', 11);
doc.moveDown(0.5);

addSubtitle('Шаг 1: Открытие меню выгрузки', 16);
addText('В главном меню нажмите кнопку "Выгрузить".', 11);
doc.moveDown(0.5);

addSubtitle('Шаг 2: Выбор типа выгрузки', 16);
addText('Выберите, что вы хотите выгрузить:', 11);
addBulletPoint('Отчеты - для выгрузки отчетов по объектам', 11, 0);
addBulletPoint('Люди - для выгрузки списка пользователей по объекту', 11, 0);
doc.moveDown(0.5);

addSubtitle('Шаг 3: Выбор объекта', 16);
addText('Выберите объект из списка объектов вашей организации. Список может быть разбит на страницы - используйте кнопки навигации для просмотра.', 11);
doc.moveDown(0.5);

addSubtitle('Шаг 4: Получение файла', 16);
addText('После выбора объекта бот автоматически сформирует Excel файл (.xlsx) с данными и отправит его вам.', 11);
addText('Файл будет содержать:', 11, { indent: 20 });
addBulletPoint('Для отчетов: дату, исполнителя, выполненные работы, материалы, количество фото с ссылками', 10, 20);
addBulletPoint('Для людей: должность, организацию, ФИО, телефон, дату рождения, статус', 10, 20);
doc.moveDown(0.5);

addSubtitle('Шаг 5: Сохранение файла', 16);
addText('Откройте полученный файл в Telegram и сохраните его на ваше устройство для дальнейшего использования.', 11);

addPageWithNumber();

// Раздел 4: Просмотр и редактирование отчетов
addTitle('4. Просмотр и редактирование отчетов', 24);
doc.moveDown(1);

addSubtitle('Просмотр своих отчетов', 16);
addText('Для просмотра ваших отчетов:', 11);
addNumberedItem('1', 'Откройте главное меню', 11);
addNumberedItem('2', 'Нажмите "Личный кабинет"', 11);
addNumberedItem('3', 'Выберите "Посмотреть мои отчеты"', 11);
addNumberedItem('4', 'Выберите объект из списка', 11);
addNumberedItem('5', 'Выберите дату для просмотра отчетов за этот день', 11);
addNumberedItem('6', 'Выберите конкретный отчет из списка', 11);
doc.moveDown(0.5);

addSubtitle('Редактирование отчета', 16);
addText('Для редактирования существующего отчета:', 11);
addNumberedItem('1', 'Откройте отчет, который хотите отредактировать (см. "Просмотр своих отчетов")', 11);
addNumberedItem('2', 'Нажмите кнопку "Редактировать"', 11);
addText('3. Следуйте инструкциям бота для изменения данных:', 11, { indent: 20 });
addBulletPoint('Измените информацию о выполненных работах', 10, 20);
addBulletPoint('Измените информацию о материалах', 10, 20);
addBulletPoint('При необходимости обновите фотографии (можно удалить все или добавить новые)', 10, 20);
addNumberedItem('4', 'Нажмите "Готово" для сохранения изменений', 11);
doc.moveDown(0.5);

addSubtitle('Информация в отчете', 16);
addText('Каждый отчет содержит:', 11);
addBulletPoint('Дата отчета', 11, 0);
addBulletPoint('Название объекта', 11, 0);
addBulletPoint('ФИО исполнителя', 11, 0);
addBulletPoint('Выполненные работы', 11, 0);
addBulletPoint('Поставленные материалы', 11, 0);
addBulletPoint('Фотографии (если были прикреплены)', 11, 0);
addBulletPoint('Время создания отчета', 11, 0);

addPageWithNumber();

// Дополнительная информация
addTitle('Дополнительная информация', 24);
doc.moveDown(1);

addSubtitle('Личный кабинет', 16);
addText('В личном кабинете вы можете:', 11);
addBulletPoint('Просмотреть свою информацию (должность, организацию, объекты, статус)', 11, 0);
addBulletPoint('Изменить свои данные (ФИО, должность, организацию, телефон, объекты, статус)', 11, 0);
addBulletPoint('Посмотреть свои отчеты', 11, 0);
addBulletPoint('Сгенерировать пригласительный код для других пользователей', 11, 0);
doc.moveDown(0.5);

addSubtitle('Пригласительные коды', 16);
addText('Одобренные пользователи могут создавать пригласительные коды для регистрации новых пользователей в своей организации.', 11);
addText('Для создания кода:', 11);
addNumberedItem('1', 'Откройте личный кабинет', 11);
addNumberedItem('2', 'Нажмите "Пригласительный код"', 11);
addNumberedItem('3', 'Выберите объект, для которого создается код', 11);
addNumberedItem('4', 'Скопируйте сгенерированный код и передайте новому пользователю', 11);
doc.moveDown(0.5);

addSubtitle('Уведомления', 16);
addText('Бот может отправлять уведомления о необходимости подачи ежедневных отчетов. Уведомления настраиваются администратором.', 11);
doc.moveDown(0.5);

addSubtitle('Важные замечания', 16);
addHighlightedText('Отчеты должны подаваться ежедневно, если вы указаны в настройках отчетов');
addHighlightedText('При изменении статуса на "В отпуске" вы не будете получать уведомления об отчетах');

addPageWithNumber();

// Финальная страница
doc.rect(0, 0, doc.page.width, doc.page.height)
   .fill(lightGray);

// Верхняя полоса
doc.rect(0, 0, doc.page.width, 80)
   .fill(secondaryColor);

doc.y = 200;

doc.fontSize(32)
   .fillColor(primaryColor)
   .font('bold')
   .text('СПАСИБО ЗА ВНИМАНИЕ!', { align: 'center' })
   .moveDown(3);

doc.fontSize(14)
   .fillColor(textColor)
   .font('default')
   .text('Если у вас возникли вопросы или проблемы при работе с ботом, обратитесь к администратору вашей организации.', { align: 'center', width: doc.page.width - 100 });

// Добавляем номер на последнюю страницу
const oldY = doc.y;
doc.fontSize(10)
   .fillColor('#95A5A6')
   .font('default')
   .text(`Страница ${pageNumber}`, 50, doc.page.height - 30, { align: 'center', width: doc.page.width - 100, encoding: 'UTF-8' });
doc.y = oldY;

// Завершаем документ
doc.end();

// Обработчик завершения документа
stream.on('finish', () => {
    // Переименовываем файл в финальное имя
    try {
        if (fs.existsSync(finalPath)) {
            fs.unlinkSync(finalPath);
        }
        fs.renameSync(outputPath, finalPath);
        console.log('PDF презентация успешно создана!');
        console.log(`Файл сохранен: ${finalPath}`);
    } catch (error) {
        console.log('PDF презентация создана, но не удалось переименовать файл (возможно, он открыт):');
        console.log(`Временный файл: ${outputPath}`);
    }
});

stream.on('error', (err) => {
    console.error('Ошибка при создании PDF:', err);
});
