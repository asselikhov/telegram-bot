const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const outputPath = path.join(__dirname, '..', 'presentation.pdf');

async function generatePDF() {
    console.log('Запуск браузера...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // HTML-шаблон презентации
    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Инструкция по работе с Telegram ботом</title>
    <style>
        @page {
            size: A4;
            margin: 0;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        /* Предотвращение разрывов внутри блоков */
        h1, h2, .highlight-box {
            page-break-inside: avoid;
            break-inside: avoid;
        }
        
        /* Предотвращение разрывов после заголовков */
        h1 {
            page-break-after: avoid;
            break-after: avoid;
        }
        
        h2 {
            page-break-after: avoid;
            break-after: avoid;
            margin-top: 15px;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #34495E;
            line-height: 1.6;
            background: #fff;
        }
        
        .page {
            width: 210mm;
            min-height: 297mm;
            max-height: 297mm;
            padding: 20mm 15mm;
            padding-bottom: 30mm;
            page-break-after: always;
            page-break-inside: avoid;
            break-inside: avoid;
            position: relative;
            display: block;
            overflow: hidden;
        }
        
        .page:last-of-type {
            page-break-after: auto;
            max-height: none;
        }
        
        /* Титульная страница */
        .title-page {
            background: linear-gradient(to bottom, #3498DB 0%, #3498DB 80px, #ECF0F1 80px);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
        }
        
        .title-page h1 {
            font-size: 36px;
            color: #2C3E50;
            font-weight: 700;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .title-page .subtitle {
            font-size: 18px;
            color: #34495E;
            font-weight: 600;
            margin-top: 30px;
        }
        
        .title-page .description {
            font-size: 14px;
            color: #7F8C8D;
            margin-top: 10px;
        }
        
        .divider {
            width: 300px;
            height: 2px;
            background: #3498DB;
            margin: 40px 0;
        }
        
        .year {
            position: absolute;
            bottom: 50px;
            left: 50%;
            transform: translateX(-50%);
            color: #7F8C8D;
            font-size: 12px;
        }
        
        /* Заголовки */
        h1 {
            font-size: 28px;
            color: #2C3E50;
            font-weight: 700;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 3px solid #3498DB;
            text-align: center;
        }
        
        h2 {
            font-size: 18px;
            color: #3498DB;
            font-weight: 600;
            margin-top: 20px;
            margin-bottom: 10px;
            padding-bottom: 5px;
            border-bottom: 2px solid #3498DB;
            display: inline-block;
        }
        
        /* Текст */
        p {
            font-size: 11pt;
            margin-bottom: 10px;
            text-align: justify;
        }
        
        /* Выделенные блоки */
        .highlight-box {
            background: #FFF9E6;
            border: 2px solid #FFD700;
            border-left: 5px solid #FFD700;
            padding: 15px;
            margin: 15px 0;
            border-radius: 5px;
        }
        
        .highlight-box p {
            color: #B8860B;
            font-weight: 600;
            margin: 0;
        }
        
        /* Списки */
        ul {
            list-style: none;
            margin: 10px 0;
            padding-left: 0;
        }
        
        ul li {
            font-size: 11pt;
            margin-bottom: 8px;
            padding-left: 25px;
            position: relative;
        }
        
        ul li:before {
            content: "●";
            position: absolute;
            left: 0;
            color: #3498DB;
            font-size: 14px;
            font-weight: bold;
        }
        
        ol {
            list-style: none;
            margin: 10px 0;
            padding-left: 0;
            counter-reset: step-counter;
        }
        
        ol li {
            font-size: 11pt;
            margin-bottom: 10px;
            padding-left: 35px;
            position: relative;
            counter-increment: step-counter;
        }
        
        ol li:before {
            content: counter(step-counter);
            position: absolute;
            left: 0;
            width: 24px;
            height: 24px;
            background: #3498DB;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10pt;
            font-weight: bold;
            top: -2px;
        }
        
        /* Примеры */
        .example {
            font-style: italic;
            color: #7F8C8D;
            font-size: 10pt;
            margin-left: 20px;
            margin-top: 5px;
        }
        
        /* Номер страницы */
        .page-number {
            position: absolute;
            bottom: 10mm;
            left: 50%;
            transform: translateX(-50%);
            font-size: 10pt;
            color: #95A5A6;
            width: 100%;
            text-align: center;
        }
        
        /* Содержание */
        .toc {
            margin-top: 30px;
        }
        
        .toc-item {
            font-size: 14pt;
            margin-bottom: 15px;
            padding-left: 35px;
            position: relative;
        }
        
        .toc-item:before {
            content: counter(toc-counter);
            counter-increment: toc-counter;
            position: absolute;
            left: 0;
            width: 28px;
            height: 28px;
            background: #3498DB;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12pt;
            font-weight: bold;
        }
        
        .toc {
            counter-reset: toc-counter;
        }
        
        /* Финальная страница */
        .final-page {
            background: linear-gradient(to bottom, #3498DB 0%, #3498DB 80px, #ECF0F1 80px);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
        }
        
        .final-page h1 {
            font-size: 32px;
            color: #2C3E50;
            border: none;
            margin-bottom: 30px;
        }
        
        .final-page p {
            font-size: 14pt;
            max-width: 500px;
        }
    </style>
</head>
<body>
    <!-- Титульная страница -->
    <div class="page title-page">
        <h1>Инструкция по работе</h1>
        <h1>с Telegram ботом</h1>
        <div class="subtitle">Руководство пользователя</div>
        <div class="description">Регистрация, создание и выгрузка отчетов</div>
        <div class="divider"></div>
        <div class="year">${new Date().getFullYear()}</div>
    </div>
    
    <!-- Содержание -->
    <div class="page">
        <h1>Содержание</h1>
        <div class="toc">
            <div class="toc-item">Регистрация в боте</div>
            <div class="toc-item">Создание отчета</div>
            <div class="toc-item">Выгрузка отчетов</div>
            <div class="toc-item">Просмотр и редактирование отчетов</div>
        </div>
        <div class="page-number">Страница 2</div>
    </div>
    
    <!-- Раздел 1: Регистрация -->
    <div class="page">
        <h1>1. Регистрация в боте</h1>
        
        <h2>Шаг 1: Получение пригласительного кода</h2>
        <p>Для начала работы с ботом вам понадобится пригласительный код. Его может предоставить администратор вашей организации.</p>
        
        <h2>Шаг 2: Запуск бота</h2>
        <ol>
            <li>Найдите бота в Telegram</li>
            <li>Нажмите кнопку "START" или отправьте команду /start</li>
        </ol>
        
        <h2>Шаг 3: Ввод пригласительного кода</h2>
        <p>Бот попросит вас ввести пригласительный код. Скопируйте и отправьте код, который вам предоставил администратор.</p>
        
        <h2>Шаг 4: Выбор объектов</h2>
        <p>После успешного ввода кода бот предложит выбрать объекты, с которыми вы работаете. Выберите нужные объекты из предложенного списка.</p>
        
        <h2>Шаг 5: Выбор должности</h2>
        <p>Затем выберите вашу должность из списка должностей вашей организации.</p>
        
        <h2>Шаг 6: Ввод персональных данных</h2>
        <p>Вам будет предложено ввести:</p>
        <ul>
            <li>ФИО (полное имя)</li>
            <li>Контактный телефон</li>
        </ul>
        
        <h2>Шаг 7: Ожидание одобрения</h2>
        <p>После заполнения всех данных ваша заявка будет отправлена администратору на рассмотрение. Дождитесь одобрения, после чего вы сможете полноценно работать с ботом.</p>
        
        <div class="page-number">Страница 3</div>
    </div>
    
    <!-- Раздел 2: Создание отчета -->
    <div class="page">
        <h1>2. Создание отчета</h1>
        
        <div class="highlight-box">
            <p>Примечание: Кнопка "Создать отчет" доступна только пользователям, которые указаны администратором в настройках отчетов для конкретных объектов.</p>
        </div>
        
        <h2>Шаг 1: Открытие главного меню</h2>
        <p>После одобрения заявки администратором, при запуске бота вы увидите главное меню с доступными опциями.</p>
        
        <h2>Шаг 2: Выбор создания отчета</h2>
        <p>Нажмите на кнопку "Создать отчет" в главном меню.</p>
        
        <h2>Шаг 3: Выбор объекта</h2>
        <p>Из списка доступных объектов выберите тот, по которому вы хотите создать отчет.</p>
        
        <h2>Шаг 4: Ввод информации о выполненных работах</h2>
        <p>Бот попросит вас ввести информацию о выполненных работах. Опишите детально, что было сделано на объекте.</p>
        <div class="example">Пример: "Выполнена укладка асфальта на участке 100-150 метров. Проведена разметка дорожного полотна."</div>
        
        <h2>Шаг 5: Ввод информации о материалах</h2>
        <p>Затем укажите информацию о поставленных материалах.</p>
        <div class="example">Пример: "Поставлено: асфальт - 50 тонн, щебень - 30 тонн"</div>
        
        <h2>Шаг 6: Прикрепление фотографий (опционально)</h2>
        <p>При необходимости прикрепите фотографии к отчету. Можно прикрепить несколько фотографий.</p>
        <p>После прикрепления всех фотографий нажмите кнопку "Готово".</p>
        
        <h2>Шаг 7: Завершение создания отчета</h2>
        <p>После завершения всех шагов отчет будет создан и сохранен в системе. Вы получите подтверждение об успешном создании отчета.</p>
        
        <div class="page-number">Страница 4</div>
    </div>
    
    <!-- Раздел 3: Выгрузка отчетов -->
    <div class="page">
        <h1>3. Выгрузка отчетов</h1>
        
        <h2>Доступ к выгрузке</h2>
        <p>Функция выгрузки отчетов доступна всем одобренным пользователям.</p>
        
        <h2>Шаг 1: Открытие меню выгрузки</h2>
        <p>В главном меню нажмите кнопку "Выгрузить".</p>
        
        <h2>Шаг 2: Выбор типа выгрузки</h2>
        <p>Выберите, что вы хотите выгрузить:</p>
        <ul>
            <li>Отчеты - для выгрузки отчетов по объектам</li>
            <li>Люди - для выгрузки списка пользователей по объекту</li>
        </ul>
        
        <h2>Шаг 3: Выбор объекта</h2>
        <p>Выберите объект из списка объектов вашей организации. Список может быть разбит на страницы - используйте кнопки навигации для просмотра.</p>
        
        <h2>Шаг 4: Получение файла</h2>
        <p>После выбора объекта бот автоматически сформирует Excel файл (.xlsx) с данными и отправит его вам.</p>
        <p>Файл будет содержать:</p>
        <ul>
            <li>Для отчетов: дату, исполнителя, выполненные работы, материалы, количество фото с ссылками</li>
            <li>Для людей: должность, организацию, ФИО, телефон, дату рождения, статус</li>
        </ul>
        
        <h2>Шаг 5: Сохранение файла</h2>
        <p>Откройте полученный файл в Telegram и сохраните его на ваше устройство для дальнейшего использования.</p>
        
        <div class="page-number">Страница 5</div>
    </div>
    
    <!-- Раздел 4: Просмотр и редактирование отчетов -->
    <div class="page">
        <h1>4. Просмотр и редактирование отчетов</h1>
        
        <h2>Просмотр своих отчетов</h2>
        <p>Для просмотра ваших отчетов:</p>
        <ol>
            <li>Откройте главное меню</li>
            <li>Нажмите "Личный кабинет"</li>
            <li>Выберите "Посмотреть мои отчеты"</li>
            <li>Выберите объект из списка</li>
            <li>Выберите дату для просмотра отчетов за этот день</li>
            <li>Выберите конкретный отчет из списка</li>
        </ol>
        
        <h2>Редактирование отчета</h2>
        <p>Для редактирования существующего отчета:</p>
        <ol>
            <li>Откройте отчет, который хотите отредактировать (см. "Просмотр своих отчетов")</li>
            <li>Нажмите кнопку "Редактировать"</li>
            <li>Следуйте инструкциям бота для изменения данных:
                <ul>
                    <li>Измените информацию о выполненных работах</li>
                    <li>Измените информацию о материалах</li>
                    <li>При необходимости обновите фотографии (можно удалить все или добавить новые)</li>
                </ul>
            </li>
            <li>Нажмите "Готово" для сохранения изменений</li>
        </ol>
        
        <h2>Информация в отчете</h2>
        <p>Каждый отчет содержит:</p>
        <ul>
            <li>Дата отчета</li>
            <li>Название объекта</li>
            <li>ФИО исполнителя</li>
            <li>Выполненные работы</li>
            <li>Поставленные материалы</li>
            <li>Фотографии (если были прикреплены)</li>
            <li>Время создания отчета</li>
        </ul>
        
        <div class="page-number">Страница 6</div>
    </div>
    
    <!-- Дополнительная информация -->
    <div class="page">
        <h1>Дополнительная информация</h1>
        
        <h2>Личный кабинет</h2>
        <p>В личном кабинете вы можете:</p>
        <ul>
            <li>Просмотреть свою информацию (должность, организацию, объекты, статус)</li>
            <li>Изменить свои данные (ФИО, должность, организацию, телефон, объекты, статус)</li>
            <li>Посмотреть свои отчеты</li>
            <li>Сгенерировать пригласительный код для других пользователей</li>
        </ul>
        
        <h2>Пригласительные коды</h2>
        <p>Одобренные пользователи могут создавать пригласительные коды для регистрации новых пользователей в своей организации.</p>
        <p>Для создания кода:</p>
        <ol>
            <li>Откройте личный кабинет</li>
            <li>Нажмите "Пригласительный код"</li>
            <li>Выберите объект, для которого создается код</li>
            <li>Скопируйте сгенерированный код и передайте новому пользователю</li>
        </ol>
        
        <h2>Уведомления</h2>
        <p>Бот может отправлять уведомления о необходимости подачи ежедневных отчетов. Уведомления настраиваются администратором.</p>
        
        <h2>Важные замечания</h2>
        <div class="highlight-box">
            <p>Отчеты должны подаваться ежедневно, если вы указаны в настройках отчетов</p>
        </div>
        <div class="highlight-box">
            <p>При изменении статуса на "В отпуске" вы не будете получать уведомления об отчетах</p>
        </div>
        
        <div class="page-number">Страница 7</div>
    </div>
    
    <!-- Финальная страница -->
    <div class="page final-page">
        <h1>Спасибо за внимание!</h1>
        <p>Если у вас возникли вопросы или проблемы при работе с ботом, обратитесь к администратору вашей организации.</p>
        <div class="page-number">Страница 8</div>
    </div>
</body>
</html>
    `;
    
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    console.log('Генерация PDF...');
    await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,
        margin: {
            top: '0',
            right: '0',
            bottom: '0',
            left: '0'
        }
    });
    
    await browser.close();
    console.log(`PDF презентация успешно создана: ${outputPath}`);
}

generatePDF().catch(console.error);

