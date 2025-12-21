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
    
    // Устанавливаем размер viewport для формата 16:9
    await page.setViewport({
        width: 1280,
        height: 720
    });
    
    // HTML-шаблон презентации
    const html = `
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Telegram Bot - Инструкция</title>
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
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, 'SF Pro Text', sans-serif;
            color: var(--color-text-primary);
            background: var(--color-background);
            line-height: 1.6;
        }
        
        .slide {
            width: 1280px;
            height: 720px;
            page-break-after: always;
            page-break-inside: avoid;
            break-inside: avoid;
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
        
        /* Типографика */
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
            font-weight: 400;
            color: var(--color-text-primary);
            line-height: 1.8;
            max-width: 900px;
        }
        
        .slide-text-secondary {
            font-size: 16px;
            color: var(--color-text-secondary);
            line-height: 1.7;
        }
        
        /* Карточки */
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
            display: flex;
            flex-direction: column;
            transition: transform 0.2s;
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
        
        /* Шаги процесса */
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
        
        /* Timeline */
        .timeline {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 64px;
            position: relative;
        }
        
        .timeline::before {
            content: '';
            position: absolute;
            top: 32px;
            left: 80px;
            right: 80px;
            height: 2px;
            background: linear-gradient(90deg, var(--color-primary), var(--color-secondary));
            z-index: 0;
        }
        
        .timeline-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            flex: 1;
            position: relative;
            z-index: 1;
        }
        
        .timeline-circle {
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background: var(--color-white);
            border: 4px solid var(--color-primary);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            font-weight: 700;
            color: var(--color-primary);
            margin-bottom: 16px;
        }
        
        .timeline-text {
            font-size: 16px;
            color: var(--color-text-secondary);
            text-align: center;
            max-width: 200px;
        }
        
        /* Болевые точки */
        .pain-points {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 48px;
            margin-top: 64px;
        }
        
        .pain-point {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
        }
        
        .pain-point-icon {
            font-size: 64px;
            margin-bottom: 24px;
            opacity: 0.8;
        }
        
        .pain-point-text {
            font-size: 18px;
            color: var(--color-text-primary);
            font-weight: 500;
            line-height: 1.5;
        }
        
        /* Выделенный блок */
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
        
        /* Визуальные элементы */
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
        
        .visual-accent-2 {
            position: absolute;
            width: 300px;
            height: 300px;
            border-radius: 50%;
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%);
            bottom: -150px;
            left: -150px;
            z-index: 0;
        }
        
        /* Центрирование контента */
        .centered {
            justify-content: center;
            align-items: center;
            text-align: center;
        }
        
        .centered .slide-text {
            max-width: 700px;
            margin: 0 auto;
        }
        
        /* Титульный слайд */
        .title-slide {
            background: linear-gradient(135deg, var(--color-primary) 0%, #818CF8 100%);
            color: var(--color-white);
        }
        
        .title-slide .slide-title {
            color: var(--color-white);
            font-size: 96px;
        }
        
        .title-slide .slide-subtitle {
            color: rgba(255, 255, 255, 0.9);
        }
        
        .title-slide .year {
            position: absolute;
            bottom: 60px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 16px;
            color: rgba(255, 255, 255, 0.7);
            font-weight: 400;
        }
        
        .bot-link {
            display: inline-block;
            margin-top: 32px;
            padding: 16px 32px;
            background: rgba(255, 255, 255, 0.2);
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 12px;
            color: var(--color-white);
            font-size: 20px;
            font-weight: 600;
            text-decoration: none;
            transition: all 0.2s;
            backdrop-filter: blur(10px);
        }
        
        .bot-link:hover {
            background: rgba(255, 255, 255, 0.3);
            border-color: rgba(255, 255, 255, 0.5);
        }
        
        .bot-link-final {
            margin-top: 48px;
            padding: 20px 40px;
            background: rgba(255, 255, 255, 0.15);
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 12px;
            color: var(--color-white);
            font-size: 24px;
            font-weight: 600;
            display: inline-block;
            text-decoration: none;
        }
        
        /* Финальный слайд */
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
        
        .benefits-list {
            list-style: none;
            margin-top: 48px;
            display: flex;
            flex-direction: column;
            gap: 24px;
        }
        
        .benefit-item {
            display: flex;
            align-items: center;
            gap: 16px;
            font-size: 20px;
            color: rgba(255, 255, 255, 0.95);
        }
        
        .benefit-icon {
            font-size: 32px;
        }
        
        /* Утилиты */
        .mt-auto {
            margin-top: auto;
        }
        
        .mb-16 {
            margin-bottom: 16px;
        }
        
        .mb-24 {
            margin-bottom: 24px;
        }
        
        .mt-48 {
            margin-top: 48px;
        }
        
        .flex {
            display: flex;
        }
        
        .flex-col {
            flex-direction: column;
        }
        
        .gap-16 {
            gap: 16px;
        }
    </style>
</head>
<body>
    <!-- Слайд 1: Титульный -->
    <div class="slide title-slide">
        <div class="visual-accent"></div>
        <div class="visual-accent-2"></div>
        <div class="slide-content centered">
            <h1 class="slide-title">Telegram Bot</h1>
            <p class="slide-subtitle">Автоматизация отчетности</p>
            <a href="https://t.me/my_daily_report_RSH1_bot" class="bot-link">@my_daily_report_RSH1_bot</a>
            <div class="year">${new Date().getFullYear()}</div>
        </div>
    </div>
    
    <!-- Слайд 2: Контекст / Проблема -->
    <div class="slide">
        <div class="slide-content">
            <h1 class="slide-title">Ручная отчетность —<br>это неэффективно</h1>
            <div class="pain-points">
                <div class="pain-point">
                    <div class="pain-point-icon">⏱️</div>
                    <p class="pain-point-text">Много времени на заполнение форм</p>
                </div>
                <div class="pain-point">
                    <div class="pain-point-icon">❌</div>
                    <p class="pain-point-text">Ошибки в данных и потеря информации</p>
                </div>
                <div class="pain-point">
                    <div class="pain-point-icon">📊</div>
                    <p class="pain-point-text">Сложность отслеживания и анализа</p>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Слайд 3: Решение -->
    <div class="slide">
        <div class="visual-accent"></div>
        <div class="slide-content centered">
            <h1 class="slide-title">Автоматизация<br>через Telegram</h1>
            <p class="slide-text mt-48">
                Бот упрощает процесс создания, отправки и управления отчетами прямо в мессенджере Telegram. 
                Все данные автоматически сохраняются и доступны для анализа в любое время.
            </p>
            <p class="slide-text-secondary mt-48" style="font-size: 18px; font-weight: 600;">
                Начните работу: найдите @my_daily_report_RSH1_bot в Telegram
            </p>
            <div class="mt-48" style="font-size: 120px; opacity: 0.2;">🤖</div>
        </div>
    </div>
    
    <!-- Слайд 4: Основные функции -->
    <div class="slide">
        <div class="slide-content">
            <h1 class="slide-title">Основные функции</h1>
            <div class="card-grid">
                <div class="card">
                    <div class="card-icon">📝</div>
                    <h3 class="card-title">Регистрация</h3>
                    <p class="card-text">Быстрая регистрация через пригласительный код от администратора</p>
                </div>
                <div class="card">
                    <div class="card-icon">📋</div>
                    <h3 class="card-title">Отчеты</h3>
                    <p class="card-text">Создание отчетов с информацией о работах, материалах и фото</p>
                </div>
                <div class="card">
                    <div class="card-icon">📤</div>
                    <h3 class="card-title">Выгрузка</h3>
                    <p class="card-text">Экспорт отчетов и списков пользователей в Excel</p>
                </div>
                <div class="card">
                    <div class="card-icon">⚙️</div>
                    <h3 class="card-title">Управление</h3>
                    <p class="card-text">Личный кабинет для просмотра и редактирования данных</p>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Слайд 5: Как это работает -->
    <div class="slide">
        <div class="slide-content">
            <h1 class="slide-title">Как это работает</h1>
            <div class="timeline">
                <div class="timeline-item">
                    <div class="timeline-circle">1</div>
                    <p class="timeline-text">Регистрация в боте</p>
                </div>
                <div class="timeline-item">
                    <div class="timeline-circle">2</div>
                    <p class="timeline-text">Создание отчетов</p>
                </div>
                <div class="timeline-item">
                    <div class="timeline-circle">3</div>
                    <p class="timeline-text">Выгрузка данных</p>
                </div>
                <div class="timeline-item">
                    <div class="timeline-circle">4</div>
                    <p class="timeline-text">Управление информацией</p>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Слайд 6: Регистрация -->
    <div class="slide">
        <div class="slide-content">
            <h1 class="slide-title">Начало работы</h1>
            <div class="steps-container">
                <div class="step">
                    <div class="step-number">1</div>
                    <div class="step-content">
                        <h3 class="step-title">Откройте Telegram и найдите бота</h3>
                        <p class="step-text">В поиске Telegram введите: <strong>@my_daily_report_RSH1_bot</strong> или перейдите по ссылке. Нажмите на имя бота, чтобы открыть чат.</p>
                    </div>
                </div>
                <div class="step">
                    <div class="step-number">2</div>
                    <div class="step-content">
                        <h3 class="step-title">Запустите бота</h3>
                        <p class="step-text">В открывшемся чате нажмите большую синюю кнопку <strong>"START"</strong> внизу экрана, или отправьте команду <strong>/start</strong> в поле ввода сообщения.</p>
                    </div>
                </div>
                <div class="step">
                    <div class="step-number">3</div>
                    <div class="step-content">
                        <h3 class="step-title">Введите пригласительный код</h3>
                        <p class="step-text">Получите код у администратора вашей организации. В ответном сообщении отправьте этот код боту (просто введите код текстом и нажмите отправить).</p>
                    </div>
                </div>
                <div class="step">
                    <div class="step-number">4</div>
                    <div class="step-content">
                        <h3 class="step-title">Заполните данные</h3>
                        <p class="step-text">Бот попросит вас выбрать объекты работы, вашу должность и указать контактный телефон. Следуйте инструкциям бота, отвечая на его вопросы.</p>
                    </div>
                </div>
                <div class="step">
                    <div class="step-number">5</div>
                    <div class="step-content">
                        <h3 class="step-title">Дождитесь одобрения</h3>
                        <p class="step-text">Ваша заявка будет отправлена администратору. После одобрения вы получите уведомление и сможете полноценно использовать все функции бота.</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Слайд 7: Создание отчетов -->
    <div class="slide">
        <div class="slide-content">
            <h1 class="slide-title">Как подать отчет</h1>
            <div class="steps-container">
                <div class="step">
                    <div class="step-number">1</div>
                    <div class="step-content">
                        <h3 class="step-title">Откройте главное меню</h3>
                        <p class="step-text">В чате с ботом вы увидите кнопку <strong>"Создать отчет"</strong> (если она доступна для вас). Нажмите на неё.</p>
                    </div>
                </div>
                <div class="step">
                    <div class="step-number">2</div>
                    <div class="step-content">
                        <h3 class="step-title">Выберите объект</h3>
                        <p class="step-text">Бот покажет список ваших объектов. Нажмите на кнопку с названием нужного объекта, по которому вы хотите создать отчет.</p>
                    </div>
                </div>
                <div class="step">
                    <div class="step-number">3</div>
                    <div class="step-content">
                        <h3 class="step-title">Опишите выполненные работы</h3>
                        <p class="step-text">Бот попросит ввести информацию о работах. Напишите текстом, что было сделано на объекте (например: "Укладка асфальта на участке 100-150 метров"). Отправьте сообщение.</p>
                    </div>
                </div>
                <div class="step">
                    <div class="step-number">4</div>
                    <div class="step-content">
                        <h3 class="step-title">Укажите материалы</h3>
                        <p class="step-text">Затем бот попросит указать поставленные материалы. Введите информацию (например: "Асфальт - 50 тонн, щебень - 30 тонн") и отправьте.</p>
                    </div>
                </div>
                <div class="step">
                    <div class="step-number">5</div>
                    <div class="step-content">
                        <h3 class="step-title">Добавьте фотографии (по желанию)</h3>
                        <p class="step-text">Если нужно прикрепить фото, нажмите на иконку скрепки (📎) или кнопку добавления фото, выберите фото из галереи и отправьте. Можно добавить несколько фото. Когда закончите, нажмите кнопку <strong>"Готово"</strong>.</p>
                    </div>
                </div>
            </div>
            <div class="highlight-box">
                <h3 class="highlight-box-title">Важно</h3>
                <p class="highlight-box-text">Кнопка "Создать отчет" появляется только у пользователей, которых администратор назначил ответственными за отчеты по конкретным объектам. Если кнопки нет, обратитесь к администратору.</p>
            </div>
        </div>
    </div>
    
    <!-- Слайд 8: Финальный / CTA -->
    <div class="slide final-slide">
        <div class="visual-accent"></div>
        <div class="slide-content centered">
            <h1 class="slide-title">Готовы начать?</h1>
            <ul class="benefits-list">
                <li class="benefit-item">
                    <span class="benefit-icon">✓</span>
                    <span>Быстрая регистрация и удобный интерфейс</span>
                </li>
                <li class="benefit-item">
                    <span class="benefit-icon">✓</span>
                    <span>Автоматическое сохранение всех данных</span>
                </li>
                <li class="benefit-item">
                    <span class="benefit-icon">✓</span>
                    <span>Выгрузка отчетов в Excel одним нажатием</span>
                </li>
            </ul>
            <a href="https://t.me/my_daily_report_RSH1_bot" class="bot-link-final">@my_daily_report_RSH1_bot</a>
            <p class="slide-text mt-48" style="font-size: 16px;">
                Обратитесь к администратору вашей организации<br>для получения пригласительного кода
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
