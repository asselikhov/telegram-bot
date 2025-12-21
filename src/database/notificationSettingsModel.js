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

