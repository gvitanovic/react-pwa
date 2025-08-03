// Test VAPID key conversion
const vapidPublicKey = 'BFRiNKobG1IwhCrVyJHUkEDRqsWlFp3c1da2fvQUVmqIIMApOFlcgfdKi1tN-O1MDnLOgDx_RscduWfv-LkXmgg';

const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
};

try {
    const converted = urlBase64ToUint8Array(vapidPublicKey);
    console.log('VAPID Key Length:', vapidPublicKey.length);
    console.log('Converted Array Length:', converted.length);
    console.log('✅ VAPID key is valid!');
} catch (error) {
    console.error('❌ VAPID key error:', error.message);
}
