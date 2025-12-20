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
    await collection.createIndex({ name: 1 }, { unique: true });
}

async function getAllPositions() {
    await ensureIndexes();
    const collection = (await getDb()).collection('positions');
    const positions = await collection.find({}).sort({ name: 1 }).toArray();
    return positions.map(pos => ({
        name: pos.name,
        isAdmin: pos.isAdmin || false,
        createdAt: pos.createdAt,
        updatedAt: pos.updatedAt
    }));
}

async function getPosition(name) {
    const collection = (await getDb()).collection('positions');
    const pos = await collection.findOne({ name });
    if (!pos) return null;
    return {
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
        name: positionData.name,
        isAdmin: positionData.isAdmin || false,
        createdAt: now,
        updatedAt: now
    };
    await collection.insertOne(pos);
    return pos;
}

async function updatePosition(name, updateData) {
    const collection = (await getDb()).collection('positions');
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

async function deletePosition(name) {
    const collection = (await getDb()).collection('positions');
    await collection.deleteOne({ name });
}

async function positionExists(name) {
    const collection = (await getDb()).collection('positions');
    const count = await collection.countDocuments({ name });
    return count > 0;
}

module.exports = {
    getAllPositions,
    getPosition,
    createPosition,
    updatePosition,
    deletePosition,
    positionExists
};

