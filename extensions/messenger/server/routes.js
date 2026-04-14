/* ARCHIVED — NOT LOADED BY THE SERVER. Live file: server/routes/messenger/
 * =======================================
   Messenger — Route Factory
   Mounts all sub-routers and attaches
   the /messenger Socket.IO namespace.
   ======================================= */
const express = require('express');
const attachMessengerNamespace = require('./socket');

module.exports = function (db, { io } = {}) {
    const router = express.Router();

    // Attach Socket.IO namespace once io is available
    let ns = null;
    if (io) {
        ns = attachMessengerNamespace(io, db);
    }

    // Mount sub-routers, each receives db + ns for socket emissions
    // NOTE: spaces MUST be mounted at '/spaces' (not '/') to prevent its
    // wildcard GET /:id route from swallowing /dm, /settings, /requests, etc.
    router.use('/spaces', require('./routes/spaces')(db, ns));
    router.use('/', require('./routes/channels')(db, ns));
    router.use('/', require('./routes/messages')(db, ns));
    router.use('/', require('./routes/roles')(db, ns));
    router.use('/', require('./routes/members')(db, ns));
    router.use('/', require('./routes/invites')(db, ns));
    router.use('/', require('./routes/webhooks')(db, ns));
    router.use('/', require('./routes/bots')(db, ns));
    router.use('/', require('./routes/dm')(db, ns));
    router.use('/', require('./routes/settings')(db, ns));

    // Health check / info
    router.get('/info', (req, res) => {
        res.json({
            extension: 'messenger',
            version: '1.0.0',
            namespace: '/messenger'
        });
    });

    // Expose namespace attachment hook (used by extension-loader for Socket.IO wiring)
    router.attachConsoleNamespace = function (ioInstance) {
        if (!ns && ioInstance) {
            ns = attachMessengerNamespace(ioInstance, db);
        }
    };

    return router;
};
