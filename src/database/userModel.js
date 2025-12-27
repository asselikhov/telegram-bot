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
            status: user.status || 'Online',
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
            status: userData.status || 'Online',
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
        // Сначала пытаемся инкрементировать (если пользователь существует)
        const incResult = await usersCollection.findOneAndUpdate(
            { telegramId },
            { $inc: { nextReportId: 1 } },
            { returnDocument: 'after' }
        );
        
        // Если пользователь существует и инкремент успешен
        if (incResult && incResult.value && incResult.value.nextReportId) {
            return incResult.value.nextReportId;
        }
        
        // Если пользователь не существует или nextReportId отсутствует, создаем/обновляем
        // Используем updateOne с upsert, затем получаем значение
        await usersCollection.updateOne(
            { telegramId },
            {
                $setOnInsert: {
                    telegramId,
                    nextReportId: 1,
                    fullName: '',
                    position: '',
                    organization: '',
                    selectedObjects: [],
                    status: 'Online',
                    isApproved: 0,
                    reports: {},
                    phone: '',
                    birthdate: null,
                    createdAt: new Date()
                }
            },
            { upsert: true }
        );
        
        // Теперь инкрементируем (пользователь точно существует)
        const finalResult = await usersCollection.findOneAndUpdate(
            { telegramId },
            { $inc: { nextReportId: 1 } },
            { returnDocument: 'after' }
        );
        
        if (!finalResult || !finalResult.value) {
            // Если всё ещё не получилось, получаем значение напрямую
            const user = await usersCollection.findOne({ telegramId });
            if (user && user.nextReportId) {
                // Инкрементируем вручную
                await usersCollection.updateOne(
                    { telegramId },
                    { $inc: { nextReportId: 1 } }
                );
                return user.nextReportId + 1;
            }
            throw new Error(`Failed to increment nextReportId for user ${telegramId}`);
        }
        
        return finalResult.value.nextReportId || 1;
    } catch (error) {
        console.error(`Error incrementing nextReportId for user ${telegramId}:`, error);
        throw error;
    }
}

module.exports = { loadUsers, saveUser, deleteUser, incrementNextReportId };