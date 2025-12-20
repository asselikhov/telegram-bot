const { connectMongo } = require('../config/mongoConfig');

let db;

async function getDb() {
    if (!db) {
        db = await connectMongo();
    }
    return db;
}

async function ensureIndexes() {
    const collection = (await getDb()).collection('organizations');
    await collection.createIndex({ name: 1 }, { unique: true });
}

async function getAllOrganizations() {
    await ensureIndexes();
    const collection = (await getDb()).collection('organizations');
    const organizations = await collection.find({}).sort({ name: 1 }).toArray();
    return organizations.map(org => ({
        name: org.name,
        chatId: org.chatId || null,
        reportSources: org.reportSources || [],
        createdAt: org.createdAt,
        updatedAt: org.updatedAt
    }));
}

async function getOrganization(name) {
    const collection = (await getDb()).collection('organizations');
    const org = await collection.findOne({ name });
    if (!org) return null;
    return {
        name: org.name,
        chatId: org.chatId || null,
        reportSources: org.reportSources || [],
        createdAt: org.createdAt,
        updatedAt: org.updatedAt
    };
}

async function createOrganization(organizationData) {
    await ensureIndexes();
    const collection = (await getDb()).collection('organizations');
    const now = new Date();
    const org = {
        name: organizationData.name,
        chatId: organizationData.chatId || null,
        reportSources: organizationData.reportSources || [],
        createdAt: now,
        updatedAt: now
    };
    await collection.insertOne(org);
    return org;
}

async function updateOrganization(name, updateData) {
    const collection = (await getDb()).collection('organizations');
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

async function deleteOrganization(name) {
    const collection = (await getDb()).collection('organizations');
    await collection.deleteOne({ name });
}

async function organizationExists(name) {
    const collection = (await getDb()).collection('organizations');
    const count = await collection.countDocuments({ name });
    return count > 0;
}

module.exports = {
    getAllOrganizations,
    getOrganization,
    createOrganization,
    updateOrganization,
    deleteOrganization,
    organizationExists
};

