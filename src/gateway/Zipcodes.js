let zipCodesMap;
const ZIPCODE_DATABASE_LOAD_LATENCY = `zipcode-database-load-latency`;

module.exports.init = () => {
    return new Promise((resolve, reject) => {
        if (!zipCodesMap) {
            console.log("Zipcode to Lat/Lon database being loaded into memory.");

            console.time(ZIPCODE_DATABASE_LOAD_LATENCY);
            zipCodesMap = require('./us-zip-code-latitude-and-longitude.json');
            console.timeEnd(ZIPCODE_DATABASE_LOAD_LATENCY);

            resolve();
        } else {
            resolve();
        }
    });
};

/**
 * Returns latitude/longitude within the requested zipcode. The coordinates are usually
 * but not necessarily close to the center of the zipcode.
 * 
 * @param {*} zipCode The zipcode to lookup. Has to be a string.
 */
module.exports.getCoordinates = zipCode => {
    if (!zipCodesMap[zipCode]) return null;

    const coordinates = zipCodesMap[zipCode];
    return { latitude: coordinates[0], longitude: coordinates[1] };
};
