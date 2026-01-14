const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const outputPath = path.join(__dirname, '..', 'letters_presentation.pdf');

async function generatePDF() {
    console.log('Запуск браузера...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    await page.setViewport({
        width: 1280,
        height: 720
    });
    
    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Новый функционал - Письма</title>
    <style>
        :root {
            --color-primary: #6366F1;
            --color-secondary: #10B981;
            --color-background: #F9FAFB;
            --color-text-primary: #1F2937;
            --color-text-secondary: #6B7280;
            --color-accent: #F59E0B;
            --color-white: #FFFFFF;
        }
        
        @page {
            size: 1280px 720px;
            margin: 0;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
            color: var(--color-text-primary);
            background: var(--color-background);
            line-height: 1.6;
        }
        
        .slide {
            width: 1280px;
            height: 720px;
            page-break-after: always;
            page-break-inside: avoid;
            position: relative;
            display: flex;
            background: var(--color-white);
            overflow: hidden;
        }
        
        .slide:last-child {
            page-break-after: auto;
        }
        
        .slide-content {
            width: 100%;
            height: 100%;
            padding: 50px 70px;
            display: flex;
            flex-direction: column;
        }
        
        .slide-title {
            font-size: 64px;
            font-weight: 800;
            color: var(--color-text-primary);
            line-height: 1.1;
            margin-bottom: 20px;
            letter-spacing: -0.02em;
        }
        
        .slide-subtitle {
            font-size: 32px;
            font-weight: 600;
            color: var(--color-text-secondary);
            line-height: 1.3;
            margin-bottom: 16px;
        }
        
        .slide-text {
            font-size: 18px;
            color: var(--color-text-primary);
            line-height: 1.8;
            max-width: 900px;
        }
        
        .card-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 24px;
            margin-top: 32px;
        }
        
        .card {
            background: var(--color-white);
            border-radius: 16px;
            padding: 32px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
            border-left: 4px solid var(--color-primary);
        }
        
        .card-icon {
            font-size: 40px;
            margin-bottom: 16px;
        }
        
        .card-title {
            font-size: 20px;
            font-weight: 700;
            color: var(--color-text-primary);
            margin-bottom: 8px;
        }
        
        .card-text {
            font-size: 14px;
            color: var(--color-text-secondary);
            line-height: 1.6;
        }
        
        .steps-container {
            display: flex;
            flex-direction: column;
            gap: 16px;
            margin-top: 24px;
        }
        
        .step {
            display: flex;
            align-items: flex-start;
            gap: 16px;
        }
        
        .step-number {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: var(--color-primary);
            color: var(--color-white);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            font-weight: 700;
            flex-shrink: 0;
        }
        
        .step-content {
            flex: 1;
        }
        
        .step-title {
            font-size: 18px;
            font-weight: 600;
            color: var(--color-text-primary);
            margin-bottom: 4px;
        }
        
        .step-text {
            font-size: 14px;
            color: var(--color-text-secondary);
            line-height: 1.5;
        }
        
        .title-slide {
            background: linear-gradient(135deg, var(--color-primary) 0%, #818CF8 100%);
            color: var(--color-white);
        }
        
        .title-slide .slide-content {
            justify-content: center;
            align-items: center;
            text-align: center;
        }
        
        .title-slide .slide-title {
            color: var(--color-white);
            font-size: 96px;
        }
        
        .title-slide .slide-subtitle {
            color: rgba(255, 255, 255, 0.9);
        }
        
        .centered {
            justify-content: center;
            align-items: center;
            text-align: center;
        }
        
        .centered .slide-text {
            max-width: 700px;
            margin: 0 auto;
        }
        
        .visual-accent {
            position: absolute;
            width: 400px;
            height: 400px;
            border-radius: 50%;
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(16, 185, 129, 0.1) 100%);
            top: -200px;
            right: -200px;
            z-index: 0;
        }
        
        .feature-list {
            list-style: none;
            margin-top: 32px;
        }
        
        .feature-item {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 20px;
            font-size: 18px;
            color: var(--color-text-primary);
        }
        
        .feature-icon {
            font-size: 32px;
        }
        
        .highlight-box {
            background: linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%);
            border-left: 4px solid var(--color-accent);
            border-radius: 12px;
            padding: 24px;
            margin-top: 24px;
        }
        
        .highlight-box-title {
            font-size: 18px;
            font-weight: 700;
            color: var(--color-text-primary);
            margin-bottom: 8px;
        }
        
        .highlight-box-text {
            font-size: 14px;
            color: var(--color-text-primary);
            line-height: 1.6;
        }
        
        .final-slide {
            background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
            color: var(--color-white);
        }
        
        .final-slide .slide-title {
            color: var(--color-white);
        }
        
        .final-slide .slide-text {
            color: rgba(255, 255, 255, 0.9);
        }
        
        .mt-48 {
            margin-top: 48px;
        }
    </style>
</head>
<body>
    <!-- Слайд 1: Титульный -->
    <div class="slide title-slide">
        <div class="visual-accent"></div>
        <div class="slide-content">
            <h1 class="slide-title">✉️ ПИСЬМА</h1>
            <p class="slide-subtitle">Новый функционал в Telegram Bot</p>
            <p class="slide-text" style="margin-top: 40px; color: rgba(255, 255, 255, 0.9); font-size: 20px;">
                Автоматическая выгрузка писем из Google Таблиц
            </p>
        </div>
    </div>
    
    <!-- Слайд 2: Что это -->
    <div class="slide">
        <div class="slide-content">
            <h1 class="slide-title">Что такое функционал<br>"Письма"?</h1>
            <p class="slide-text" style="margin-top: 24px;">
                Новый раздел в боте, который позволяет автоматически выгружать данные о письмах 
                из Google Таблицы "Журнал писем" в удобный Excel файл.
            </p>
            <div class="card-grid" style="margin-top: 40px;">
                <div class="card">
                    <div class="card-icon">📊</div>
                    <h3 class="card-title">Интеграция с Google Sheets</h3>
                    <p class="card-text">Автоматическое чтение данных из таблицы "Журнал писем" в папке "Офис"</p>
                </div>
                <div class="card">
                    <div class="card-icon">📤</div>
                    <h3 class="card-title">Выгрузка в Excel</h3>
                    <p class="card-text">Формирование структурированного Excel файла с фильтрацией по объектам</p>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Слайд 3: Возможности -->
    <div class="slide">
        <div class="slide-content">
            <h1 class="slide-title">Возможности</h1>
            <ul class="feature-list">
                <li class="feature-item">
                    <span class="feature-icon">✅</span>
                    <span><strong>Выгрузка писем по объекту</strong> — выберите нужный объект и получите все письма, связанные с ним</span>
                </li>
                <li class="feature-item">
                    <span class="feature-icon">📋</span>
                    <span><strong>Полная информация</strong> — Тип, Организации, ВХ №, ИС №, Даты, Контрагент, Роль, Содержание и ссылки на файлы</span>
                </li>
                <li class="feature-item">
                    <span class="feature-icon">📊</span>
                    <span><strong>Структурированный Excel</strong> — данные автоматически форматируются в удобную таблицу</span>
                </li>
                <li class="feature-item">
                    <span class="feature-icon">🔗</span>
                    <span><strong>Гиперссылки на файлы</strong> — прямые ссылки на документы прямо в таблице</span>
                </li>
                <li class="feature-item">
                    <span class="feature-icon">🏢</span>
                    <span><strong>Специальная функция для "ООО Стройка58"</strong> — кнопка "Все письма" для выгрузки всех писем без фильтрации</span>
                </li>
            </ul>
        </div>
    </div>
    
    <!-- Слайд 4: Как использовать -->
    <div class="slide">
        <div class="slide-content">
            <h1 class="slide-title">Как использовать</h1>
            <div class="steps-container">
                <div class="step">
                    <div class="step-number">1</div>
                    <div class="step-content">
                        <h3 class="step-title">Откройте главное меню</h3>
                        <p class="step-text">В главном меню бота нажмите на кнопку <strong>"✉️ Письма"</strong></p>
                    </div>
                </div>
                <div class="step">
                    <div class="step-number">2</div>
                    <div class="step-content">
                        <h3 class="step-title">Выберите "Выгрузить письма"</h3>
                        <p class="step-text">В меню писем нажмите на кнопку <strong>"📤 Выгрузить письма"</strong></p>
                    </div>
                </div>
                <div class="step">
                    <div class="step-number">3</div>
                    <div class="step-content">
                        <h3 class="step-title">Выберите объект</h3>
                        <p class="step-text">Бот покажет список объектов вашей организации. Выберите нужный объект из списка</p>
                    </div>
                </div>
                <div class="step">
                    <div class="step-number">4</div>
                    <div class="step-content">
                        <h3 class="step-title">Получите Excel файл</h3>
                        <p class="step-text">Бот автоматически загрузит данные из Google Таблицы, отфильтрует письма по выбранному объекту и отправит вам Excel файл</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Слайд 5: Для ООО Стройка58 -->
    <div class="slide">
        <div class="slide-content">
            <h1 class="slide-title">Специальная функция<br>для "ООО Стройка58"</h1>
            <p class="slide-text" style="margin-top: 24px;">
                Пользователи организации "ООО Стройка58" имеют дополнительную возможность выгрузить 
                <strong>все письма</strong> из таблицы без фильтрации по объекту.
            </p>
            <div class="steps-container" style="margin-top: 32px;">
                <div class="step">
                    <div class="step-number">1</div>
                    <div class="step-content">
                        <h3 class="step-title">Откройте меню выгрузки</h3>
                        <p class="step-text">Нажмите "Выгрузить письма" в меню писем</p>
                    </div>
                </div>
                <div class="step">
                    <div class="step-number">2</div>
                    <div class="step-content">
                        <h3 class="step-title">Нажмите "Все письма"</h3>
                        <p class="step-text">В списке объектов вы увидите кнопку <strong>"📋 Все письма"</strong> — нажмите на неё</p>
                    </div>
                </div>
                <div class="step">
                    <div class="step-number">3</div>
                    <div class="step-content">
                        <h3 class="step-title">Получите полный отчет</h3>
                        <p class="step-text">Бот отправит Excel файл со всеми письмами из таблицы, независимо от объекта</p>
                    </div>
                </div>
            </div>
            <div class="highlight-box" style="margin-top: 24px;">
                <h3 class="highlight-box-title">Важно</h3>
                <p class="highlight-box-text">Функция "Все письма" доступна только для пользователей организации "ООО Стройка58"</p>
            </div>
        </div>
    </div>
    
    <!-- Слайд 6: Структура данных -->
    <div class="slide">
        <div class="slide-content">
            <h1 class="slide-title">Что входит в выгрузку</h1>
            <p class="slide-text" style="margin-top: 24px; margin-bottom: 32px;">
                Excel файл содержит следующие колонки:
            </p>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; font-size: 16px;">
                <div style="padding: 12px; background: #F3F4F6; border-radius: 8px;">• Тип</div>
                <div style="padding: 12px; background: #F3F4F6; border-radius: 8px;">• Организации</div>
                <div style="padding: 12px; background: #F3F4F6; border-radius: 8px;">• ВХ №</div>
                <div style="padding: 12px; background: #F3F4F6; border-radius: 8px;">• ИС №</div>
                <div style="padding: 12px; background: #F3F4F6; border-radius: 8px;">• Дата документа</div>
                <div style="padding: 12px; background: #F3F4F6; border-radius: 8px;">• Дата регистрации</div>
                <div style="padding: 12px; background: #F3F4F6; border-radius: 8px;">• Контрагент</div>
                <div style="padding: 12px; background: #F3F4F6; border-radius: 8px;">• Роль</div>
                <div style="padding: 12px; background: #F3F4F6; border-radius: 8px;">• Объект</div>
                <div style="padding: 12px; background: #F3F4F6; border-radius: 8px;">• Исх. № контрагента</div>
                <div style="padding: 12px; background: #F3F4F6; border-radius: 8px;">• Содержание</div>
                <div style="padding: 12px; background: #F3F4F6; border-radius: 8px;">• Ссылка на файл</div>
            </div>
        </div>
    </div>
    
    <!-- Слайд 7: Преимущества -->
    <div class="slide">
        <div class="visual-accent"></div>
        <div class="slide-content centered">
            <h1 class="slide-title">Преимущества</h1>
            <div class="card-grid" style="margin-top: 40px;">
                <div class="card">
                    <div class="card-icon">⚡</div>
                    <h3 class="card-title">Быстро</h3>
                    <p class="card-text">Выгрузка данных занимает секунды вместо ручного копирования</p>
                </div>
                <div class="card">
                    <div class="card-icon">✅</div>
                    <h3 class="card-title">Точно</h3>
                    <p class="card-text">Исключены ошибки при ручном переносе данных</p>
                </div>
                <div class="card">
                    <div class="card-icon">📱</div>
                    <h3 class="card-title">Удобно</h3>
                    <p class="card-text">Все в одном месте — прямо в Telegram</p>
                </div>
                <div class="card">
                    <div class="card-icon">🔄</div>
                    <h3 class="card-title">Актуально</h3>
                    <p class="card-text">Данные всегда актуальны, так как читаются напрямую из Google Таблицы</p>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Слайд 8: Финальный -->
    <div class="slide final-slide">
        <div class="visual-accent"></div>
        <div class="slide-content centered">
            <h1 class="slide-title">Готовы попробовать?</h1>
            <p class="slide-text" style="margin-top: 40px; font-size: 24px;">
                Откройте бота и перейдите в раздел<br>
                <strong style="font-size: 32px;">✉️ Письма</strong>
            </p>
            <p class="slide-text" style="margin-top: 40px; font-size: 18px;">
                Функционал уже доступен в главном меню!
            </p>
        </div>
    </div>
</body>
</html>
    `;
    
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    console.log('Генерация PDF...');
    await page.pdf({
        path: outputPath,
        width: '1280px',
        height: '720px',
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
