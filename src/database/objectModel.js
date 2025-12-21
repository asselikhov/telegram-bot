const { connectMongo } = require('../config/mongoConfig');

let db;

async function getDb() {
    if (!db) {
        db = await connectMongo();
    }
    return db;
}

async function ensureIndexes() {
    const collection = (await getDb()).collection('objects');
    await collection.createIndex({ name: 1 }, { unique: true });
}

async function getAllObjects() {
    await ensureIndexes();
    const collection = (await getDb()).collection('objects');
    const objects = await collection.find({}).sort({ name: 1 }).toArray();
    return objects.map(obj => ({
        name: obj.name,
        telegramGroupId: obj.telegramGroupId || null,
        status: obj.status || 'В работе', // По умолчанию "В работе" для обратной совместимости
        createdAt: obj.createdAt,
        updatedAt: obj.updatedAt
    }));
}

async function getObject(name) {
    const collection = (await getDb()).collection('objects');
    const obj = await collection.findOne({ name });
    if (!obj) return null;
    return {
        name: obj.name,
        telegramGroupId: obj.telegramGroupId || null,
        status: obj.status || 'В работе', // По умолчанию "В работе" для обратной совместимости
        createdAt: obj.createdAt,
        updatedAt: obj.updatedAt
    };
}

async function createObject(objectData) {
    await ensureIndexes();
    const collection = (await getDb()).collection('objects');
    const now = new Date();
    const obj = {
        name: objectData.name,
        telegramGroupId: objectData.telegramGroupId || null,
        status: objectData.status || 'В работе', // По умолчанию "В работе"
        createdAt: now,
        updatedAt: now
    };
    await collection.insertOne(obj);
    return obj;
}

async function updateObject(name, updateData) {
    const collection = (await getDb()).collection('objects');
    const update = {
        ...updateData,
        updatedAt: new Date()
    };
    const result = await collection.findOneAndUpdate(
        { name },
        { $set: update },
        { returnDocument: 'after' }
    );
    return result.value;
}

async function deleteObject(name) {
    const collection = (await getDb()).collection('objects');
    await collection.deleteOne({ name });
}

async function objectExists(name) {
    const collection = (await getDb()).collection('objects');
    const count = await collection.countDocuments({ name });
    return count > 0;
}

module.exports = {
    getAllObjects,
    getObject,
    createObject,
    updateObject,
    deleteObject,
    objectExists
};

