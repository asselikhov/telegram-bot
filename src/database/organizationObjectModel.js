const { connectMongo } = require('../config/mongoConfig');

let db;

async function getDb() {
    if (!db) {
        db = await connectMongo();
    }
    return db;
}

async function ensureIndexes() {
    const collection = (await getDb()).collection('organization_objects');
    await collection.createIndex({ organizationName: 1, objectName: 1 }, { unique: true });
    await collection.createIndex({ organizationName: 1 });
    await collection.createIndex({ objectName: 1 });
}

async function getOrganizationObjects(organizationName) {
    await ensureIndexes();
    const collection = (await getDb()).collection('organization_objects');
    const links = await collection.find({ organizationName }).toArray();
    return links.map(link => link.objectName);
}

async function getOrganizationsByObject(objectName) {
    await ensureIndexes();
    const collection = (await getDb()).collection('organization_objects');
    const links = await collection.find({ objectName }).toArray();
    return links.map(link => link.organizationName);
}

async function getAllOrganizationObjects() {
    await ensureIndexes();
    const collection = (await getDb()).collection('organization_objects');
    const links = await collection.find({}).toArray();
    const result = {};
    links.forEach(link => {
        if (!result[link.organizationName]) {
            result[link.organizationName] = [];
        }
        result[link.organizationName].push(link.objectName);
    });
    return result;
}

async function addObjectToOrganization(organizationName, objectName) {
    await ensureIndexes();
    const collection = (await getDb()).collection('organization_objects');
    const now = new Date();
    await collection.updateOne(
        { organizationName, objectName },
        {
            $set: {
                organizationName,
                objectName,
                createdAt: now
            }
        },
        { upsert: true }
    );
}

async function removeObjectFromOrganization(organizationName, objectName) {
    const collection = (await getDb()).collection('organization_objects');
    await collection.deleteOne({ organizationName, objectName });
}

async function removeAllObjectsFromOrganization(organizationName) {
    const collection = (await getDb()).collection('organization_objects');
    await collection.deleteMany({ organizationName });
}

async function removeOrganizationFromObject(objectName) {
    const collection = (await getDb()).collection('organization_objects');
    await collection.deleteMany({ objectName });
}

async function linkExists(organizationName, objectName) {
    const collection = (await getDb()).collection('organization_objects');
    const count = await collection.countDocuments({ organizationName, objectName });
    return count > 0;
}

module.exports = {
    getOrganizationObjects,
    getAllOrganizationObjects,
    getOrganizationsByObject,
    addObjectToOrganization,
    removeObjectFromOrganization,
    removeAllObjectsFromOrganization,
    removeOrganizationFromObject,
    linkExists
};

