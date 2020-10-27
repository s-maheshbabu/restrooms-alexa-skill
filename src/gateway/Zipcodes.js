const { Map } = require('immutable');

let map;

module.exports.init = () => {
    return new Promise((resolve, reject) => {
        if (!map) {
            console.log("Zipcode to Lat/Lon database being loaded.");
            const data = require('./us-zip-code-latitude-and-longitude.json');

            const internalMap = Map();
            map = internalMap.withMutations(internalMap => {
                data.forEach(datum => {
                    internalMap.set(datum.zip, datum);
                });
            });
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
    if (!map.has(zipCode)) return null;

    const address = map.get(zipCode);
    return { latitude: address.latitude, longitude: address.longitude };
};
