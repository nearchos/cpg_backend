const { Sequelize, DataTypes } = require('sequelize');

console.log(`process.env.DATABASE_URL: ${process.env.DATABASE_URL}`);
const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: "postgres"
});

sequelize
  .authenticate()
  .then(() => {
    console.log('Connection has been established successfully.');
  })
  .catch(err => {
    console.error('Unable to connect to the database:', err);
  });

const Pharmacy = sequelize.define('Pharmacy', {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    address: { type: DataTypes.STRING, allowNull: false },
    addressPostalCode: { type: DataTypes.STRING, allowNull: false },
    addressDetails: { type: DataTypes.STRING, allowNull: false },
    lat: { type: DataTypes.DOUBLE },
    lng: { type: DataTypes.DOUBLE },
    localityUuid: { type: DataTypes.STRING, allowNull: false },
    phoneBusiness: { type: DataTypes.STRING, allowNull: false },
    phoneHome: { type: DataTypes.STRING, allowNull: false },
    active: { type: DataTypes.BOOLEAN },
    gesy: { type: DataTypes.BOOLEAN }
}, {
    tableName: 'pharmacies'
});

const Locality = sequelize.define('Locality', {
    uuid: { type: DataTypes.STRING, primaryKey: true },
    nameEl: { type: DataTypes.STRING, require: true },
    nameEn: { type: DataTypes.STRING, require: true },
    lat: { type: DataTypes.DOUBLE },
    lng: { type: DataTypes.DOUBLE },
    cityUuid: { type: DataTypes.STRING, allowNull: false }
}, {
    tableName: 'localities'
});

const City = sequelize.define('City', {
    uuid: { type: DataTypes.STRING, primaryKey: true },
    nameEl: { type: DataTypes.STRING, require: true },
    nameEn: { type: DataTypes.STRING, require: true },
    lat: { type: DataTypes.DOUBLE },
    lng: { type: DataTypes.DOUBLE }
}, {
    tableName: 'cities'
});

const OnCalls = sequelize.define('OnCalls', {
    date: { type: DataTypes.STRING, primaryKey: true },
    pharmacies: { type: DataTypes.STRING, require: true }
}, {
    tableName: 'oncalls'
});

sequelize.sync();

module.exports = { sequelize, Pharmacy, Locality, City, OnCalls }