const express = require('express')
const path = require('path')

const PORT = process.env.PORT || 3000;

const app = express(); // init express

app.get('/', (req, res) => { // handle GET requests at '/'
    const { from, magic } = req.params;
    let authorized = magic === process.env.magic;
    res.send(`Hello World! -> authorized: ${authorized}, from: ${from}`);
})

app.use(express.static(path.join(__dirname, 'public')))
    .listen(PORT, () => console.log(`Listening on ${ PORT }`));

