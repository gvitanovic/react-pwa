// Run this once to generate VAPID keys
// npm install web-push
// node generate-vapid.js

import webpush from 'web-push';

const vapidKeys = webpush.generateVAPIDKeys();

console.log('VAPID Keys Generated:');
console.log('Public Key:', vapidKeys.publicKey);
console.log('Private Key:', vapidKeys.privateKey);

console.log('\nAdd these to your .env file:');
console.log(`VITE_VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);

console.log('\nPublic Key Length:', vapidKeys.publicKey.length);
console.log('Private Key Length:', vapidKeys.privateKey.length);

// Also show how to use in React
console.log('\n--- Copy this public key to your React App.tsx ---');
console.log(`const vapidPublicKey = '${vapidKeys.publicKey}';`);
