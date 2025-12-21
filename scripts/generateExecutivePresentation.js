const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const outputPath = path.join(__dirname, '..', 'executive_presentation.pdf');

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
    <title>Telegram Bot - Бизнес-презентация</title>
    <style>
        :root {
            --color-primary: #1E40AF;
            --color-secondary: #059669;
            --color-accent: #DC2626;
            --color-background: #FFFFFF;
            --color-text-primary: #111827;
            --color-text-secondary: #6B7280;
            --color-gradient-start: #1E40AF;
            --color-gradient-end: #3B82F6;
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
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
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
            background: var(--color-background);
            overflow: hidden;
        }
        
        .slide:last-child {
            page-break-after: auto;
        }
        
        .slide-content {
            width: 100%;
            height: 100%;
            padding: 60px 80px;
            display: flex;
            flex-direction: column;
            position: relative;
            z-index: 2;
        }
        
        /* Типографика */
        .slide-title {
            font-size: 72px;
            font-weight: 800;
            color: var(--color-text-primary);
            line-height: 1.1;
            margin-bottom: 24px;
            letter-spacing: -0.03em;
        }
        
        .slide-subtitle {
            font-size: 36px;
            font-weight: 600;
            color: var(--color-text-secondary);
            line-height: 1.3;
            margin-bottom: 20px;
        }
        
        .slide-text {
            font-size: 20px;
            color: var(--color-text-primary);
            line-height: 1.7;
            max-width: 900px;
        }
        
        /* Титульный слайд */
        .title-slide {
            background: linear-gradient(135deg, var(--color-gradient-start) 0%, var(--color-gradient-end) 100%);
            color: white;
        }
        
        .title-slide .slide-content {
            justify-content: center;
            align-items: center;
            text-align: center;
        }
        
        .title-slide .slide-title {
            color: white;
            font-size: 84px;
            margin-bottom: 32px;
        }
        
        .title-slide .slide-subtitle {
            color: rgba(255, 255, 255, 0.9);
            font-size: 32px;
            font-weight: 400;
        }
        
        .title-slide .tagline {
            margin-top: 60px;
            font-size: 24px;
            color: rgba(255, 255, 255, 0.8);
            font-weight: 300;
        }
        
        /* Проблемы */
        .problem-item {
            display: flex;
            align-items: flex-start;
            gap: 24px;
            margin-bottom: 32px;
        }
        
        .problem-icon {
            font-size: 48px;
            flex-shrink: 0;
        }
        
        .problem-content h3 {
            font-size: 28px;
            font-weight: 700;
            color: var(--color-text-primary);
            margin-bottom: 8px;
        }
        
        .problem-content p {
            font-size: 18px;
            color: var(--color-text-secondary);
            line-height: 1.6;
        }
        
        /* Решение */
        .solution-slide {
            background: linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%);
        }
        
        /* Преимущества */
        .benefits-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 32px;
            margin-top: 40px;
        }
        
        .benefit-card {
            background: white;
            border-left: 5px solid var(--color-primary);
            padding: 32px;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }
        
        .benefit-card h3 {
            font-size: 24px;
            font-weight: 700;
            color: var(--color-primary);
            margin-bottom: 12px;
        }
        
        .benefit-card p {
            font-size: 16px;
            color: var(--color-text-secondary);
            line-height: 1.6;
        }
        
        /* Функционал */
        .feature-list {
            list-style: none;
            margin-top: 40px;
        }
        
        .feature-item {
            display: flex;
            align-items: center;
            gap: 20px;
            margin-bottom: 24px;
            font-size: 20px;
        }
        
        .feature-icon {
            font-size: 32px;
            color: var(--color-secondary);
            flex-shrink: 0;
        }
        
        /* Статистика */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 40px;
            margin-top: 60px;
        }
        
        .stat-item {
            text-align: center;
        }
        
        .stat-number {
            font-size: 64px;
            font-weight: 800;
            color: var(--color-primary);
            line-height: 1;
            margin-bottom: 12px;
        }
        
        .stat-label {
            font-size: 18px;
            color: var(--color-text-secondary);
            font-weight: 500;
        }
        
        /* ROI */
        .roi-box {
            background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%);
            border: 2px solid var(--color-secondary);
            border-radius: 16px;
            padding: 48px;
            margin-top: 40px;
            text-align: center;
        }
        
        .roi-title {
            font-size: 32px;
            font-weight: 700;
            color: var(--color-text-primary);
            margin-bottom: 24px;
        }
        
        .roi-items {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 32px;
            margin-top: 32px;
        }
        
        .roi-item {
            text-align: left;
        }
        
        .roi-item h4 {
            font-size: 20px;
            font-weight: 700;
            color: var(--color-secondary);
            margin-bottom: 8px;
        }
        
        .roi-item p {
            font-size: 16px;
            color: var(--color-text-secondary);
        }
        
        /* Центрирование */
        .centered {
            justify-content: center;
            align-items: center;
            text-align: center;
        }
        
        .centered .slide-text {
            max-width: 800px;
            margin: 0 auto;
        }
        
        /* Финальный слайд */
        .final-slide {
            background: linear-gradient(135deg, var(--color-gradient-start) 0%, var(--color-gradient-end) 100%);
            color: white;
        }
        
        .final-slide .slide-content {
            justify-content: center;
            align-items: center;
            text-align: center;
        }
        
        .final-slide .slide-title {
            color: white;
            margin-bottom: 40px;
        }
        
        .final-slide .slide-text {
            color: rgba(255, 255, 255, 0.9);
            font-size: 24px;
            margin-bottom: 20px;
        }
        
        .contact-info {
            margin-top: 60px;
            font-size: 20px;
            color: rgba(255, 255, 255, 0.9);
        }
        
        /* Декоративные элементы */
        .bg-pattern {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            opacity: 0.03;
            background-image: radial-gradient(circle, var(--color-primary) 1px, transparent 1px);
            background-size: 40px 40px;
            z-index: 1;
        }
        
        .gradient-overlay {
            position: absolute;
            top: -200px;
            right: -200px;
            width: 600px;
            height: 600px;
            background: radial-gradient(circle, rgba(30, 64, 175, 0.1) 0%, transparent 70%);
            border-radius: 50%;
            z-index: 1;
        }
    </style>
</head>
<body>
    <!-- Слайд 1: Титульный -->
    <div class="slide title-slide">
        <div class="bg-pattern"></div>
        <div class="slide-content">
            <h1 class="slide-title">Система автоматизации<br>отчетности</h1>
            <p class="slide-subtitle">Telegram Bot для управления<br>производственными процессами</p>
            <div class="tagline">Эффективность. Контроль. Прозрачность.</div>
        </div>
    </div>
    
    <!-- Слайд 2: Проблемы -->
    <div class="slide">
        <div class="bg-pattern"></div>
        <div class="slide-content">
            <h1 class="slide-title">Вызовы современного<br>управления</h1>
            <div style="margin-top: 48px;">
                <div class="problem-item">
                    <div class="problem-icon">⏱️</div>
                    <div class="problem-content">
                        <h3>Потеря времени на ручную обработку</h3>
                        <p>Ежедневное заполнение форм, сбор данных от подрядчиков, ручной ввод информации в системы учета занимает часы рабочего времени сотрудников</p>
                    </div>
                </div>
                <div class="problem-item">
                    <div class="problem-icon">📊</div>
                    <div class="problem-content">
                        <h3>Отсутствие оперативного контроля</h3>
                        <p>Невозможность быстро получить актуальную информацию о состоянии объектов, выполненных работах и наличии проблем на площадках</p>
                    </div>
                </div>
                <div class="problem-item">
                    <div class="problem-icon">❌</div>
                    <div class="problem-content">
                        <h3>Ошибки и потеря данных</h3>
                        <p>Человеческий фактор при ручном вводе, риск потери документов, отсутствие централизованного хранения информации</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Слайд 3: Решение -->
    <div class="slide solution-slide">
        <div class="bg-pattern"></div>
        <div class="slide-content centered">
            <h1 class="slide-title">Единая платформа<br>в Telegram</h1>
            <p class="slide-text" style="margin-top: 48px;">
                Интегрированная система для автоматизации сбора отчетности, 
                контроля выполнения работ и управления данными о производственных объектах. 
                Все в одном мессенджере, доступном каждому сотруднику.
            </p>
        </div>
    </div>
    
    <!-- Слайд 4: Ключевые преимущества -->
    <div class="slide">
        <div class="bg-pattern"></div>
        <div class="slide-content">
            <h1 class="slide-title">Ключевые<br>преимущества</h1>
            <div class="benefits-grid">
                <div class="benefit-card">
                    <h3>Экономия времени</h3>
                    <p>Автоматизация процессов сбора и обработки данных сокращает время на отчетность до 80%</p>
                </div>
                <div class="benefit-card">
                    <h3>Оперативный контроль</h3>
                    <p>Мгновенный доступ к актуальной информации о состоянии всех объектов в режиме реального времени</p>
                </div>
                <div class="benefit-card">
                    <h3>Снижение ошибок</h3>
                    <p>Централизованная система исключает потерю данных и минимизирует ошибки при обработке информации</p>
                </div>
                <div class="benefit-card">
                    <h3>Прозрачность процессов</h3>
                    <p>Полный контроль над выполнением работ, автоматическое формирование статистики и аналитических отчетов</p>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Слайд 5: Функционал -->
    <div class="slide">
        <div class="bg-pattern"></div>
        <div class="slide-content">
            <h1 class="slide-title">Возможности<br>системы</h1>
            <ul class="feature-list">
                <li class="feature-item">
                    <span class="feature-icon">✅</span>
                    <span><strong>Автоматизированный сбор отчетов</strong> с привязкой к объектам, работам и материалам</span>
                </li>
                <li class="feature-item">
                    <span class="feature-icon">📸</span>
                    <span><strong>Прикрепление фотографий</strong> для визуального подтверждения выполненных работ</span>
                </li>
                <li class="feature-item">
                    <span class="feature-icon">📊</span>
                    <span><strong>Ежедневная статистика</strong> по объектам с автоматическим формированием сводок</span>
                </li>
                <li class="feature-item">
                    <span class="feature-icon">📤</span>
                    <span><strong>Экспорт данных в Excel</strong> для дальнейшего анализа и отчетности</span>
                </li>
                <li class="feature-item">
                    <span class="feature-icon">🔔</span>
                    <span><strong>Автоматические уведомления</strong> о необходимости предоставления отчетов</span>
                </li>
                <li class="feature-item">
                    <span class="feature-icon">👥</span>
                    <span><strong>Гибкое управление доступом</strong> с разграничением по организациям и объектам</span>
                </li>
            </ul>
        </div>
    </div>
    
    <!-- Слайд 6: Статистика эффективности -->
    <div class="slide">
        <div class="bg-pattern"></div>
        <div class="slide-content centered">
            <h1 class="slide-title">Результаты<br>внедрения</h1>
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-number">80%</div>
                    <div class="stat-label">Сокращение времени<br>на отчетность</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">100%</div>
                    <div class="stat-label">Покрытие объектов<br>контролем</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">24/7</div>
                    <div class="stat-label">Доступность<br>информации</div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Слайд 7: ROI -->
    <div class="slide">
        <div class="bg-pattern"></div>
        <div class="slide-content">
            <h1 class="slide-title">Экономическая<br>эффективность</h1>
            <div class="roi-box">
                <div class="roi-title">Инвестиции окупаются за счет:</div>
                <div class="roi-items">
                    <div class="roi-item">
                        <h4>Сокращение трудозатрат</h4>
                        <p>Высвобождение времени сотрудников за счет автоматизации процессов сбора и обработки данных</p>
                    </div>
                    <div class="roi-item">
                        <h4>Снижение ошибок</h4>
                        <p>Минимизация финансовых потерь от ошибок в учете и отсутствия оперативной информации</p>
                    </div>
                    <div class="roi-item">
                        <h4>Улучшение контроля</h4>
                        <p>Оперативное выявление проблем на объектах позволяет избежать простоев и перерасхода ресурсов</p>
                    </div>
                    <div class="roi-item">
                        <h4>Централизация данных</h4>
                        <p>Единая база данных исключает дублирование информации и упрощает анализ</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Слайд 8: Технические характеристики -->
    <div class="slide">
        <div class="bg-pattern"></div>
        <div class="slide-content">
            <h1 class="slide-title">Технические<br>характеристики</h1>
            <div style="margin-top: 48px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 32px;">
                <div>
                    <h3 style="font-size: 24px; font-weight: 700; color: var(--color-primary); margin-bottom: 20px;">Инфраструктура</h3>
                    <ul style="list-style: none; font-size: 18px; color: var(--color-text-secondary); line-height: 2;">
                        <li>✓ Облачная платформа Telegram</li>
                        <li>✓ Надежное хранение данных (MongoDB)</li>
                        <li>✓ Автоматическое резервное копирование</li>
                        <li>✓ Масштабируемость под любую нагрузку</li>
                    </ul>
                </div>
                <div>
                    <h3 style="font-size: 24px; font-weight: 700; color: var(--color-primary); margin-bottom: 20px;">Безопасность</h3>
                    <ul style="list-style: none; font-size: 18px; color: var(--color-text-secondary); line-height: 2;">
                        <li>✓ Разграничение доступа по ролям</li>
                        <li>✓ Защищенное хранение данных</li>
                        <li>✓ Аудит всех изменений</li>
                        <li>✓ Интеграция с корпоративными группами</li>
                    </ul>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Слайд 9: Финальный -->
    <div class="slide final-slide">
        <div class="bg-pattern"></div>
        <div class="slide-content">
            <h1 class="slide-title">Готовы к<br>внедрению?</h1>
            <p class="slide-text" style="margin-top: 40px;">
                Система готова к использованию и может быть развернута<br>
                на ваших объектах в кратчайшие сроки.
            </p>
            <p class="slide-text" style="margin-top: 40px;">
                Обеспечьте своей организации современные инструменты<br>
                управления и контроля производственных процессов.
            </p>
            <div class="contact-info">
                <p style="margin-bottom: 12px;">Для получения дополнительной информации и демонстрации</p>
                <p style="font-weight: 600;">обратитесь к администратору системы</p>
            </div>
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
    console.log(`PDF презентация для директоров успешно создана: ${outputPath}`);
}

generatePDF().catch(console.error);

