const { connectMongo } = require('../config/mongoConfig');

let db;

async function getDb() {
    if (!db) {
        db = await connectMongo();
    }
    return db;
}

async function getNotificationSettings(type = 'reports') {
    const collection = (await getDb()).collection('notification_settings');
    
    // Миграция старой структуры (для обратной совместимости)
    const oldSettings = await collection.findOne({ id: 'default' });
    if (oldSettings && !oldSettings.type) {
        // Мигрируем старые настройки в новый формат
        await collection.updateOne(
            { id: 'default' },
            { $set: { type: 'reports', id: 'reports' } }
        );
    }
    
    let settings = await collection.findOne({ type });
    
    if (!settings) {
        // Создаем настройки по умолчанию
        const defaultSettings = type === 'statistics' 
            ? {
                type: 'statistics',
                id: 'statistics',
                enabled: true,
                time: '20:00',
                timezone: 'Europe/Moscow',
                updatedAt: new Date()
            }
            : {
                type: 'reports',
                id: 'reports',
                enabled: true,
                time: '19:00',
                timezone: 'Europe/Moscow',
                messageTemplate: '⚠️ Напоминание\n<blockquote>{fullName},\nвы не предоставили отчет за {date}г.\nПожалуйста, внесите данные.</blockquote>',
                updatedAt: new Date()
            };
        await collection.insertOne(defaultSettings);
        settings = defaultSettings;
    }
    
    // Исправляем шаблон в базе данных, если он не содержит blockquote (миграция)
    if (type === 'reports' && settings.messageTemplate && !settings.messageTemplate.includes('<blockquote>')) {
        let fixedTemplate = settings.messageTemplate;
        // Если шаблон начинается с "⚠️ Напоминание\n", оборачиваем остальное в blockquote
        if (fixedTemplate.startsWith('⚠️ Напоминание\n')) {
            const content = fixedTemplate.substring('⚠️ Напоминание\n'.length);
            fixedTemplate = `⚠️ Напоминание\n<blockquote>${content}</blockquote>`;
        } else {
            // Иначе просто оборачиваем весь шаблон в blockquote
            fixedTemplate = `<blockquote>${fixedTemplate}</blockquote>`;
        }
        // Убираем лишние пустые строки (3+ переносов строк заменяем на 2, затем 2+ на 1)
        fixedTemplate = fixedTemplate.replace(/\n{3,}/g, '\n\n');
        fixedTemplate = fixedTemplate.replace(/\n{2,}/g, '\n');
        // Обновляем шаблон в базе данных
        await collection.updateOne(
            { type },
            { $set: { messageTemplate: fixedTemplate, updatedAt: new Date() } }
        );
        settings.messageTemplate = fixedTemplate;
        console.log('Шаблон уведомлений исправлен в базе данных (добавлен blockquote, убраны пустые строки)');
    } else if (type === 'reports' && settings.messageTemplate) {
        // Убираем лишние пустые строки из существующего шаблона
        let fixedTemplate = settings.messageTemplate;
        const originalTemplate = fixedTemplate;
        fixedTemplate = fixedTemplate.replace(/\n{3,}/g, '\n\n');
        fixedTemplate = fixedTemplate.replace(/\n{2,}/g, '\n');
        if (fixedTemplate !== originalTemplate) {
            await collection.updateOne(
                { type },
                { $set: { messageTemplate: fixedTemplate, updatedAt: new Date() } }
            );
            settings.messageTemplate = fixedTemplate;
            console.log('Шаблон уведомлений исправлен в базе данных (убраны пустые строки)');
        }
    }
    
    return {
        type: settings.type || type,
        id: settings.id || settings.type || type,
        enabled: settings.enabled !== false,
        time: settings.time || (type === 'statistics' ? '20:00' : '19:00'),
        timezone: settings.timezone || 'Europe/Moscow',
        messageTemplate: settings.messageTemplate || (type === 'statistics' ? null : '⚠️ Напоминание\n<blockquote>{fullName},\nвы не предоставили отчет за {date}г.\nПожалуйста, внесите данные.</blockquote>'),
        updatedAt: settings.updatedAt
    };
}

async function getAllNotificationSettings() {
    const collection = (await getDb()).collection('notification_settings');
    
    // Миграция старой структуры
    const oldSettings = await collection.findOne({ id: 'default' });
    if (oldSettings && !oldSettings.type) {
        await collection.updateOne(
            { id: 'default' },
            { $set: { type: 'reports', id: 'reports' } }
        );
    }
    
    // Получаем все настройки
    const allSettings = await collection.find({}).toArray();
    
    // Убеждаемся, что есть настройки для обоих типов
    const types = ['reports', 'statistics'];
    const result = {};
    
    for (const type of types) {
        let settings = allSettings.find(s => (s.type || s.id) === type);
        if (!settings) {
            // Создаем настройки по умолчанию
            const defaultSettings = type === 'statistics' 
                ? {
                    type: 'statistics',
                    id: 'statistics',
                    enabled: true,
                    time: '20:00',
                    timezone: 'Europe/Moscow',
                    updatedAt: new Date()
                }
                : {
                    type: 'reports',
                    id: 'reports',
                    enabled: true,
                    time: '19:00',
                    timezone: 'Europe/Moscow',
                    messageTemplate: '⚠️ Напоминание\n<blockquote>{fullName},\nвы не предоставили отчет за {date}г.\nПожалуйста, внесите данные.</blockquote>',
                    updatedAt: new Date()
                };
            await collection.insertOne(defaultSettings);
            settings = defaultSettings;
        }
        
        // Исправляем шаблон в базе данных, если он не содержит blockquote (миграция)
        if (type === 'reports' && settings.messageTemplate && !settings.messageTemplate.includes('<blockquote>')) {
            let fixedTemplate = settings.messageTemplate;
            // Если шаблон начинается с "⚠️ Напоминание\n", оборачиваем остальное в blockquote
            if (fixedTemplate.startsWith('⚠️ Напоминание\n')) {
                const content = fixedTemplate.substring('⚠️ Напоминание\n'.length);
                fixedTemplate = `⚠️ Напоминание\n<blockquote>${content}</blockquote>`;
            } else {
                // Иначе просто оборачиваем весь шаблон в blockquote
                fixedTemplate = `<blockquote>${fixedTemplate}</blockquote>`;
            }
            // Убираем лишние пустые строки (3+ переносов строк заменяем на 2, затем 2+ на 1)
            fixedTemplate = fixedTemplate.replace(/\n{3,}/g, '\n\n');
            fixedTemplate = fixedTemplate.replace(/\n{2,}/g, '\n');
            // Обновляем шаблон в базе данных
            await collection.updateOne(
                { type },
                { $set: { messageTemplate: fixedTemplate, updatedAt: new Date() } }
            );
            settings.messageTemplate = fixedTemplate;
            console.log('Шаблон уведомлений исправлен в базе данных (добавлен blockquote, убраны пустые строки)');
        } else if (type === 'reports' && settings.messageTemplate) {
            // Убираем лишние пустые строки из существующего шаблона
            let fixedTemplate = settings.messageTemplate;
            const originalTemplate = fixedTemplate;
            fixedTemplate = fixedTemplate.replace(/\n{3,}/g, '\n\n');
            fixedTemplate = fixedTemplate.replace(/\n{2,}/g, '\n');
            if (fixedTemplate !== originalTemplate) {
                await collection.updateOne(
                    { type },
                    { $set: { messageTemplate: fixedTemplate, updatedAt: new Date() } }
                );
                settings.messageTemplate = fixedTemplate;
                console.log('Шаблон уведомлений исправлен в базе данных (убраны пустые строки)');
            }
        }
        
        result[type] = {
            type: settings.type || type,
            id: settings.id || settings.type || type,
            enabled: settings.enabled !== false,
            time: settings.time || (type === 'statistics' ? '20:00' : '19:00'),
            timezone: settings.timezone || 'Europe/Moscow',
            messageTemplate: settings.messageTemplate || (type === 'statistics' ? null : '⚠️ Напоминание\n<blockquote>{fullName},\nвы не предоставили отчет за {date}г.\nПожалуйста, внесите данные.</blockquote>'),
            updatedAt: settings.updatedAt
        };
    }
    
    return result;
}

async function updateNotificationSettings(type, updateData) {
    const collection = (await getDb()).collection('notification_settings');
    
    // Для обратной совместимости: если type не указан, используем 'reports'
    if (!type || (typeof type === 'object' && !updateData)) {
        // Старый формат вызова: updateNotificationSettings(updateData)
        updateData = type;
        type = 'reports';
    }
    
    // Миграция старой структуры
    const oldSettings = await collection.findOne({ id: 'default' });
    if (oldSettings && !oldSettings.type && type === 'reports') {
        await collection.updateOne(
            { id: 'default' },
            { $set: { type: 'reports', id: 'reports' } }
        );
    }
    
    const update = {
        ...updateData,
        updatedAt: new Date()
    };
    
    // Убеждаемся, что type и id установлены
    if (!update.type) {
        update.type = type;
    }
    if (!update.id) {
        update.id = type;
    }
    
    const result = await collection.findOneAndUpdate(
        { type },
        { $set: update },
        { upsert: true, returnDocument: 'after' }
    );
    return result.value;
}

module.exports = {
    getNotificationSettings,
    getAllNotificationSettings,
    updateNotificationSettings
};

