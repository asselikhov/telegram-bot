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
    // Позволяет иметь должности с одинаковым названием в разных организациях
    await collection.createIndex({ organization: 1, name: 1 }, { unique: true });
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
    const now = new Date();
    const pos = {
        organization: positionData.organization || null,
        name: positionData.name,
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

