const express = require('express')
const path = require('path')
const { Pharmacy, Locality, City, OnCalls } = require("./data");
const { auth } = require('express-openid-connect');

const app = express(); // init express

const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.AUTH0_CLIENT_SECRET,
  baseURL: process.env.AUTH0_BASE_URL,
  clientID: process.env.AUTH0_CLIENT_ID,
  issuerBaseURL: process.env.AUTH0_DOMAIN
};

const PORT = process.env.PORT || 3000;
if (!config.baseURL && !process.env.AUTH0_BASE_URL && process.env.PORT && process.env.NODE_ENV !== 'production') {
  config.baseURL = `http://localhost:${PORT}`;
}
app.use(auth(config));


// auth router attaches /login, /logout, and /callback routes to the baseURL
app.use(express.static(path.join(__dirname, 'images')));
app.use(express.json({limit: '2mb'}));
app.set('view engine', 'ejs'); // set the view engine to ejs

// index page
app.get('/', (req, res) => { // handle GET requests at '/'
    const { from, magic } = req.params;
    let authorized = magic === process.env.magic;
    res.send(`Hello World! -> authorized: ${authorized}, from: ${from}`);
})

app.get('/sync', (req, res) => { // handle GET requests at '/sync'
    const magic = req.query.magic;
    const from = req.query.from;
    let authorized = magic === process.env.magic;
    res.send(`magic: ${magic} -> authorized: ${authorized}, from: ${from}`);
});

// admin pages
app.get('/callback', function(req, res) {
    res.redirect("/admin");
});

app.get('/admin', function(req, res) {
    res.render('pages/admin', { req: req });
});

app.get('/admin/upload', function(req, res) {
    res.render('pages/upload', { req: req });
});

app.post('/admin/handle-json', function(req, res) {
    const json = req.body;
    try {
        if(json.status == 'ok') {
            // add or update cities
            json.cities.forEach((city) => City.upsert({uuid: city.UUID, nameEl: city.nameEl, nameEn: city.nameEn, lat: city.lat, lng: city.lng}));
            json.localities.forEach((locality) => Locality.upsert({uuid: locality.UUID, nameEl: locality.nameEl, nameEn: locality.nameEn, lat: locality.lat, lng: locality.lng, cityUuid: locality.cityUUID}));
            json.pharmacies.forEach((pharmacy) => Pharmacy.upsert({id: pharmacy.ID, name: pharmacy.name, address: pharmacy.address, addressPostalCode: pharmacy.addressPostalCode, addressDetails: pharmacy.addressDetails, lat: pharmacy.lat, lng: pharmacy.lng, localityUuid: pharmacy.localityUUID, phoneBusiness: pharmacy.phoneBusiness, phoneHome: pharmacy.phoneHome, active: pharmacy.active, gesy: false}));
            json['on-calls'].forEach((oncall) => OnCalls.upsert({date: oncall.date, pharmacies: oncall.pharmacies}));
            res.redirect('/admin');
        } else {
            res.status(403).setHeader('content-type', 'application/json').send(`{'error': 'invalid status in JSON'`);
        }
    } catch {
        res.status(403).setHeader('content-type', 'application/json').send(`{'error': 'could not process JSON'`);
    }
});

app.get('/admin/cities', function(req, res) {
    if(!req.oidc.isAuthenticated()) res.redirect('/login');
    City
        .findAll()
        .then(cities => res.render('pages/cities', { req: req, cities: cities }))
        .catch(error => res.status(500).send(`server error: ${error}`));
});

app.get('/admin/localities', function(req, res) {
    if(!req.oidc.isAuthenticated()) res.redirect('/login');
    City
        .findAll()
        .then(cities => {
            Locality
                .findAll()
                .then(localities => res.render('pages/localities', { req: req, cities: cities, localities: localities }))
        })
        .catch(error => res.status(500).send(`server error: ${error}`));
});


app.get('/admin/pharmacies', function(req, res) {
    if(!req.oidc.isAuthenticated()) res.redirect('/login');
    City
        .findAll()
        .then(cities => {
            Locality
                .findAll()
                .then(localities => {
                    Pharmacy
                        .findAll()
                        .then(pharmacies => res.render('pages/pharmacies', { req: req, cities: cities, localities: localities, pharmacies: pharmacies }))
                })
        })
        .catch(error => res.status(500).send(`server error: ${error}`));
});

app.get('/admin/oncalls', function(req, res) {
    if(!req.oidc.isAuthenticated()) res.redirect('/login');
    OnCalls
        .findAll()
        .then(oncalls => res.render('pages/oncalls', { req: req, oncalls: oncalls }))
        .catch(error => res.status(500).send(`server error: ${error}`));
});

app.use(express.static(path.join(__dirname, 'public')))
    .listen(PORT, () => console.log(`Listening on ${ PORT }`));
