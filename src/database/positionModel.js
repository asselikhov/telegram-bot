const { connectMongo } = require('../config/mongoConfig');

let db;

async function getDb() {
    if (!db) {
        db = await connectMongo();
    }
    return db;
}

async function ensureIndexes() {
    const collection = (await getDb()).collection('positions');
    // Составной индекс для уникальности должности в пределах организации
    await collection.createIndex({ organization: 1, name: 1 }, { unique: true });
    // Старый индекс для обратной совместимости (будет удален при миграции)
    try {
        await collection.createIndex({ name: 1 }, { unique: false });
    } catch (e) {
        // Индекс может уже существовать, игнорируем ошибку
    }
}

async function getAllPositions(organization) {
    await ensureIndexes();
    const collection = (await getDb()).collection('positions');
    const query = organization ? { organization } : {};
    const positions = await collection.find(query).sort({ name: 1 }).toArray();
    return positions.map(pos => ({
        organization: pos.organization || null,
        name: pos.name,
        isAdmin: pos.isAdmin || false,
        createdAt: pos.createdAt,
        updatedAt: pos.updatedAt
    }));
}

async function getAllPositionsGlobally() {
    await ensureIndexes();
    const collection = (await getDb()).collection('positions');
    const positions = await collection.find({}).sort({ organization: 1, name: 1 }).toArray();
    return positions.map(pos => ({
        organization: pos.organization || null,
        name: pos.name,
        isAdmin: pos.isAdmin || false,
        createdAt: pos.createdAt,
        updatedAt: pos.updatedAt
    }));
}

async function getPosition(organization, name) {
    const collection = (await getDb()).collection('positions');
    const pos = await collection.findOne({ organization, name });
    if (!pos) return null;
    return {
        organization: pos.organization || null,
        name: pos.name,
        isAdmin: pos.isAdmin || false,
        createdAt: pos.createdAt,
        updatedAt: pos.updatedAt
    };
}

async function createPosition(positionData) {
    await ensureIndexes();
    const collection = (await getDb()).collection('positions');
    
    // Проверяем существование должности перед созданием
    const orgName = positionData.organization || null;
    const posName = positionData.name;
    
    // Проверяем, не существует ли уже должность с таким именем в этой организации
    const existing = await collection.findOne({ organization: orgName, name: posName });
    if (existing) {
        const error = new Error(`Должность "${posName}" уже существует в организации "${orgName || 'без организации'}"`);
        error.code = 11000; // Код ошибки дубликата
        throw error;
    }
    
    const now = new Date();
    const pos = {
        organization: orgName,
        name: posName,
        isAdmin: positionData.isAdmin || false,
        createdAt: now,
        updatedAt: now
    };
    await collection.insertOne(pos);
    return pos;
}

async function updatePosition(organization, name, updateData) {
    const collection = (await getDb()).collection('positions');
    const update = {
        ...updateData,
        updatedAt: new Date()
    };
    const result = await collection.findOneAndUpdate(
        { organization, name },
        { $set: update },
        { returnDocument: 'after' }
    );
    return result.value;
}

async function deletePosition(organization, name) {
    const collection = (await getDb()).collection('positions');
    await collection.deleteOne({ organization, name });
}

async function positionExists(organization, name) {
    const collection = (await getDb()).collection('positions');
    const count = await collection.countDocuments({ organization, name });
    return count > 0;
}

module.exports = {
    getAllPositions,
    getAllPositionsGlobally,
    getPosition,
    createPosition,
    updatePosition,
    deletePosition,
    positionExists
};

