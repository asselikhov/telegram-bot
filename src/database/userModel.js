const { connectMongo } = require('../config/mongoConfig');

let db;

async function getDb() {
    if (!db) {
        db = await connectMongo();
    }
    return db;
}

async function loadUsers() {
    const usersCollection = (await getDb()).collection('users');
    const users = await usersCollection.find({}).toArray();
    const usersMap = {};
    users.forEach(user => {
        let selectedObjects = Array.isArray(user.selectedObjects) ? user.selectedObjects : [];
        if (user.selectedObjects && !Array.isArray(user.selectedObjects)) {
            try {
                selectedObjects = JSON.parse(user.selectedObjects);
                if (!Array.isArray(selectedObjects)) {
                    selectedObjects = [selectedObjects];
                }
            } catch (e) {
                selectedObjects = [user.selectedObjects];
            }
        }
        usersMap[user.telegramId] = {
            fullName: user.fullName || '',
            position: user.position || '',
            organization: user.organization || '',
            selectedObjects,
            status: user.status || 'В работе',
            isApproved: user.isApproved || 0,
            nextReportId: user.nextReportId || 1,
            reports: user.reports || {},
            phone: user.phone || '',
            birthdate: user.birthdate || null,
            createdAt: user.createdAt || null
        };
    });
    return usersMap;
}

async function saveUser(telegramId, userData) {
    if (!telegramId) {
        throw new Error('telegramId is required');
    }
    const usersCollection = (await getDb()).collection('users');
    try {
        // Проверяем, существует ли пользователь
        const existingUser = await usersCollection.findOne({ telegramId });
        const now = new Date();
        
        const updateData = {
            telegramId,
            fullName: userData.fullName || '',
            position: userData.position || '',
            organization: userData.organization || '',
            selectedObjects: Array.isArray(userData.selectedObjects) ? userData.selectedObjects : [],
            status: userData.status || 'В работе',
            isApproved: userData.isApproved || 0,
            nextReportId: userData.nextReportId || 1,
            reports: userData.reports || {},
            phone: userData.phone || '',
            birthdate: userData.birthdate || null
        };
        
        // Устанавливаем createdAt только если пользователь новый
        if (!existingUser) {
            updateData.createdAt = userData.createdAt || now;
        } else if (userData.createdAt) {
            // Если явно передано createdAt, используем его
            updateData.createdAt = userData.createdAt;
        } else {
            // Сохраняем существующее createdAt
            updateData.createdAt = existingUser.createdAt || now;
        }
        
        await usersCollection.updateOne(
            { telegramId },
            { $set: updateData },
            { upsert: true }
        );
    } catch (error) {
        console.error(`Error saving user ${telegramId}:`, error);
        throw error;
    }
}

async function deleteUser(telegramId) {
    if (!telegramId) {
        throw new Error('telegramId is required');
    }
    const usersCollection = (await getDb()).collection('users');
    await usersCollection.deleteOne({ telegramId });
}

/**
 * Атомарно инкрементирует и возвращает nextReportId для пользователя
 * Использует $inc оператор MongoDB для избежания race conditions
 * @param {string} telegramId - ID пользователя
 * @returns {Promise<number>} Новое значение nextReportId
 */
async function incrementNextReportId(telegramId) {
    if (!telegramId) {
        throw new Error('telegramId is required');
    }
    const usersCollection = (await getDb()).collection('users');
    try {
        // Сначала проверяем, существует ли пользователь
        const existingUser = await usersCollection.findOne({ telegramId });
        
        if (!existingUser) {
            // Если пользователя нет, создаем его с nextReportId = 1, затем инкрементируем до 2
            // Первый отчет будет с ID _1, что правильно
            await usersCollection.updateOne(
                { telegramId },
                { 
                    $set: { 
                        telegramId,
                        nextReportId: 1,
                        fullName: '',
                        position: '',
                        organization: '',
                        selectedObjects: [],
                        status: 'В работе',
                        isApproved: 0,
                        reports: {},
                        phone: '',
                        birthdate: null,
                        createdAt: new Date()
                    }
                },
                { upsert: true }
            );
        }
        
        // Теперь безопасно инкрементируем nextReportId
        const result = await usersCollection.findOneAndUpdate(
            { telegramId },
            { $inc: { nextReportId: 1 } },
            { returnDocument: 'after' }
        );
        
        if (!result.value) {
            throw new Error(`Failed to increment nextReportId for user ${telegramId}`);
        }
        
        const newValue = result.value.nextReportId || 1;
        return newValue;
    } catch (error) {
        console.error(`Error incrementing nextReportId for user ${telegramId}:`, error);
        throw error;
    }
}

module.exports = { loadUsers, saveUser, deleteUser, incrementNextReportId };