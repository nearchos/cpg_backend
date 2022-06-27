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
app.use(express.urlencoded());
app.set('view engine', 'ejs'); // set the view engine to ejs

// index page
app.get('/', async (req, res) => { // handle GET requests at '/'
    try {
        // todo use caching
        let cities = await City.findAll();
        let localities= await Locality.findAll();
        let pharmacies = await Pharmacy.findAll();
        // todo edit dates so that it returns same date until next morning
        let dateNow = isEarlyHours() ? getYesterday() : getToday();
        let dateNextDay = isEarlyHours() ? getToday() : getTomorrow();
        let onCallNow = await OnCalls.findOne({where: {'date': dateNow}});
        let pharmacyIdsNow = onCallNow ? onCallNow.pharmacies.split(',') : [];
        let onCallNextDay = await OnCalls.findOne({where: {'date': dateNextDay}});
        let pharmacyIdsNextDay = onCallNextDay ? onCallNextDay.pharmacies.split(',') : [];
        res.render('pages/home', { cities: cities, localities: localities, pharmacies: pharmacies, pharmacyIdsNow: pharmacyIdsNow, pharmacyIdsNextDay: pharmacyIdsNextDay });
    } catch(err) {
        res.status(500).send({status: 'error', message: `database error: ${err}`});
    }
})

app.get('/pharmacy/:id', async (req, res) => {
    const { id } = req.params; // extract 'id' from URI request
    try {
        // todo use caching
        let pharmacy = await Pharmacy.findOne({where: {'id': id}});
        if(pharmacy==undefined) {
            res.status(404).render('pages/pharmacy_not_found', { id: id });
        } else {
            let localities= await Locality.findAll();
            let cities = await City.findAll();
    
            res.render('pages/pharmacy', { cities: cities, localities: localities, pharmacy: pharmacy});
        }
    } catch(err) {
        res.status(500).send({status: 'error', message: `database error: ${err}`});
    }
})

// API call
app.get('/api/sync', async (req, res) => { // handle GET requests at '/sync'
    const magic = req.query.magic;
    const from = req.query.from;
    let authorized = magic === process.env.magic;
    res.setHeader('Content-Type', 'application/json');
    if(authorized) {
        f = parseInt(from) || 0;
        if(f >= 0) {
            // todo check for cached copy
            try {
                let cities = await City.findAll();
                let localities= await Locality.findAll();
                let pharmacies = await Pharmacy.findAll();
                let oncalls = await OnCalls.findAll();
                let lastUpdated = Date.now();
                res.send(`{ "status": "ok", "cities": ${JSON.stringify(cities, replacer)}, "localities": ${JSON.stringify(localities, replacer)}, "pharmacies": ${JSON.stringify(pharmacies, replacer)}, "on-calls": ${JSON.stringify(oncalls, replacer)}, "lastUpdated": ${lastUpdated}}`);
            } catch(err) {
                res.status(500).send({status: 'error', message: `database error: ${err}`});
            }
        } else {
            res.status(400).send({status: 'error', message: 'invalid parameter - from must be a non-negative integer'});
        }
    } else {
        res.status(401).send({status: 'error', message: 'not authorized - check your magic'});
    }
});

// admin pages
app.get('/callback', function(req, res) {
    res.redirect("/admin");
});

app.get('/admin', function(req, res) {
    if(!req.oidc.isAuthenticated()) res.redirect('/login');
    res.render('pages/admin/admin', { req: req });
});

app.get('/admin/upload', function(req, res) {
    if(!req.oidc.isAuthenticated()) res.redirect('/login');
    res.render('pages/admin/upload', { req: req });
});

app.post('/admin/handle-json', function(req, res) {
    if(!req.oidc.isAuthenticated()) res.redirect('/login');
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
        .then(cities => res.render('pages/admin/cities', { req: req, cities: cities }))
        .catch(error => res.status(500).send(`server error: ${error}`));
});

app.get('/admin/city/:uuid', function(req, res) {
    if(!req.oidc.isAuthenticated()) res.redirect('/login');
    const { uuid } = req.params; // extract 'uuid' from URI request
    City
        .findOne({ where: {'uuid': uuid}})
        .then(city => res.render(`pages/admin/city`, { req: req, city: city }))
        .catch(error => res.status(500).send(`server error: ${error}`));
});

app.post('/admin/city/:uuid', function(req, res) {
    if(!req.oidc.isAuthenticated()) res.redirect('/login');
    const { uuid } = req.params; // extract 'uuid' from URI request

    if(req.body['cityNameEl'] && req.body['cityNameEn'] && req.body['cityLat'] && req.body['cityLng']) {
        City
            .findOne({ where: {'uuid': uuid}})
            .then(city => {
                City
                    .update({nameEl: `${req.body['cityNameEl']}`, nameEn: `${req.body['cityNameEn']}`, lat: `${req.body['cityLat']}`, lng: `${req.body['cityLng']}`}, { where: {uuid: uuid}})
                    .then(result => res.redirect(`/admin/city/${uuid}`))
            })
            .catch(error => res.status(500).send(`server error: ${error}`));
    } else {
        res.status(400).send('Invalid payload');
    }
});

app.get('/admin/localities', function(req, res) {
    if(!req.oidc.isAuthenticated()) res.redirect('/login');
    City
        .findAll()
        .then(cities => {
            Locality
                .findAll()
                .then(localities => res.render('pages/admin/localities', { req: req, cities: cities, localities: localities }))
        })
        .catch(error => res.status(500).send(`server error: ${error}`));
});

app.get('/admin/locality/:uuid', function(req, res) {
    if(!req.oidc.isAuthenticated()) res.redirect('/login');
    const { uuid } = req.params; // extract 'uuid' from URI request
    City
        .findAll()
        .then(cities => {
            Locality
                .findOne({ where: {'uuid': uuid}})
                .then(locality => res.render(`pages/admin/locality`, { req: req, locality: locality, cities: cities }))
                .catch(error => res.status(500).send(`server error: ${error}`));
            })
});

app.post('/admin/locality/:uuid', function(req, res) {
    if(!req.oidc.isAuthenticated()) res.redirect('/login');
    const { uuid } = req.params; // extract 'uuid' from URI request

    if(req.body['localityNameEl'] && req.body['localityNameEn'] && req.body['localityLat'] && req.body['localityLng'] && req.body['localityCityUuid']) {
        Locality
            .findOne({ where: {'uuid': uuid}})
            .then(locality => {
                Locality
                    .update({nameEl: `${req.body['localityNameEl']}`, nameEn: `${req.body['localityNameEn']}`, lat: `${req.body['localityLat']}`, lng: `${req.body['localityLng']}`, cityUuid: `${req.body['localityCityUuid']}`}, { where: {uuid: uuid}})
                    .then(result => res.redirect(`/admin/locality/${uuid}`))
            })
            .catch(error => res.status(500).send(`server error: ${error}`));
    } else {
        res.status(401).send('Invalid payload');
    }
});

app.get('/admin/pharmacies', function(req, res) {
    if(!req.oidc.isAuthenticated()) res.redirect('/login');
    const showInactive = req.query.showInactive != null; // extract 'showInactive' from URI request
    City
        .findAll()
        .then(cities => {
            Locality
                .findAll()
                .then(localities => {
                    Pharmacy
                        .findAll()
                        .then(pharmacies => res.render('pages/admin/pharmacies', { req: req, cities: cities, localities: localities, pharmacies: pharmacies, showInactive: showInactive }))
                })
        })
        .catch(error => res.status(500).send(`server error: ${error}`));
});

app.get('/admin/pharmacy/:id', function(req, res) {
    if(!req.oidc.isAuthenticated()) res.redirect('/login');
    const { id } = req.params; // extract 'id' from URI request
    Locality
        .findAll()
        .then(localities => {
            Pharmacy
                .findOne({ where: {'id': id}})
                .then(pharmacy => res.render(`pages/admin/pharmacy`, { req: req, pharmacy: pharmacy, localities: localities }))
                .catch(error => res.status(500).send(`server error: ${error}`));
            })
});

app.post('/admin/pharmacy/:id', function(req, res) {
    if(!req.oidc.isAuthenticated()) res.redirect('/login');
    const { id } = req.params; // extract 'id' from URI request

    if(req.body['pharmacyName'] && req.body['pharmacyAddress'] && req.body['pharmacyAddressPostalCode'] && req.body['pharmacyAddressDetails'] && 
        req.body['pharmacyLat'] && req.body['pharmacyLng'] && req.body['pharmacyLocalityUuid'] && req.body['pharmacyPhoneBusiness'] &&
        req.body['pharmacyPhoneHome']) {
        Pharmacy
            .findOne({ where: {'id': id}})
            .then(pharmacy => {
                Pharmacy
                    .update({
                        name: `${req.body['pharmacyName']}`,
                        address: `${req.body['pharmacyAddress']}`,
                        addressPostalCode: `${req.body['pharmacyAddressPostalCode']}`,
                        addressDetails: `${req.body['pharmacyAddressDetails']}`,
                        lat: `${req.body['pharmacyLat']}`,
                        lng: `${req.body['pharmacyLng']}`,
                        localityUuid: `${req.body['pharmacyLocalityUuid']}`,
                        phoneBusiness: `${req.body['pharmacyPhoneBusiness']}`,
                        phoneHome: `${req.body['pharmacyPhoneHome']}`,
                        active: `${req.body['pharmacyActive']}`===`on`,
                        gesy: `${req.body['pharmacyGesy']}`===`on`,
                        phone: `${req.body['pharmacyLocalityUuid']}`}, { where: {id: id}})
                    .then(result => res.redirect(`/admin/pharmacy/${id}`))
            })
            .catch(error => res.status(500).send(`server error: ${error}`));
    } else {
        console.log(`req.body: ${JSON.stringify(req.body)}`);
        res.status(401).send('Invalid payload');
    }
});

app.get('/admin/oncalls', function(req, res) {
    if(!req.oidc.isAuthenticated()) res.redirect('/login');
    OnCalls
        .findAll({order: [['date', 'ASC']]})
        .then(oncalls => res.render('pages/admin/oncalls', { req: req, oncalls: oncalls }))
        .catch(error => res.status(500).send(`server error: ${error}`));
});

app.get('/admin/oncall/:date', function(req, res) {
    if(!req.oidc.isAuthenticated()) res.redirect('/login');
    const { date } = req.params; // extract 'date' from URI request
    OnCalls
        .findOne({ where: {'date': date}})
        .then(oncall => {
            Locality
                .findAll()
                .then(localities => {
                    Pharmacy
                        .findAll()
                        .then(pharmacies => res.render('pages/admin/oncall', { req: req, oncall: oncall, pharmacies: pharmacies, localities: localities }))
                })
        })
        .catch(error => res.status(500).send(`server error: ${error}`));
});

app.post('/admin/oncall/:date', function(req, res) {
    if(!req.oidc.isAuthenticated()) res.redirect('/login');
    const { date } = req.params; // extract 'date' from URI request
    if(req.body['pharmacyIds']) {
        OnCalls
            .findOne({ where: {date: date}})
            .then(oncall => {
                OnCalls
                    .update({pharmacies: `${req.body['pharmacyIds']}`}, { where: {date: date}})
                    .then(result => res.redirect(`/admin/oncall/${date}`))
                    .catch(err => res.status(500).send(`error while updating OnCall entry for ${date}: ${err}`));
            })
            .catch(error => res.status(500).send(`server error: ${error}`));
    } else {
        res.status(400).send('Invalid payload');
    }
});

app.use(express.static(path.join(__dirname, 'public')))
    .listen(PORT, () => console.log(`Listening on ${ PORT }`));

function replacer(key, value) { // used in stringify to rename selected & ignore unneeded properties
    if (key=='createdAt') return undefined;
    else if (key=='updatedAt') return undefined;
    else return value;
}

function arePharmaciesOpen() {
    let date = new Date(new Date().toLocaleString("en-US", {timeZone: 'Asia/Nicosia'})); 
    let month = date.getMonth() + 1;
    let dayOfWeek = date.getDay(); // Sunday = 0, Monday = 1, ... 
    let isSummerTime = month >= 5 && month <= 9;
    let hour = date.getHours(); // 0..23
    let minute = date.getMinutes(); // 0..59
    let morningTime = hour >= 8 && (hour < 13 || (hour == 13 && minute <= 30)); // 8:00 to 13:30
    let afternoonTime = isSummerTime ?
        hour >= 16 && (hour < 19 || (hour == 19 && minute <= 30)) : // summer time 16:00 to 19:30
        hour >= 15 && (hour < 18 || (hour == 18 && minute <= 30));  // winter 15:00 to 18:30

    switch (dayOfWeek) {
        case 1: // Monday
        case 2: // Tuesday
        case 4: // Thursday
        case 5: // Friday
            return morningTime || afternoonTime;
        case 3: // Wednesday
        case 6: // Saturday
            return morningTime; // on Wed and Sat it's morning only
        case 0: // Sunday, closed on Sundays
        default:
            return false;
    }
}

function getNextClosingTime() {
    let date = new Date(new Date().toLocaleString("en-US", {timeZone: 'Asia/Nicosia'})); 
    let month = date.getMonth() + 1;
    let dayOfWeek = date.getDay(); // Sunday = 0, Monday = 1, ... 
    let isSummerTime = month >= 5 && month <= 9;
    let hour = date.getHours(); // 0..23
    let minute = date.getMinutes(); // 0..59
    let morningTime = hour >= 8 && (hour < 13 || (hour == 13 && minute <= 30)); // 8:00 to 13:30
    let afternoonTime = isSummerTime ?
        hour >= 16 && (hour < 19 || (hour == 19 && minute <= 30)) : // summer time 16:00 to 19:30
        hour >= 15 && (hour < 18 || (hour == 18 && minute <= 30));  // winter 15:00 to 18:30

    switch (dayOfWeek) {
        case 1: // Monday
        case 2: // Tuesday
        case 4: // Thursday
        case 5: // Friday
            if(morningTime)
                return "13:30";
            else if(afternoonTime)
                return isSummerTime ? "19:30" : "18:30";
        case 3: // Wednesday
        case 6: // Saturday
            return morningTime; // on Wed and Sat it's morning only
        case 0: // Sunday, closed on Sundays
        default:
            return false;
    }
}

function isEarlyHours() {
    let date = new Date(new Date().toLocaleString("en-US", {timeZone: 'Asia/Nicosia'})); 
    let hour = date.getHours(); // 0..23
    return hour < 8; // between midnight and 7:59
}

function getYesterday() {
    let now = new Date(new Date().toLocaleString("en-US", {timeZone: 'Asia/Nicosia'})); 
    let previousDay = new Date();
    previousDay.setDate(now.getDate() - 1);
    return previousDay.toISOString().substring(0, 10);
}

function getToday() {
    let now = new Date(new Date().toLocaleString("en-US", {timeZone: 'Asia/Nicosia'})); 
    return now.toISOString().substring(0, 10);
}

function getTomorrow() {
    let now = new Date(new Date().toLocaleString("en-US", {timeZone: 'Asia/Nicosia'})); 
    let nextDay = new Date();
    nextDay.setDate(now.getDate() + 1);
    return nextDay.toISOString().substring(0, 10);
}
