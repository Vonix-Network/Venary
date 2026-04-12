/* =======================================
   Venary — Centralized Event Bus
   All routes emit here; socket.js fans out.
   ======================================= */
const EventEmitter = require('events');

class VenaryEventBus extends EventEmitter {}

const eventBus = new VenaryEventBus();
eventBus.setMaxListeners(100);

module.exports = eventBus;
