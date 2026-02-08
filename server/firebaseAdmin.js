import fs from 'fs';
import admin from 'firebase-admin';

let app = null;
let overrideServiceAccountPath = null;

const getServiceAccount = () => {
    const jsonPath = overrideServiceAccountPath || process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (!overrideServiceAccountPath) {
        // eslint-disable-next-line no-console
        console.log('Using Firebase service account path:', jsonPath);
    }
    
    if (jsonPath) {
        return { path: jsonPath };
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (!projectId || !clientEmail || !privateKey) {
        return null;
    }

    return {
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n')
    };
};

export const setServiceAccountPath = async (path) => {
    overrideServiceAccountPath = path;
    if (app) {
        await app.delete();
        app = null;
    }
};

export const getFirestoreAdmin = () => {
    if (app) {
        return admin.firestore(app);
    }

    const serviceAccount = getServiceAccount();
    if (!serviceAccount) {
        throw new Error('Missing Firebase Admin credentials. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.');
    }

    if (serviceAccount.path) {
        const serviceAccountJson = JSON.parse(fs.readFileSync(serviceAccount.path, 'utf8'));
        app = admin.initializeApp({
            credential: admin.credential.cert(serviceAccountJson)
        });
    } else {
        app = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }

    return admin.firestore(app);
};
