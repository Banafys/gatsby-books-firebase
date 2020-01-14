const functions = require('firebase-functions');
const admin = require('firebase-admin');
// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });
admin.initializeApp();

exports.postComment = functions.https.onCall((data, context) => {
    checkAuthentication(context);
    dataValidator(data, {
        bookId: 'string',
        text: 'string'
    });

    // sanitize text data and bookId

    const db = admin.firestore();
    return db.collection('publicProfiles').where('userId', '==', context.auth.uid)
        .limit(1)
        .get()
        .then((snapshot) => {
            return db.collection('comments').add({
                text: data.text,
                user: snapshot.docs[0].id,
                dateCreated: new Date(),
                book: db.collection('books').doc(data.bookId)
            });
        });
});

function checkAuthentication(context) {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be signed in to use this feature.')
    }
}

function dataValidator(data, validKeys) {
    if (Object.keys(data).length !== Object.keys(validKeys).length) {
        throw new functions.https.HttpsError('invalid-argument', 'Data object contains invalid number of keys.')
    } else {
        for (let key in data) {
            if (!validKeys[key] || typeof data[key] !== validKeys[key]) {
                throw new functions.https.HttpsError('invalid-argument', 'Data object contains invalid properties.')
            }
        }
    }
}