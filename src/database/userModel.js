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
            phone: userData.phone || ''
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

module.exports = { loadUsers, saveUser, deleteUser };