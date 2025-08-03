// Server-side push notification sender
// npm install express web-push cors
// node server/push-server.js

const express = require('express');
const webpush = require('web-push');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Configure VAPID keys
const vapidKeys = {
    publicKey: process.env.VITE_VAPID_PUBLIC_KEY || 'BFRiNKobG1IwhCrVyJHUkEDRqsWlFp3c1da2fvQUVmqIIMApOFlcgfdKi1tN-O1MDnLOgDx_RscduWfv-LkXmgg',
    privateKey: process.env.VAPID_PRIVATE_KEY || 'Jb4ePUbFud0eoqe-g9rYauAkYie7J143GMrGU4vUsgo'
};

webpush.setVapidDetails(
    'mailto:your-email@example.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

// Store subscriptions (in production, use a database)
let subscriptions = [];

// Endpoint to store user subscriptions
app.post('/api/subscribe', (req, res) => {
    const subscription = req.body;

    // Avoid duplicates
    const exists = subscriptions.find(sub =>
        sub.endpoint === subscription.endpoint
    );

    if (!exists) {
        subscriptions.push(subscription);
        console.log('New subscription added:', subscription.endpoint);
    }

    res.json({ success: true, total: subscriptions.length });
});

// Endpoint to send notifications to all users
app.post('/api/notify-all', async (req, res) => {
    const { title, body, data } = req.body;

    const payload = JSON.stringify({
        title: title || 'Pokemon PWA Update',
        body: body || 'New Pokemon data available!',
        icon: '/vite.svg',
        badge: '/vite.svg',
        data: data || { url: '/' }
    });

    console.log(`Sending notification to ${subscriptions.length} subscribers`);

    const promises = subscriptions.map(async (subscription, index) => {
        try {
            await webpush.sendNotification(subscription, payload);
            console.log(`✅ Notification sent to subscriber ${index + 1}`);
            return { success: true, index };
        } catch (error) {
            console.log(`❌ Failed to send to subscriber ${index + 1}:`, error.message);

            // Remove invalid subscriptions
            if (error.statusCode === 410) {
                subscriptions.splice(subscriptions.indexOf(subscription), 1);
            }

            return { success: false, index, error: error.message };
        }
    });

    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;

    res.json({
        success: true,
        sent: successful,
        total: subscriptions.length,
        results: results.map(r => r.status === 'fulfilled' ? r.value : r.reason)
    });
});

// Endpoint to send notification to specific user
app.post('/api/notify-user', async (req, res) => {
    const { endpoint, title, body, data } = req.body;

    const subscription = subscriptions.find(sub => sub.endpoint === endpoint);

    if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found' });
    }

    const payload = JSON.stringify({
        title: title || 'Personal Pokemon Update',
        body: body || 'You have a new Pokemon notification!',
        icon: '/vite.svg',
        data: data || { url: '/' }
    });

    try {
        await webpush.sendNotification(subscription, payload);
        res.json({ success: true, message: 'Notification sent' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get subscription count
app.get('/api/subscribers', (req, res) => {
    res.json({ count: subscriptions.length });
});

// Test endpoint
app.post('/api/test-notification', async (req, res) => {
    const payload = JSON.stringify({
        title: '🧪 Test Notification',
        body: 'This is a test notification from your Pokemon PWA server!',
        icon: '/vite.svg',
        badge: '/vite.svg',
        data: { url: '/', test: true }
    });

    console.log(`Sending test notification to ${subscriptions.length} subscribers`);

    if (subscriptions.length === 0) {
        return res.json({ message: 'No subscribers to send test notification' });
    }

    try {
        // Send to first subscriber only for testing
        await webpush.sendNotification(subscriptions[0], payload);
        res.json({ success: true, message: 'Test notification sent to first subscriber' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 Push notification server running on port ${PORT}`);
    console.log(`📝 Endpoints:`);
    console.log(`   POST /api/subscribe - Subscribe user to notifications`);
    console.log(`   POST /api/notify-all - Send notification to all users`);
    console.log(`   POST /api/notify-user - Send notification to specific user`);
    console.log(`   POST /api/test-notification - Send test notification`);
    console.log(`   GET  /api/subscribers - Get subscriber count`);
});

module.exports = app;
