const functions = require('firebase-functions');
const admin = require('firebase-admin');
const mimeTypes = require('mimetypes');

admin.initializeApp();

exports.createBook = functions.https.onCall(async (data, context) => {
    checkAuthentication(context, true);
    dataValidator(data, {
        bookName: 'string',
        bookCover: 'string',
        authorId: 'string',
        summary: 'string'
    })
    const mimeType = data.bookCover.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/)[1];
    const base64EncodedImageString = data.bookCover.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = new Buffer(base64EncodedImageString, 'base64');

    const filename = `bookCovers/${data.bookName}.${mimeTypes.detectExtension(mimeType)}`;
    const file = admin.storage().bucket().file(filename);
    await file.save(imageBuffer, { contentType: 'image/jpeg' });
    const fileUrl = await file.getSignedUrl({ action: 'read', expires: '03-09-2491' }).then(urls => urls[0]);

    return admin.firestore().collection('books').add({
        title: data.bookName,
        imageUrl: fileUrl,
        author: admin.firestore().collection('authors').doc(data.authorId),
        summary: data.summary
    });
});

exports.createAuthor = functions.https.onCall(async (data, context) => {
    checkAuthentication(context, true);
    dataValidator(data, { authorName: 'string' })

    const author = await admin.firestore().collection('authors')
        .where('name', '==', data.authorName)
        .limit(1)
        .get();

    if (!author.empty) {
        throw new functions.https.HttpsError('already-exists', 'This author already exists.')
    }

    return admin.firestore().collection('authors').add({ name: data.authorName });
});

exports.createPublicProfile = functions.https.onCall(async (data, context) => {
    checkAuthentication(context);
    dataValidator(data, { user: 'string' })

    const userProfile = await admin.firestore().collection('publicProfiles')
        .where('userId', '==', context.auth.uid)
        .limit(1)
        .get();

    if (!userProfile.empty) {
        throw new functions.https.HttpsError('already-exists', 'This user already has a public profile.')
    }

    const publicProfile = await admin.firestore().collection('publicProfiles').doc(data.user).get();
    if (publicProfile.exists) {
        throw new functions.https.HttpsError('already-exists', 'This username already belongs to an existing user.')
    }

    const currentUser = await admin.auth().getUser(context.auth.uid);
    if (currentUser.email === functions.config().accounts.admin) {
        await admin.auth().setCustomUserClaims(context.auth.uid, { admin: true });
    }


    return admin.firestore().collection('publicProfiles').doc(data.user).set({
        userId: context.auth.uid
    });
});



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

function checkAuthentication(context, admin) {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be signed in to use this feature.')
    } else if (!context.auth.token.admin && admin) {
        throw new functions.https.HttpsError('permission-denied', 'You must be an admin to use this feature.')
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