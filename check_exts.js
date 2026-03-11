
const fetch = require('node-fetch');

async function check() {
    try {
        const res = await fetch('http://localhost:3000/api/extensions');
        const exts = await res.json();
        console.log(JSON.stringify(exts, null, 2));
    } catch (err) {
        console.error('Error:', err.message);
    }
}

check();
