const express = require('express')
const path = require('path')

const PORT = process.env.PORT || 3000;

const app = express(); // init express

app.get('/', (req, res) => { // handle GET requests at '/’
    res.send('Hello World!') // simply send back 'Hello World'
})

app.use(express.static(path.join(__dirname, 'public')))
    .listen(PORT, () => console.log(`Listening on ${ PORT }`));

