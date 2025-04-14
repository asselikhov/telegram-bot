const { connectMongo } = require('../config/mongoConfig');

async function loadUsers() {
    const db = await connectMongo();
    const usersCollection = db.collection('users');
    const users = await usersCollection.find({}).toArray();
    const usersMap = {};
    users.forEach(user => {
        let selectedObjects = [];
        if (user.selectedobjects) {
            try {
                selectedObjects = Array.isArray(user.selectedobjects)
                    ? user.selectedobjects
                    : JSON.parse(user.selectedobjects);
            } catch (e) {
                selectedObjects = [user.selectedobjects];
            }
        }
        usersMap[user.userid] = {
            fullName: user.fullname,
            position: user.position,
            organization: user.organization,
            selectedObjects: selectedObjects,
            status: user.status,
            isApproved: user.isapproved,
            nextReportId: user.nextreportid || 1,
            reports: user.reports || {}
        };
    });
    return usersMap;
}

async function saveUser(userId, userData) {
    const db = await connectMongo();
    const usersCollection = db.collection('users');
    await usersCollection.updateOne(
        { userid: userId },
        {
            $set: {
                userid: userId,
                fullname: userData.fullName,
                position: userData.position,
                organization: userData.organization,
                selectedobjects: JSON.stringify(userData.selectedObjects),
                status: userData.status,
                isapproved: userData.isApproved,
                nextreportid: userData.nextReportId,
                reports: userData.reports
            }
        },
        { upsert: true }
    );
}

async function deleteUser(userId) {
    const db = await connectMongo();
    const usersCollection = db.collection('users');
    await usersCollection.deleteOne({ userid: userId });
}

module.exports = { loadUsers, saveUser, deleteUser };