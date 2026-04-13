'use strict';
const express = require('express');
const attachMessengerNamespace = require('../../services/messenger-socket');

let _ns = null;
const getNs = () => _ns;

const router = express.Router();

router.use('/spaces', require('./spaces')(getNs));
router.use('/', require('./channels')(getNs));
router.use('/', require('./messages')(getNs));
router.use('/', require('./roles')(getNs));
router.use('/', require('./members')(getNs));
router.use('/', require('./invites')(getNs));
router.use('/', require('./webhooks')(getNs));
router.use('/', require('./bots')(getNs));
router.use('/', require('./dm')(getNs));
router.use('/', require('./settings')(getNs));

router.get('/info', (req, res) => res.json({
    feature: 'messenger',
    version: '1.0.0',
    namespace: '/messenger',
}));

function attachNamespace(io) {
    _ns = attachMessengerNamespace(io);
    return _ns;
}

router.attachNamespace = attachNamespace;

module.exports = router;
