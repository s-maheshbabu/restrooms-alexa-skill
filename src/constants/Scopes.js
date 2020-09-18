const scopes = Object.freeze({
    ADDRESS_SCOPE: "read::alexa:device:all:address:country_and_postal_code",
    EMAIL_SCOPE: "alexa::profile:email:read",
    GEO_LOCATION_SCOPE: "alexa::devices:all:geolocation:read",
});

module.exports = {
    scopes: scopes
};
