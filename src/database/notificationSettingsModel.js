const { connectMongo } = require('../config/mongoConfig');

let db;

async function getDb() {
    if (!db) {
        db = await connectMongo();
    }
    return db;
}

async function getNotificationSettings() {
    const collection = (await getDb()).collection('notification_settings');
    let settings = await collection.findOne({ id: 'default' });
    
    if (!settings) {
        // Создаем настройки по умолчанию
        settings = {
            id: 'default',
            enabled: true,
            time: '19:00',
            timezone: 'Europe/Moscow',
            messageTemplate: '⚠️ Напоминание\n{fullName}, вы не предоставили отчет за {date}.\n\nПожалуйста, внесите данные.',
            updatedAt: new Date()
        };
        await collection.insertOne(settings);
    }
    
    return {
        id: settings.id,
        enabled: settings.enabled !== false,
        time: settings.time || '19:00',
        timezone: settings.timezone || 'Europe/Moscow',
        messageTemplate: settings.messageTemplate || '⚠️ Напоминание\n{fullName}, вы не предоставили отчет за {date}.\n\nПожалуйста, внесите данные.',
        updatedAt: settings.updatedAt
    };
}

async function updateNotificationSettings(updateData) {
    const collection = (await getDb()).collection('notification_settings');
    const update = {
        ...updateData,
        updatedAt: new Date()
    };
    const result = await collection.findOneAndUpdate(
        { id: 'default' },
        { $set: update },
        { upsert: true, returnDocument: 'after' }
    );
    return result.value;
}

module.exports = {
    getNotificationSettings,
    updateNotificationSettings
};

